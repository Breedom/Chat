package server

import (
	"encoding/json"
	"log"
	"sync"
)

type Message struct {
	Type     string            `json:"type"`
	Username string            `json:"username"`
	Content  string            `json:"content"`
	DataType string            `json:"data_type,omitempty"`
	To       string            `json:"to,omitempty"`
	ReplyTo  string            `json:"reply_to,omitempty"`
	Reaction string            `json:"reaction,omitempty"`
	MsgID    string            `json:"msg_id,omitempty"`
	Callback string            `json:"callback,omitempty"`
}

type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	private    chan []byte
	register   chan *Client
	unregister chan *Client
	store      *MessageStore
	reactions  map[string]map[string]string // msgID -> {username: emoji}
	mu         sync.RWMutex
}

func NewHub(store *MessageStore) *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte, 256),
		private:    make(chan []byte, 256),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		store:      store,
		reactions:  make(map[string]map[string]string),
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
			var toRemove []*Client
			h.mu.RLock()
			for client := range h.clients {
				select {
				case client.send <- message:
				default:
					toRemove = append(toRemove, client)
				}
			}
			h.mu.RUnlock()
			if len(toRemove) > 0 {
				h.mu.Lock()
				for _, client := range toRemove {
					if _, ok := h.clients[client]; ok {
						close(client.send)
						delete(h.clients, client)
					}
				}
				h.mu.Unlock()
			}

		case data := <-h.private:
			var msg Message
			if err := json.Unmarshal(data, &msg); err != nil {
				continue
			}
			var toRemove []*Client
			h.mu.RLock()
			for client := range h.clients {
				if client.username == msg.To || client.username == msg.Username {
					select {
					case client.send <- data:
					default:
						toRemove = append(toRemove, client)
					}
				}
			}
			h.mu.RUnlock()
			if len(toRemove) > 0 {
				h.mu.Lock()
				for _, client := range toRemove {
					if _, ok := h.clients[client]; ok {
						close(client.send)
						delete(h.clients, client)
					}
				}
				h.mu.Unlock()
			}
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

func (h *Hub) sendPrivate(data []byte) {
	h.private <- data
}

func (h *Hub) broadcastTyping(username string) {
	msg := Message{
		Type:     "typing",
		Username: username,
	}
	data, _ := json.Marshal(msg)
	h.mu.RLock()
	for client := range h.clients {
		if client.username != username {
			select {
			case client.send <- data:
			default:
			}
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) broadcastStopTyping(username string) {
	msg := Message{
		Type:     "stop_typing",
		Username: username,
	}
	data, _ := json.Marshal(msg)
	h.mu.RLock()
	for client := range h.clients {
		if client.username != username {
			select {
			case client.send <- data:
			default:
			}
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) sendToUser(username string, data []byte) {
	h.mu.RLock()
	for client := range h.clients {
		if client.username == username {
			select {
			case client.send <- data:
			default:
			}
			break
		}
	}
	h.mu.RUnlock()
}

func (h *Hub) notifyMention(content, sender string) {
	for i := 0; i < len(content)-1; i++ {
		if content[i] == '@' {
			name := ""
			for j := i + 1; j < len(content); j++ {
				if content[j] == ' ' || content[j] == ',' || content[j] == '.' || content[j] == '\n' {
					break
				}
				name += string(content[j])
			}
			if name == "" {
				continue
			}
			msg := Message{
				Type:     "mention",
				Username: sender,
				Content:  name,
			}
			data, _ := json.Marshal(msg)
			h.mu.RLock()
			for client := range h.clients {
				if client.username == name {
					select {
					case client.send <- data:
					default:
					}
				}
			}
			h.mu.RUnlock()
			i += len(name)
		}
	}
}

func (h *Hub) handleReaction(msg Message) {
	if msg.MsgID == "" || msg.Reaction == "" {
		return
	}
	h.mu.Lock()
	if h.reactions[msg.MsgID] == nil {
		h.reactions[msg.MsgID] = make(map[string]string)
	}
	if h.reactions[msg.MsgID][msg.Username] == msg.Reaction {
		delete(h.reactions[msg.MsgID], msg.Username)
	} else {
		h.reactions[msg.MsgID][msg.Username] = msg.Reaction
	}
	reactions := h.reactions[msg.MsgID]
	h.mu.Unlock()

	update := Message{
		Type:    "reaction_update",
		MsgID:   msg.MsgID,
		Content: mustMarshal(reactions),
	}
	data, _ := json.Marshal(update)
	h.mu.RLock()
	for client := range h.clients {
		select {
		case client.send <- data:
		default:
		}
	}
	h.mu.RUnlock()
}

func mustMarshal(v interface{}) string {
	data, err := json.Marshal(v)
	if err != nil {
		return "[]"
	}
	return string(data)
}
