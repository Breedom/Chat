package server

import (
	"context"
	"log"
	"os"
	"strings"
	"sync"

	"github.com/go-deepseek/deepseek"
	"github.com/go-deepseek/deepseek/request"
)

var (
	aiClient    deepseek.Client
	aiEnabled   bool
	chatHistory = make(map[string][]*request.Message)
	historyMu   sync.RWMutex
)

func InitAI() {
	apiKey := os.Getenv("DEEPSEEK_API_KEY")
	if apiKey == "" {
		log.Println("DEEPSEEK_API_KEY not set, AI features disabled")
		return
	}

	client, err := deepseek.NewClient(apiKey)
	if err != nil {
		log.Printf("Failed to init DeepSeek client: %v", err)
		return
	}

	aiClient = client
	aiEnabled = true
	log.Println("DeepSeek AI enabled")
}

func IsAIMessage(content string) bool {
	return strings.HasPrefix(strings.ToLower(content), "@deepseek")
}

func GetAIResponse(username, content string) (string, error) {
	if !aiEnabled {
		return "AI功能未启用，请设置 DEEPSEEK_API_KEY 环境变量", nil
	}

	query := strings.TrimSpace(strings.TrimPrefix(strings.TrimPrefix(content, "@deepseek"), "@Deepseek"))

	historyMu.Lock()
	history := chatHistory[username]
	if len(history) > 20 {
		history = history[len(history)-20:]
	}
	historyMu.Unlock()

	messages := []*request.Message{
		{
			Role:    "system",
			Content: "你是一个友善的AI助手，名叫DeepSeek。你在局域网聊天室中帮助用户解答问题。回答要简洁友好，使用中文。",
		},
	}

	messages = append(messages, history...)

	messages = append(messages, &request.Message{
		Role:    "user",
		Content: query,
	})

	chatReq := &request.ChatCompletionsRequest{
		Model:    deepseek.DEEPSEEK_CHAT_MODEL,
		Stream:   false,
		Messages: messages,
	}

	chatResp, err := aiClient.CallChatCompletionsChat(context.Background(), chatReq)
	if err != nil {
		log.Printf("DeepSeek API error: %v", err)
		return "抱歉，AI服务暂时不可用，请稍后再试。", nil
	}

	if len(chatResp.Choices) == 0 {
		return "抱歉，AI没有返回结果。", nil
	}

	response := chatResp.Choices[0].Message.Content

	historyMu.Lock()
	chatHistory[username] = append(history,
		&request.Message{Role: "user", Content: query},
		&request.Message{Role: "assistant", Content: response},
	)
	historyMu.Unlock()

	return response, nil
}
