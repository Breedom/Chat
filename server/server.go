package server

import (
	"fmt"
	"log"
	"net/http"
	"path/filepath"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Server struct {
	hub    *Hub
	addr   string
	staticDir string
	uploadDir  string
}

func NewServer(addr, staticDir, uploadDir string) *Server {
	return &Server{
		hub:       NewHub(),
		addr:      addr,
		staticDir: staticDir,
		uploadDir: uploadDir,
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
	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(fmt.Sprintf(`{"url":"%s","name":"%s"}`, fileURL, handler.Filename)))
}

func (s *Server) handleFileServer(w http.ResponseWriter, r *http.Request) {
	http.StripPrefix("/files/", http.FileServer(http.Dir(s.uploadDir))).ServeHTTP(w, r)
}
