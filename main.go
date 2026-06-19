package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"

	"github.com/Breedom/Chat/server"
)

func getLocalIPs() []string {
	var ips []string
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ips
	}
	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
			if ipNet.IP.To4() != nil {
				ips = append(ips, ipNet.IP.String())
			}
		}
	}
	return ips
}

func main() {
	port := flag.Int("port", 8080, "Server port")
	staticDir := flag.String("static", "static", "Static files directory")
	uploadDir := flag.String("upload", "uploads", "Upload directory")
	flag.Parse()

	if _, err := os.Stat(*staticDir); os.IsNotExist(err) {
		log.Fatalf("Static directory does not exist: %s", *staticDir)
	}

	if err := os.MkdirAll(*uploadDir, 0755); err != nil {
		log.Fatalf("Failed to create upload directory: %v", err)
	}

	absStatic, _ := filepath.Abs(*staticDir)
	absUpload, _ := filepath.Abs(*uploadDir)

	addr := fmt.Sprintf(":%d", *port)
	srv := server.NewServer(addr, absStatic, absUpload)

	fmt.Println("========================================")
	fmt.Println("       局域网聊天室服务器")
	fmt.Println("========================================")
	fmt.Println()
	fmt.Println("本机访问:")
	fmt.Printf("  http://localhost:%d\n", *port)
	fmt.Println()
	fmt.Println("局域网访问:")
	ips := getLocalIPs()
	if len(ips) > 0 {
		for _, ip := range ips {
			fmt.Printf("  http://%s:%d\n", ip, *port)
		}
	} else {
		fmt.Println("  未检测到局域网IP")
	}
	fmt.Println()
	fmt.Println("========================================")
	fmt.Println()

	if err := srv.Start(); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
