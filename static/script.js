let ws;
let username;
let privateTarget = null;
let typingTimeout = null;
let isTyping = false;
let replyingTo = null;
let unreadCount = 0;
let originalTitle = document.title;

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
        case 'recall':
            handleRecall(msg.msg_id);
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
        const ext = fi.name.split('.').pop().toLowerCase();
        const isPdf = ext === 'pdf';
        const codeExts = ['js','ts','py','go','java','c','cpp','h','css','html','json','xml','yaml','yml','md','sh','bat','sql','rb','rs','swift','kt'];
        const isCode = codeExts.includes(ext);

        let previewHTML = '';
        if (isPdf) {
            previewHTML = `<div class="pdf-preview">
                <iframe src="${fi.url}"></iframe>
                <a href="${fi.url}" class="pdf-link" target="_blank">在新窗口打开 PDF</a>
            </div>`;
        } else if (isCode && fi.size < 100000) {
            previewHTML = `<div class="code-preview" data-url="${fi.url}" data-ext="${ext}">
                <div class="code-filename">${escapeHtml(fi.name)}</div>
                <pre><code>加载中...</code></pre>
            </div>`;
            setTimeout(() => loadCodePreview(fi.url, ext), 100);
        }

        return `<div class="message-content file">
            <span class="file-icon">📄</span>
            <div class="file-info">
                <div class="file-name">${escapeHtml(fi.name)}</div>
                <div class="file-size">${formatFileSize(fi.size)}</div>
            </div>
            <a href="${fi.url}" class="file-download" download>下载</a>
        </div>${previewHTML}`;
    }
    return `<div class="message-content">${formatText(msg.content, isSelf)}</div>`;
}

async function loadCodePreview(url, ext) {
    try {
        const resp = await fetch(url);
        const text = await resp.text();
        const el = document.querySelector(`.code-preview[data-url="${url}"]`);
        if (el) {
            const code = el.querySelector('code');
            code.textContent = text.slice(0, 5000);
            code.className = `language-${ext}`;
            hljs.highlightElement(code);
        }
    } catch (e) {}
}

