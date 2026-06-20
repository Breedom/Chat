package server

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gorilla/websocket"
)

var hmacKey = []byte("chat-room-secret-2024")

func generateToken(username string) string {
	mac := hmac.New(sha256.New, hmacKey)
	mac.Write([]byte(username))
	return hex.EncodeToString(mac.Sum(nil))
}

func validateToken(token, username string) bool {
	expected := generateToken(username)
	return hmac.Equal([]byte(token), []byte(expected))
}

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

var allowedExts = map[string]bool{
	".jpg": true, ".jpeg": true, ".png": true, ".gif": true, ".webp": true, ".bmp": true,
	".mp4": true, ".webm": true, ".ogg": true, ".mov": true, ".avi": true, ".mkv": true,
	".pdf": true, ".doc": true, ".docx": true, ".xls": true, ".xlsx": true, ".ppt": true, ".pptx": true,
	".txt": true, ".md": true, ".zip": true, ".rar": true,
}

type Server struct {
	hub       *Hub
	addr      string
	staticDir string
	uploadDir string
	store     *MessageStore
	httpServer *http.Server
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
	go s.store.StartFlusher()

	http.HandleFunc("/ws", s.handleWebSocket)
	http.HandleFunc("/upload", s.handleUpload)
	http.HandleFunc("/upload-chunk", s.handleUploadChunk)
	http.HandleFunc("/upload-complete", s.handleUploadComplete)
	http.HandleFunc("/files/", s.handleFileServer)
	http.HandleFunc("/", s.handleStatic)

	s.httpServer = &http.Server{Addr: s.addr}
	return s.httpServer.ListenAndServe()
}

func (s *Server) Stop() {
	if s.httpServer != nil {
		s.httpServer.Shutdown(context.Background())
	}
}

func (s *Server) handleWebSocket(w http.ResponseWriter, r *http.Request) {
	username := r.URL.Query().Get("username")
	if username == "" {
		http.Error(w, "username required", http.StatusBadRequest)
		return
	}

	token := r.URL.Query().Get("token")
	if token == "" || !validateToken(token, username) {
		http.Error(w, "unauthorized", http.StatusUnauthorized)
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
	log.Printf("GET %s", r.URL.Path)
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

	// 检查文件扩展名白名单
	ext := strings.ToLower(filepath.Ext(handler.Filename))
	if !allowedExts[ext] {
		http.Error(w, "File type not allowed", http.StatusBadRequest)
		return
	}

	// 安全清理文件名，防止路径穿越
	cleanName := filepath.Base(handler.Filename)
	cleanName = strings.ReplaceAll(cleanName, "/", "")
	cleanName = strings.ReplaceAll(cleanName, "\\", "")
	if cleanName == "." || cleanName == ".." || cleanName == "" {
		http.Error(w, "Invalid filename", http.StatusBadRequest)
		return
	}

	filename := fmt.Sprintf("%s_%s", r.FormValue("username"), cleanName)
	savePath := filepath.Join(s.uploadDir, filename)

	dst, err := os.Create(savePath)
	if err != nil {
		http.Error(w, "Error saving file", http.StatusInternalServerError)
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Error saving file", http.StatusInternalServerError)
		return
	}

	fileURL := fmt.Sprintf("/files/%s", filename)
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

	file, _, err := r.FormFile("chunk")
	if err != nil {
		http.Error(w, "Error reading chunk", http.StatusBadRequest)
		return
	}
	defer file.Close()

	chunkDir := filepath.Join(s.uploadDir, "chunks", uploadID)
	os.MkdirAll(chunkDir, 0755)
	chunkPath := filepath.Join(chunkDir, chunkIndex)

	dst, err := os.Create(chunkPath)
	if err != nil {
		http.Error(w, "Error saving chunk", http.StatusInternalServerError)
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		http.Error(w, "Error saving chunk", http.StatusInternalServerError)
		return
	}

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

	chunkDir := filepath.Join(s.uploadDir, "chunks", uploadID)
	defer os.RemoveAll(chunkDir)

	finalName := fmt.Sprintf("%s_%s", user, filename)
	finalPath := filepath.Join(s.uploadDir, finalName)

	dst, err := os.Create(finalPath)
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
		if _, err := dst.Write(data); err != nil {
			http.Error(w, fmt.Sprintf("Error writing chunk %d", i), http.StatusInternalServerError)
			return
		}
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
		original := s.store.GetMessage(msg.MsgID)
		if original == nil || original.Username != msg.Username {
			return
		}
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
