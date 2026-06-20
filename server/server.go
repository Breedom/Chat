package server

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"path/filepath"
	"strings"

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

	http.HandleFunc("/ws", s.handleWebSocket)
	http.HandleFunc("/upload", s.handleUpload)
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

	filename := fmt.Sprintf("%s_%s", r.FormValue("username"), handler.Filename)
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
