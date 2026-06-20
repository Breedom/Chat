let ws;
let username;

const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const joinBtn = document.getElementById('join-btn');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const messagesDiv = document.getElementById('messages');
const userList = document.getElementById('user-list');
const onlineCount = document.getElementById('online-count');
const imageBtn = document.getElementById('image-btn');
const fileBtn = document.getElementById('file-btn');
const videoBtn = document.getElementById('video-btn');
const videoInput = document.getElementById('video-input');
const imageInput = document.getElementById('image-input');
const fileInput = document.getElementById('file-input');
const emojiBtn = document.getElementById('emoji-btn');
const emojiPicker = document.getElementById('emoji-picker');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeModalBtn = document.getElementById('close-modal-btn');
const qrcodeDiv = document.getElementById('qrcode');
const currentUrlP = document.getElementById('current-url');

const emojis = ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘',
    '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐',
    '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👋', '🤚', '✋', '🖖', '👏', '🙌', '👐', '🤲',
    '❤️', '🔥', '💯', '🎉', '🎊', '✅', '⭐', '🌟', '💪', '🙏', '💕', '💗', '💖', '💝', '🤔', '😮'];

emojis.forEach(emoji => {
    const span = document.createElement('span');
    span.className = 'emoji-item';
    span.textContent = emoji;
    span.onclick = () => {
        messageInput.value += emoji;
        emojiPicker.style.display = 'none';
        messageInput.focus();
    };
    emojiPicker.querySelector('.emoji-grid').appendChild(span);
});

joinBtn.onclick = joinChat;
usernameInput.onkeypress = (e) => {
    if (e.key === 'Enter') joinChat();
};

function joinChat() {
    username = usernameInput.value.trim();
    if (!username) {
        alert('请输入昵称');
        return;
    }

    loginScreen.style.display = 'none';
    chatScreen.style.display = 'flex';

    connectWebSocket();
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${protocol}//${window.location.host}/ws?username=${encodeURIComponent(username)}`);

    ws.onopen = () => {
        addSystemMessage('已连接到聊天室');
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };

    ws.onclose = () => {
        addSystemMessage('连接已断开，3秒后尝试重连...');
        setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'message':
            addChatMessage(msg);
            break;
        case 'history':
            loadHistory(JSON.parse(msg.content));
            break;
        case 'user_list':
            updateUserList(JSON.parse(msg.content));
            break;
        case 'system':
            addSystemMessage(msg.content);
            break;
    }
}

function loadHistory(msgs) {
    msgs.forEach(m => {
        addChatMessage({
            type: 'message',
            username: m.username,
            content: m.content,
            data_type: m.data_type,
            time: m.time
        });
    });
    if (msgs.length > 0) {
        addSystemMessage(`已加载 ${msgs.length} 条历史消息`);
    }
}

function addChatMessage(msg) {
    const div = document.createElement('div');
    const isSelf = msg.username === username;
    div.className = `message ${isSelf ? 'message-self' : 'message-others'}`;

    const time = msg.time
        ? new Date(msg.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    let contentHTML = '';
    if (msg.data_type === 'image') {
        contentHTML = `
            <div class="message-content image">
                <img src="${msg.content}" onclick="previewImage(this.src)" loading="lazy">
            </div>`;
    } else if (msg.data_type === 'video') {
        contentHTML = `
            <div class="message-content video">
                <video src="${msg.content}" controls preload="metadata" playsinline></video>
            </div>`;
    } else if (msg.data_type === 'file') {
        const fileInfo = JSON.parse(msg.content);
        contentHTML = `
            <div class="message-content file">
                <span class="file-icon">📄</span>
                <div class="file-info">
                    <div class="file-name">${escapeHtml(fileInfo.name)}</div>
                    <div class="file-size">${formatFileSize(fileInfo.size)}</div>
                </div>
                <a href="${fileInfo.url}" class="file-download" download>下载</a>
            </div>`;
    } else {
        contentHTML = `<div class="message-content">${escapeHtml(msg.content)}</div>`;
    }

    div.innerHTML = `
        <div class="message-header">
            <span class="message-username">${escapeHtml(msg.username)}</span>
            <span class="message-time">${time}</span>
        </div>
        ${contentHTML}`;

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message-system';
    div.textContent = text;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateUserList(users) {
    userList.innerHTML = '';
    users.forEach(user => {
        const li = document.createElement('li');
        li.textContent = user;
        if (user === username) {
            li.style.background = 'rgba(102, 126, 234, 0.3)';
        }
        userList.appendChild(li);
    });
    onlineCount.textContent = `${users.length} 人在线`;
}

function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !ws) return;

    ws.send(JSON.stringify({
        type: 'message',
        username: username,
        content: content
    }));

    messageInput.value = '';
}

sendBtn.onclick = sendMessage;
messageInput.onkeypress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};

emojiBtn.onclick = (e) => {
    e.stopPropagation();
    emojiPicker.style.display = emojiPicker.style.display === 'none' ? 'block' : 'none';
};

imageBtn.onclick = () => imageInput.click();
videoBtn.onclick = () => videoInput.click();
fileBtn.onclick = () => fileInput.click();

imageInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        alert('请选择图片文件');
        return;
    }

    await uploadAndSendImage(file);
    imageInput.value = '';
};

videoInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('video/')) {
        alert('请选择视频文件');
        return;
    }

    await uploadAndSendVideo(file);
    videoInput.value = '';
};

async function uploadAndSendVideo(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', username);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        ws.send(JSON.stringify({
            type: 'message',
            username: username,
            content: result.url,
            data_type: 'video'
        }));
    } catch (error) {
        alert('上传失败: ' + error.message);
    }
}

fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', username);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        ws.send(JSON.stringify({
            type: 'message',
            username: username,
            content: JSON.stringify({
                url: result.url,
                name: file.name,
                size: file.size
            }),
            data_type: 'file'
        }));
    } catch (error) {
        alert('上传失败: ' + error.message);
    }

    fileInput.value = '';
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function previewImage(src) {
    const overlay = document.createElement('div');
    overlay.className = 'preview-overlay';
    overlay.onclick = () => overlay.remove();

    const img = document.createElement('img');
    img.src = src;

    overlay.appendChild(img);
    document.body.appendChild(overlay);
}

document.onclick = (e) => {
    if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
        emojiPicker.style.display = 'none';
    }
};

document.addEventListener('paste', async (e) => {
    const items = e.clipboardData.items;
    for (let item of items) {
        if (item.type.startsWith('image/')) {
            e.preventDefault();
            const file = item.getAsFile();
            await uploadAndSendImage(file);
            break;
        }
    }
});

async function uploadAndSendImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', username);

    try {
        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        ws.send(JSON.stringify({
            type: 'message',
            username: username,
            content: result.url,
            data_type: 'image'
        }));
    } catch (error) {
        alert('上传失败: ' + error.message);
    }
}

settingsBtn.onclick = () => {
    qrcodeDiv.innerHTML = '';
    const url = window.location.href;
    new QRCode(qrcodeDiv, {
        text: url,
        width: 200,
        height: 200,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.H
    });
    currentUrlP.textContent = url;
    settingsModal.style.display = 'flex';
};

closeModalBtn.onclick = () => {
    settingsModal.style.display = 'none';
};

settingsModal.onclick = (e) => {
    if (e.target === settingsModal) {
        settingsModal.style.display = 'none';
    }
};
