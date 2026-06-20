package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"

	"github.com/Breedom/Chat/server"
	"github.com/mdp/qrterminal/v3"
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

	addr := fmt.Sprintf("0.0.0.0:%d", *port)
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

	fmt.Println("手机扫码访问:")
	for _, ip := range ips {
		url := fmt.Sprintf("http://%s:%d", ip, *port)
		fmt.Printf("\n  [%s]\n", ip)
		qrterminal.GenerateWithConfig(url, qrterminal.Config{
			Level:     qrterminal.L,
			Writer:    os.Stdout,
			QuietZone: 1,
		})
	}

	fmt.Println()
	fmt.Println("提示: 如果其他设备无法访问，请检查Windows防火墙")
	fmt.Println("  以管理员身份运行:")
	fmt.Printf("  netsh advfirewall firewall add rule name=\"Chat\" dir=in action=allow protocol=TCP localport=%d\n", *port)
	fmt.Println()
	fmt.Println("========================================")
	fmt.Println()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-quit
		fmt.Println("\n正在关闭服务器...")
		srv.Stop()
	}()

	if err := srv.Start(); err != nil {
		log.Fatalf("Server failed to start: %v", err)
	}
}
