let ws;
let username;
let privateTarget = null;
let typingTimeout = null;
let isTyping = false;
let replyingTo = null;

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
const chatTitle = document.getElementById('chat-title');
const backBtn = document.getElementById('back-btn');
const privateHint = document.getElementById('private-hint');
const privateTargetSpan = document.getElementById('private-target');
const typingIndicator = document.getElementById('typing-indicator');

const emojis = ['😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘',
    '😗', '😙', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐',
    '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮',
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👋', '🤚', '✋', '🖖', '👏', '🙌', '👐', '🤲',
    '❤️', '🔥', '💯', '🎉', '🎊', '✅', '⭐', '🌟', '💪', '🙏', '💕', '💗', '💖', '💝', '🤔', '😮'];

const quickReactions = ['👍', '❤️', '😂', '😮', '😢', '🎉'];

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

    ws.onopen = () => addSystemMessage('已连接到聊天室');
    ws.onmessage = (event) => handleMessage(JSON.parse(event.data));
    ws.onclose = () => {
        addSystemMessage('连接已断开，3秒后尝试重连...');
        setTimeout(connectWebSocket, 3000);
    };
    ws.onerror = (error) => console.error('WebSocket error:', error);
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'message':
            if (!privateTarget) addChatMessage(msg);
            break;
        case 'private':
            addPrivateMessage(msg);
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
        case 'typing':
            showTyping(msg.username);
            break;
        case 'stop_typing':
            hideTyping(msg.username);
            break;
        case 'mention':
            showMentionNotification(msg.username, msg.content);
            break;
        case 'reaction_update':
            updateReactions(msg.msg_id, JSON.parse(msg.content));
            break;
    }
}

function loadHistory(msgs) {
    msgs.forEach(m => {
        if (m.type === 'private') {
            if (privateTarget && (m.to === privateTarget || m.username === privateTarget)) {
                addPrivateMessage(m);
            }
        } else {
            if (!privateTarget) addChatMessage(m);
        }
    });
    if (msgs.length > 0) addSystemMessage(`已加载 ${msgs.length} 条历史消息`);
}

function generateMsgId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function highlightMentions(text) {
    return escapeHtml(text).replace(/@(\S+)/g, '<span class="mention">@$1</span>');
}

function renderContent(msg, isSelf) {
    if (msg.data_type === 'image') {
        return `<div class="message-content image">
            <img src="${msg.content}" onclick="previewImage(this.src)" loading="lazy">
        </div>`;
    }
    if (msg.data_type === 'video') {
        return `<div class="message-content video">
            <video src="${msg.content}" controls preload="metadata" playsinline></video>
        </div>`;
    }
    if (msg.data_type === 'file') {
        const fi = JSON.parse(msg.content);
        return `<div class="message-content file">
            <span class="file-icon">📄</span>
            <div class="file-info">
                <div class="file-name">${escapeHtml(fi.name)}</div>
                <div class="file-size">${formatFileSize(fi.size)}</div>
            </div>
            <a href="${fi.url}" class="file-download" download>下载</a>
        </div>`;
    }
    return `<div class="message-content">${formatText(msg.content, isSelf)}</div>`;
}

