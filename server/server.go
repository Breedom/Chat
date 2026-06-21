package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

var videoExts = map[string]bool{
	".mp4": true, ".webm": true, ".ogg": true, ".mov": true, ".avi": true, ".mkv": true,
}

// uploadIDRe restricts upload IDs to safe alphanumeric tokens.
var uploadIDRe = regexp.MustCompile(`^[a-zA-Z0-9]+$`)

// sanitizeFilename strips directory separators and ".." components to prevent
// path traversal. Returns "unnamed" if the result is empty.
func sanitizeFilename(name string) string {
	// Strip any directory components the client may have included.
	name = filepath.Base(name)
	// Replace characters that could be used for traversal or are problematic.
	replacer := strings.NewReplacer(
		"..", "",
		"/", "_",
		`\`, "_",
		":", "_",
		"*", "_",
		"?", "_",
		"\"", "_",
		"<", "_",
		">", "_",
		"|", "_",
	)
	name = replacer.Replace(name)
	name = strings.TrimSpace(name)
	if name == "" || name == "." || name == "_" {
		name = "unnamed"
	}
	return name
}

// isSafeUploadID checks that an upload ID contains only safe characters.
func isSafeUploadID(id string) bool {
	return id != "" && uploadIDRe.MatchString(id)
}

// cleanOrphanedChunks removes chunk directories older than the given duration.
func cleanOrphanedChunks(uploadDir string, maxAge time.Duration) {
	chunksDir := filepath.Join(uploadDir, "chunks")
	entries, err := os.ReadDir(chunksDir)
	if err != nil {
		return
	}
	now := time.Now()
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		info, err := entry.Info()
		if err != nil {
			continue
		}
		if now.Sub(info.ModTime()) > maxAge {
			os.RemoveAll(filepath.Join(chunksDir, entry.Name()))
			log.Printf("Cleaned orphaned chunk dir: %s", entry.Name())
		}
	}
}

type Server struct {
	hub       *Hub
	addr      string
	staticDir string
	uploadDir string
	store     *MessageStore
}

func NewServer(addr, staticDir, uploadDir string) *Server {
	store := NewMessageStore(uploadDir)
	return &Server{
		hub:       NewHub(store),
		addr:      addr,
		staticDir: staticDir,
		uploadDir: uploadDir,
		store:     store,
	}
}

func (s *Server) Start() error {
	go s.hub.Run()

	// Clean up orphaned chunks from previous runs on startup.
	cleanOrphanedChunks(s.uploadDir, 1*time.Hour)

	http.HandleFunc("/ws", s.handleWebSocket)
	http.HandleFunc("/upload", s.handleUpload)
	http.HandleFunc("/upload-chunk", s.handleUploadChunk)
	http.HandleFunc("/upload-complete", s.handleUploadComplete)
	http.HandleFunc("/files/", s.handleFileServer)
	http.HandleFunc("/", s.handleStatic)

	return http.ListenAndServe(s.addr, nil)
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, "username required", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}

	client := NewClient(s.hub, conn, username)
	client.onMessage = s.handleBroadcast
	s.hub.register <- client

	go client.WritePump()
	go client.ReadPump()
}

func (s *Server) handleStatic(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		http.ServeFile(w, r, filepath.Join(s.staticDir, "index.html"))
		return
	}
	http.StripPrefix("/", http.FileServer(http.Dir(s.staticDir))).ServeHTTP(w, r)
}

func (s *Server) handleUpload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	r.ParseMultipartForm(32 << 20) // 32MB max

	file, handler, err := r.FormFile("file")
	if err != nil {
		http.Error(w, "Error reading file", http.StatusBadRequest)
		return
	}
	defer file.Close()

	username := sanitizeFilename(r.FormValue("username"))
	safeName := sanitizeFilename(handler.Filename)
	filename := fmt.Sprintf("%s_%s", username, safeName)
	savePath := filepath.Join(s.uploadDir, filename)

	dst, err := createFile(savePath)
	if err != nil {
		http.Error(w, "Error saving file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := copyFile(dst, file); err != nil {
		http.Error(w, "Error saving file", http.StatusInternalServerError)
		return
	}

	fileURL := fmt.Sprintf("/files/%s", filename)
	ext := strings.ToLower(filepath.Ext(handler.Filename))
	isVideo := videoExts[ext]

	w.Header().Set("Content-Type", "application/json")
	resp := fmt.Sprintf(`{"url":"%s","name":"%s","video":%t}`, fileURL, handler.Filename, isVideo)
	w.Write([]byte(resp))
}

func (s *Server) handleFileServer(w http.ResponseWriter, r *http.Request) {
	http.StripPrefix("/files/", http.FileServer(http.Dir(s.uploadDir))).ServeHTTP(w, r)
}

func (s *Server) handleUploadChunk(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	r.ParseMultipartForm(64 << 20)

	uploadID := r.FormValue("upload_id")
	chunkIndex := r.FormValue("chunk_index")
	totalChunks := r.FormValue("total_chunks")
	filename := r.FormValue("filename")
	user := r.FormValue("username")

	if !isSafeUploadID(uploadID) {
		http.Error(w, "Invalid upload_id", http.StatusBadRequest)
		return
	}

	file, _, err := r.FormFile("chunk")
	if err != nil {
		http.Error(w, "Error reading chunk", http.StatusBadRequest)
		return
	}
	defer file.Close()

	chunkDir := filepath.Join(s.uploadDir, "chunks", uploadID)
	os.MkdirAll(chunkDir, 0755)
	chunkPath := filepath.Join(chunkDir, chunkIndex)

	dst, err := createFile(chunkPath)
	if err != nil {
		http.Error(w, "Error saving chunk", http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	copyFile(dst, file)

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(fmt.Sprintf(`{"ok":true,"chunk":"%s","total":"%s"}`, chunkIndex, totalChunks)))
	_ = user
	_ = filename
}

func (s *Server) handleUploadComplete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	r.ParseMultipartForm(4096)

	uploadID := r.FormValue("upload_id")
	filename := r.FormValue("filename")
	user := r.FormValue("username")
	totalChunks := 0
	fmt.Sscanf(r.FormValue("total_chunks"), "%d", &totalChunks)

	if !isSafeUploadID(uploadID) {
		http.Error(w, "Invalid upload_id", http.StatusBadRequest)
		return
	}

	chunkDir := filepath.Join(s.uploadDir, "chunks", uploadID)
	defer os.RemoveAll(chunkDir)

	username := sanitizeFilename(user)
	safeName := sanitizeFilename(filename)
	finalName := fmt.Sprintf("%s_%s", username, safeName)
	finalPath := filepath.Join(s.uploadDir, finalName)

	dst, err := createFile(finalPath)
	if err != nil {
		http.Error(w, "Error creating file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	for i := 0; i < totalChunks; i++ {
		chunkPath := filepath.Join(chunkDir, fmt.Sprintf("%d", i))
		data, err := os.ReadFile(chunkPath)
		if err != nil {
			http.Error(w, fmt.Sprintf("Missing chunk %d", i), http.StatusInternalServerError)
			return
		}
		dst.Write(data)
	}

	fileURL := fmt.Sprintf("/files/%s", finalName)
	ext := strings.ToLower(filepath.Ext(filename))
	isVideo := videoExts[ext]

	w.Header().Set("Content-Type", "application/json")
	resp := fmt.Sprintf(`{"url":"%s","name":"%s","video":%t}`, fileURL, filename, isVideo)
	w.Write([]byte(resp))
}

func (s *Server) handleBroadcast(data []byte) {
	var msg Message
	if err := json.Unmarshal(data, &msg); err != nil {
		return
	}

	switch msg.Type {
	case "message":
		s.store.Append(msg)
		s.hub.broadcast <- data
		if strings.Contains(msg.Content, "@") {
			s.hub.notifyMention(msg.Content, msg.Username)
		}
	case "private":
		s.store.Append(msg)
		s.hub.sendPrivate(data)
	case "typing":
		s.hub.broadcastTyping(msg.Username)
	case "stop_typing":
		s.hub.broadcastStopTyping(msg.Username)
	case "reaction":
		s.hub.handleReaction(msg)
	case "recall":
		s.store.Recall(msg.MsgID)
		s.hub.broadcast <- data
	case "export":
		msgs := s.store.GetRecent()
		exportData, _ := json.Marshal(msgs)
		resp := Message{Type: "export_data", Content: string(exportData)}
		respData, _ := json.Marshal(resp)
		s.hub.sendToUser(msg.Username, respData)
	default:
		s.hub.broadcast <- data
	}
}