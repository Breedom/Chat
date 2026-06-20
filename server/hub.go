package server

import (
	"encoding/json"
	"log"
	"sync"
)

type Message struct {
	Type     string `json:"type"`
	Username string `json:"username"`
	Content  string `json:"content"`
	DataType string `json:"data_type,omitempty"`
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	store      *MessageStore
	mu         sync.RWMutex
}

func NewHub(store *MessageStore) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		store:      store,
	}
}

func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			h.clients[client] = true
			h.mu.Unlock()
			log.Printf("Client connected: %s", client.username)
			h.sendHistory(client)
			h.sendUserList()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
			}
			h.mu.Unlock()
			log.Printf("Client disconnected: %s", client.username)
			h.sendUserList()

		case message := <-h.broadcast:
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
			h.mu.RUnlock()
		}
	}
}

func (h *Hub) sendHistory(client *Client) {
	msgs := h.store.GetRecent()
	if len(msgs) == 0 {
		return
	}
	data, err := json.Marshal(msgs)
	if err != nil {
		return
	}
	wrapper := Message{
		Type:    "history",
		Content: string(data),
	}
	wrapperData, _ := json.Marshal(wrapper)
	select {
	case client.send <- wrapperData:
	default:
	}
}

func (h *Hub) sendUserList() {
	h.mu.RLock()
	users := make([]string, 0, len(h.clients))
	for client := range h.clients {
		users = append(users, client.username)
	}
	h.mu.RUnlock()

	msg := Message{
		Type:    "user_list",
		Content: mustMarshal(users),
	}
	data, _ := json.Marshal(msg)
	h.broadcast <- data
}

func mustMarshal(v interface{}) string {
	data, err := json.Marshal(v)
	if err != nil {
		return "[]"
	}
	return string(data)
}