function formatText(text, isSelf) {
    let html = highlightMentions(text);
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
        const langLabel = lang || 'plaintext';
        return `<div class="code-block"><div class="code-lang">${langLabel}</div><pre><code class="language-${langLabel}">${code.trim()}</code></pre></div>`;
    });
    html = html.replace(/`([^`\n]+)`/g, '<code class="inline-code">$1</code>');
    return html;
}

function addChatMessage(msg) {
    const div = document.createElement('div');
    const isSelf = msg.username === username;
    const msgId = msg.msg_id || generateMsgId();
    div.className = `message ${isSelf ? 'message-self' : 'message-others'}`;
    div.dataset.msgId = msgId;

    const time = msg.time
        ? new Date(msg.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    let replyHTML = '';
    if (msg.reply_to) {
        replyHTML = `<div class="reply-quote" data-ref="${msg.reply_to}">引用消息</div>`;
    }

    let contentHTML = renderContent(msg, isSelf);
    let reactionsHTML = `<div class="reactions-bar" data-msg-id="${msgId}"></div>`;
    let actionsHTML = `<div class="message-actions">
        <button class="action-btn react-btn" title="回应" onclick="toggleReactionPicker(this)">😀</button>
        <button class="action-btn reply-btn" title="回复" onclick="startReply('${msgId}','${escapeHtml(msg.username)}')">↩</button>
    </div>`;

    div.innerHTML = `
        <div class="message-header">
            <span class="message-username">${escapeHtml(msg.username)}</span>
            <span class="message-time">${time}</span>
        </div>
        ${replyHTML}
        ${contentHTML}
        ${reactionsHTML}
        ${actionsHTML}`;

    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;

    div.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
}

function addPrivateMessage(msg) {
    const peer = msg.username === username ? msg.to : msg.username;
    if (privateTarget !== peer) return;

    const div = document.createElement('div');
    const isSelf = msg.username === username;
    div.className = `message ${isSelf ? 'message-self' : 'message-others'}`;

    const time = msg.time
        ? new Date(msg.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
        : new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });

    let contentHTML = renderContent(msg, isSelf);

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
        if (user !== username) {
            li.style.cursor = 'pointer';
            li.onclick = () => startPrivateChat(user);
        }
        userList.appendChild(li);
    });
    onlineCount.textContent = `${users.length} 人在线`;
}

function startPrivateChat(target) {
    privateTarget = target;
    chatTitle.textContent = `私聊 - ${target}`;
    backBtn.style.display = 'inline-block';
    privateHint.style.display = 'flex';
    privateTargetSpan.textContent = target;
    messagesDiv.innerHTML = '';
    addSystemMessage(`已切换到与 ${target} 的私聊`);
}

backBtn.onclick = () => {
    privateTarget = null;
    chatTitle.textContent = '公共聊天室';
    backBtn.style.display = 'none';
    privateHint.style.display = 'none';
    messagesDiv.innerHTML = '';
    addSystemMessage('已返回公共聊天室');
};

function startReply(msgId, sender) {
    replyingTo = msgId;
    messageInput.placeholder = `回复 ${sender}...`;
    messageInput.focus();
}

function sendMessage() {
    const content = messageInput.value.trim();
    if (!content || !ws) return;

    const msg = {
        type: privateTarget ? 'private' : 'message',
        username: username,
        content: content,
        msg_id: generateMsgId()
    };
    if (privateTarget) msg.to = privateTarget;
    if (replyingTo) {
        msg.reply_to = replyingTo;
        replyingTo = null;
        messageInput.placeholder = '输入消息...';
    }

    ws.send(JSON.stringify(msg));
    messageInput.value = '';
    sendStopTyping();
}

sendBtn.onclick = sendMessage;
messageInput.onkeypress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
};

messageInput.oninput = () => {
    if (!isTyping) {
        isTyping = true;
        ws.send(JSON.stringify({ type: 'typing', username }));
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(sendStopTyping, 2000);
};

function sendStopTyping() {
    if (isTyping) {
        isTyping = false;
        ws.send(JSON.stringify({ type: 'stop_typing', username }));
    }
}

function showTyping(user) {
    typingIndicator.textContent = `${user} 正在输入...`;
    typingIndicator.style.display = 'block';
}

function hideTyping(user) {
    if (typingIndicator.textContent === `${user} 正在输入...`) {
        typingIndicator.style.display = 'none';
    }
}

function showMentionNotification(from, to) {
    if (to === username) {
        addSystemMessage(`${from} 提到了你`);
        if (Notification.permission === 'granted') {
            new Notification(`${from} 提到了你`, { body: '在聊天室中' });
        }
    }
}

function toggleReactionPicker(btn) {
    const existing = btn.parentElement.querySelector('.reaction-picker');
    if (existing) { existing.remove(); return; }

    const picker = document.createElement('div');
    picker.className = 'reaction-picker';
    quickReactions.forEach(emoji => {
        const span = document.createElement('span');
        span.className = 'reaction-emoji';
        span.textContent = emoji;
        span.onclick = (e) => {
            e.stopPropagation();
            const msgId = btn.closest('.message').dataset.msgId;
            ws.send(JSON.stringify({ type: 'reaction', username, msg_id: msgId, reaction: emoji }));
            picker.remove();
        };
        picker.appendChild(span);
    });
    btn.parentElement.appendChild(picker);
    setTimeout(() => document.addEventListener('click', () => picker.remove(), { once: true }), 10);
}

function updateReactions(msgId, reactions) {
    const bar = document.querySelector(`.reactions-bar[data-msg-id="${msgId}"]`);
    if (!bar) return;
    bar.innerHTML = '';
    const counts = {};
    Object.values(reactions).forEach(emoji => { counts[emoji] = (counts[emoji] || 0) + 1; });
    Object.entries(counts).forEach(([emoji, count]) => {
        const span = document.createElement('span');
        span.className = 'reaction-tag';
        span.textContent = `${emoji} ${count}`;
        span.onclick = () => {
            ws.send(JSON.stringify({ type: 'reaction', username, msg_id: msgId, reaction: emoji }));
        };
        bar.appendChild(span);
    });
}

if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
}

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
    if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return; }
    await uploadAndSend(file, 'image');
    imageInput.value = '';
};

videoInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { alert('请选择视频文件'); return; }
    await uploadAndSend(file, 'video');
    videoInput.value = '';
};

fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await uploadAndSend(file, 'file');
    fileInput.value = '';
};

async function uploadAndSend(file, dataType) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', username);

    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const result = await response.json();
        const msg = {
            type: privateTarget ? 'private' : 'message',
            username,
            data_type: dataType,
            msg_id: generateMsgId()
        };
        if (privateTarget) msg.to = privateTarget;
        if (dataType === 'file') {
            msg.content = JSON.stringify({ url: result.url, name: file.name, size: file.size });
        } else {
            msg.content = result.url;
        }
        ws.send(JSON.stringify(msg));
    } catch (error) {
        alert('上传失败: ' + error.message);
    }
}

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
            await uploadAndSend(item.getAsFile(), 'image');
            break;
        }
    }
});

settingsBtn.onclick = () => {
    qrcodeDiv.innerHTML = '';
    const url = window.location.href;
    new QRCode(qrcodeDiv, { text: url, width: 200, height: 200, colorDark: '#000000', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.H });
    currentUrlP.textContent = url;
    settingsModal.style.display = 'flex';
};

closeModalBtn.onclick = () => { settingsModal.style.display = 'none'; };
settingsModal.onclick = (e) => { if (e.target === settingsModal) settingsModal.style.display = 'none'; };
