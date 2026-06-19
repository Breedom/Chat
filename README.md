# 局域网聊天室

一个基于Go语言的局域网聊天软件，支持图片发送和文件传输。

## 功能特性

- 实时聊天：基于WebSocket的实时通信
- 图片发送：支持发送和预览图片
- 文件传输：支持发送和下载任意文件
- 在线用户列表：显示当前在线用户
- 表情支持：内置表情选择器
- 响应式设计：支持移动端访问

## 技术栈

- 后端：Go + gorilla/websocket
- 前端：HTML + CSS + JavaScript
- 通信：WebSocket (实时消息) + HTTP (文件上传)

## 快速开始

### 1. 安装依赖

```bash
go mod tidy
```

### 2. 编译运行

```bash
go build -o chat.exe .
./chat.exe
```

或直接运行：

```bash
go run main.go
```

### 3. 访问应用

启动后会显示访问地址：

```
========================================
       局域网聊天室服务器
========================================

本机访问:
  http://localhost:8080

局域网访问:
  http://192.168.1.100:8080

========================================
```

在局域网内，其他设备可以通过显示的IP地址访问聊天室。

## 命令行参数

```
-port       服务器端口 (默认: 8080)
-static     静态文件目录 (默认: static)
-upload     上传文件目录 (默认: uploads)
```

示例：

```bash
./chat.exe -port 9090 -static static -upload uploads
```

## 项目结构

```
Chat/
├── main.go           # 主入口
├── go.mod           # Go模块文件
├── server/
│   ├── server.go    # 服务器主逻辑
│   ├── hub.go       # WebSocket消息中心
│   ├── client.go    # WebSocket客户端
│   └── utils.go     # 工具函数
├── static/
│   ├── index.html   # 主页面
│   ├── style.css    # 样式
│   └── script.js    # JavaScript
└── uploads/         # 上传文件目录
```

## 使用说明

1. 输入昵称加入聊天室
2. 在输入框输入消息，点击发送或按Enter键发送
3. 点击😀按钮选择表情
4. 点击🖼️按钮发送图片
5. 点击📎按钮发送文件
6. 点击图片可预览大图
7. 点击文件的下载按钮可下载文件

## 许可证

MIT License