function formatText(text, isSelf) {
    let html = highlightMentions(text);
    html = html.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
        const langLabel = lang || 'plaintext';
        return `<div class="code-block"><div class="code-lang">${langLabel}</div><pre><code class="language-${langLabel}">${code.trim()}</code></pre></div>`;
    });
    html = html.replace(/`([^`\r\n]+)`/g, '<code class="inline-code">$1</code>');
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

function handleRecall(msgId) {
    const el = document.querySelector(`.message[data-msg-id="${msgId}"]`);
    if (el) {
        el.classList.add('message-recalled');
        const content = el.querySelector('.message-content');
        if (content) content.textContent = '消息已撤回';
        const actions = el.querySelector('.message-actions');
        if (actions) actions.remove();
        const reactions = el.querySelector('.reactions-bar');
        if (reactions) reactions.remove();
    }
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
    const compressed = await compressImage(file, 0.8, 1920);
    await smartUpload(compressed, 'image');
    imageInput.value = '';
};

videoInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('video/')) { alert('请选择视频文件'); return; }
    await smartUpload(file, 'video');
    videoInput.value = '';
};

fileInput.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    await smartUpload(file, 'file');
    fileInput.value = '';
};

// ========== Image Compression ==========
function compressImage(file, quality, maxDim) {
    return new Promise((resolve) => {
        if (file.size < 200 * 1024) { resolve(file); return; }
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let w = img.width, h = img.height;
            if (w > maxDim || h > maxDim) {
                const ratio = Math.min(maxDim / w, maxDim / h);
                w = Math.round(w * ratio);
                h = Math.round(h * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            canvas.getContext('2d').drawImage(img, 0, 0, w, h);
            canvas.toBlob((blob) => {
                if (blob && blob.size < file.size) {
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                } else {
                    resolve(file);
                }
            }, 'image/jpeg', quality);
        };
        img.src = url;
    });
}

// ========== Smart Upload (chunked for large files) ==========
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB chunks

async function smartUpload(file, dataType) {
    if (file.size > CHUNK_SIZE * 2) {
        await chunkedUpload(file, dataType);
    } else {
        await simpleUpload(file, dataType);
    }
}

async function simpleUpload(file, dataType) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('username', username);

    try {
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const result = await response.json();
        sendFileMessage(result, file, dataType);
    } catch (error) {
        alert('上传失败: ' + error.message);
    }
}

async function chunkedUpload(file, dataType) {
    const uploadId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const progressId = 'upload-' + uploadId;

    showUploadProgress(progressId, file.name, 0);

    try {
        for (let i = 0; i < totalChunks; i++) {
            const start = i * CHUNK_SIZE;
            const end = Math.min(start + CHUNK_SIZE, file.size);
            const chunk = file.slice(start, end);

            const formData = new FormData();
            formData.append('chunk', chunk);
            formData.append('upload_id', uploadId);
            formData.append('chunk_index', i.toString());
            formData.append('total_chunks', totalChunks.toString());
            formData.append('filename', file.name);
            formData.append('username', username);

            await fetch('/upload-chunk', { method: 'POST', body: formData });
            updateUploadProgress(progressId, (i + 1) / totalChunks);
        }

        const formData = new FormData();
        formData.append('upload_id', uploadId);
        formData.append('filename', file.name);
        formData.append('username', username);
        formData.append('total_chunks', totalChunks.toString());

        const response = await fetch('/upload-complete', { method: 'POST', body: formData });
        const result = await response.json();
        hideUploadProgress(progressId);
        sendFileMessage(result, file, dataType);
    } catch (error) {
        hideUploadProgress(progressId);
        alert('上传失败: ' + error.message);
    }
}

function sendFileMessage(result, file, dataType) {
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
}

// ========== Upload Progress ==========
function showUploadProgress(id, filename, pct) {
    const div = document.createElement('div');
    div.id = id;
    div.className = 'upload-progress';
    div.innerHTML = `<div class="upload-info">上传中: ${escapeHtml(filename)}</div>
        <div class="upload-bar"><div class="upload-fill" style="width:${pct * 100}%"></div></div>`;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateUploadProgress(id, pct) {
    const el = document.getElementById(id);
    if (el) {
        el.querySelector('.upload-fill').style.width = `${pct * 100}%`;
        el.querySelector('.upload-info').textContent = `上传中: ${Math.round(pct * 100)}%`;
    }
}

function hideUploadProgress(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
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
            const file = item.getAsFile();
            const compressed = await compressImage(file, 0.8, 1920);
            await smartUpload(compressed, 'image');
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

// ========== Dark Mode ==========
const darkModeBtn = document.getElementById('darkmode-btn');
if (localStorage.getItem('darkMode') === 'true') {
    document.body.classList.add('dark');
    darkModeBtn.textContent = '☀️';
}

darkModeBtn.onclick = () => {
    document.body.classList.toggle('dark');
    const isDark = document.body.classList.contains('dark');
    localStorage.setItem('darkMode', isDark);
    darkModeBtn.textContent = isDark ? '☀️' : '🌙';
};

// ========== Export ==========
const exportBtn = document.getElementById('export-btn');
exportBtn.onclick = () => {
    const messages = messagesDiv.querySelectorAll('.message');
    let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>聊天记录 - ${new Date().toLocaleDateString()}</title>
    <style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:20px;background:#f5f5f5;}
    .msg{margin:8px 0;padding:10px 14px;background:white;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.1);}
    .msg .name{font-weight:600;color:#667eea;font-size:13px;}
    .msg .time{color:#999;font-size:11px;margin-left:8px;}
    .msg .content{margin-top:4px;font-size:14px;line-height:1.5;}
    .sys{text-align:center;color:#999;font-size:12px;margin:12px 0;}</style></head><body>
    <h2>聊天记录导出</h2><p>导出时间: ${new Date().toLocaleString()}</p><hr>`;

    messages.forEach(msg => {
        if (msg.classList.contains('message-system')) {
            html += `<div class="sys">${msg.textContent}</div>`;
        } else {
            const name = msg.querySelector('.message-username')?.textContent || '';
            const time = msg.querySelector('.message-time')?.textContent || '';
            const content = msg.querySelector('.message-content')?.textContent || '';
            html += `<div class="msg"><span class="name">${name}</span><span class="time">${time}</span><div class="content">${content}</div></div>`;
        }
    });

    html += '</body></html>';
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `chat-export-${new Date().toISOString().slice(0,10)}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
};

// ========== Unread Count ==========
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
        unreadCount = 0;
        document.title = originalTitle;
    }
});

function incrementUnread() {
    if (document.hidden) {
        unreadCount++;
        document.title = `(${unreadCount}) ${originalTitle}`;
    }
}

// ========== Recall ==========
function recallMessage(msgId) {
    if (!confirm('确定撤回这条消息？')) return;
    ws.send(JSON.stringify({ type: 'recall', username, msg_id: msgId }));
}

const origAddChatMessage = addChatMessage;
addChatMessage = function(msg) {
    if (msg.recalled) {
        const div = document.createElement('div');
        div.className = 'message message-recalled message-others';
        div.dataset.msgId = msg.msg_id;
        div.innerHTML = `<div class="message-header"><span class="message-username">${escapeHtml(msg.username)}</span></div>
            <div class="message-content">消息已撤回</div>`;
        messagesDiv.appendChild(div);
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        return;
    }

    origAddChatMessage(msg);
    incrementUnread();

    const lastMsg = messagesDiv.lastElementChild;
    if (lastMsg && lastMsg.dataset.msgId && msg.username === username) {
        const actions = lastMsg.querySelector('.message-actions');
        if (actions) {
            const recallBtn = document.createElement('button');
            recallBtn.className = 'recall-btn';
            recallBtn.textContent = '撤回';
            recallBtn.onclick = () => recallMessage(msg.msg_id);
            actions.appendChild(recallBtn);
        }
    }
};
