package server

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

const (
	maxStoredMessages = 200
	messageStoreFile  = "messages.json"
)

type StoredMessage struct {
	Type     string `json:"type"`
	Username string `json:"username"`
	Content  string `json:"content"`
	DataType string `json:"data_type,omitempty"`
	Time     string `json:"time"`
}

type MessageStore struct {
	mu       sync.RWMutex
	messages []StoredMessage
	filePath string
}

func NewMessageStore(uploadDir string) *MessageStore {
	ms := &MessageStore{
		filePath: uploadDir + "/" + messageStoreFile,
	}
	ms.load()
	return ms
}

func (ms *MessageStore) load() {
	data, err := os.ReadFile(ms.filePath)
	if err != nil {
		ms.messages = make([]StoredMessage, 0, maxStoredMessages)
		return
	}
	var msgs []StoredMessage
	if err := json.Unmarshal(data, &msgs); err != nil {
		ms.messages = make([]StoredMessage, 0, maxStoredMessages)
		return
	}
	if len(msgs) > maxStoredMessages {
		msgs = msgs[len(msgs)-maxStoredMessages:]
	}
	ms.messages = msgs
}

func (ms *MessageStore) save() {
	data, err := json.MarshalIndent(ms.messages, "", "  ")
	if err != nil {
		return
	}
	os.WriteFile(ms.filePath, data, 0644)
}

func (ms *MessageStore) Append(msg Message) {
	sm := StoredMessage{
		Type:     msg.Type,
		Username: msg.Username,
		Content:  msg.Content,
		DataType: msg.DataType,
		Time:     time.Now().Format(time.RFC3339),
	}

	ms.mu.Lock()
	ms.messages = append(ms.messages, sm)
	if len(ms.messages) > maxStoredMessages {
		ms.messages = ms.messages[len(ms.messages)-maxStoredMessages:]
	}
	ms.mu.Unlock()

	ms.save()
}

func (ms *MessageStore) GetRecent() []StoredMessage {
	ms.mu.RLock()
	defer ms.mu.RUnlock()

	result := make([]StoredMessage, len(ms.messages))
	copy(result, ms.messages)
	return result
}
