const API_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080';

let adminToken = localStorage.getItem('admin_token');
let adminID = localStorage.getItem('admin_id'); 
let currentChatWs = null;
let dashboardWs = null;
let activeChatID = null;
let chatsMap = new Map();

const loginSection = document.getElementById('login-section');
const dashboardSection = document.getElementById('dashboard-section');
const chatListEl = document.getElementById('chat-list');
const emptyState = document.getElementById('empty-state');
const chatInterface = document.getElementById('chat-interface');
const messagesDiv = document.getElementById('admin-messages');
const aiSuggestionBox = document.getElementById('ai-suggestion-box');
const aiSuggestionText = document.getElementById('ai-suggestion-text');
const aiActionBadge = document.getElementById('ai-action-badge');

function init() {
    if (adminToken) {
        showDashboard();
    } else {
        showLogin();
    }
}

function showLogin() {
    loginSection.classList.remove('hidden');
    dashboardSection.classList.add('hidden');
}

function showDashboard() {
    loginSection.classList.add('hidden');
    dashboardSection.classList.remove('hidden');
    connectDashboardWs();
}

document.getElementById('admin-login-btn').addEventListener('click', async () => {
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;

    try {
        const response = await fetch(`${API_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();

        if (response.ok) {
            if (data.user.role !== 'admin' && data.user.role !== 'superadmin') {
                alert('Access Denied: Not an admin');
                return;
            }
            adminToken = data.access_token;
            adminID = data.user.user_external_id;
            localStorage.setItem('admin_token', adminToken);
            localStorage.setItem('admin_id', adminID);
            showDashboard();
        } else {
            alert('Login failed');
        }
    } catch (e) {
        alert('Network error');
    }
});

document.getElementById('admin-logout').addEventListener('click', () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_id');
    location.reload();
});

document.getElementById('refresh-chats').addEventListener('click', () => {
    if(!dashboardWs || dashboardWs.readyState !== WebSocket.OPEN) {
        connectDashboardWs();
    }
});

function connectDashboardWs() {
    if (dashboardWs) dashboardWs.close();

    dashboardWs = new WebSocket(`${WS_URL}/ws/admin/chats?token=${adminToken}`);

    dashboardWs.onopen = () => {
        console.log("Admin Dashboard WS Connected");
    };

    dashboardWs.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (Array.isArray(data)) {
                updateChatList(data);
            } else if (data.type === 'ai_suggestion') {
                handleAISuggestion(data);
            }
        } catch (e) {
            console.error("Error parsing dashboard msg", e);
        }
    };

    dashboardWs.onclose = () => console.log("Admin WS Closed");
}

function updateChatList(newChats) {
    newChats.forEach(chat => {
        chatsMap.set(chat.chat_external_id, chat);
    });
    renderChatList();
}

function handleAISuggestion(data) {
    if (data.chat_external_id === activeChatID) {
        showSuggestionUI(data);
    }
}

function showSuggestionUI(data) {
    aiSuggestionText.textContent = data.suggested_reply;
    if (data.suggested_action && data.suggested_action !== "none") {
        aiActionBadge.textContent = data.suggested_action;
        aiActionBadge.classList.remove('hidden');
    } else {
        aiActionBadge.classList.add('hidden');
    }
    aiSuggestionBox.classList.remove('hidden');
}

function renderChatList() {
    chatListEl.innerHTML = '';
    
    const sortedChats = Array.from(chatsMap.values()).sort((a, b) => {
        return new Date(b.updated_at) - new Date(a.updated_at);
    });

    sortedChats.forEach(chat => {
        const li = document.createElement('li');
        li.className = 'chat-item';
        if (chat.chat_external_id === activeChatID) {
            li.classList.add('active');
        }
        
        li.innerHTML = `
            <h4>User: ${chat.user_external_id.substring(0, 8)}...</h4>
            <p>Status: <strong>${chat.status}</strong></p>
            <p style="font-size:0.7rem">${new Date(chat.updated_at).toLocaleTimeString()}</p>
        `;
        
        li.addEventListener('click', () => loadChat(chat));
        chatListEl.appendChild(li);
    });
}

function loadChat(chat) {
    if (currentChatWs) {
        currentChatWs.close();
    }
    activeChatID = chat.chat_external_id;
    renderChatList();
    
    emptyState.classList.add('hidden');
    chatInterface.classList.remove('hidden');
    aiSuggestionBox.classList.add('hidden'); 

    document.getElementById('current-chat-id').textContent = `Chat ID: ${chat.chat_external_id.substring(0, 8)}`;
    document.getElementById('current-chat-status').textContent = `Status: ${chat.status}`;
    messagesDiv.innerHTML = '';

    fetchHistory(chat.chat_external_id);
    connectToChat(chat.chat_external_id);
}

async function fetchHistory(chatID) {
    try {
        const res = await fetch(`${API_URL}/chats/${chatID}/messages/recent`, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });
        if (res.ok) {
            const msgs = await res.json();
            if(msgs) {
                msgs.reverse().forEach(msg => {
                    appendMessage(msg.content, msg.sender_external_id === adminID);
                });
            }
        }
    } catch (e) { console.error(e); }
}

function connectToChat(chatID) {
    currentChatWs = new WebSocket(`${WS_URL}/ws/chats/${chatID}?token=${adminToken}`);
    
    currentChatWs.onopen = () => console.log('Admin connected to chat room');
    
    currentChatWs.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const isMe = data.sender_external_id === adminID;
        appendMessage(data.content, isMe); 
    };

    currentChatWs.onclose = () => console.log("Chat room closed");
}

function appendMessage(content, isOwn) {
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'msg-outgoing' : 'msg-incoming'}`;
    div.textContent = content;
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

document.getElementById('admin-send-btn').addEventListener('click', sendAdminMessage);
document.getElementById('admin-input-field').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendAdminMessage();
});

document.getElementById('btn-use-ai').addEventListener('click', () => {
    const suggestion = aiSuggestionText.textContent;
    if (suggestion) {
        document.getElementById('admin-input-field').value = suggestion;
        aiSuggestionBox.classList.add('hidden');
    }
});

document.getElementById('btn-dismiss-ai').addEventListener('click', () => {
    aiSuggestionBox.classList.add('hidden');
});

function sendAdminMessage() {
    const input = document.getElementById('admin-input-field');
    const text = input.value.trim();
    if (!text || !currentChatWs) return;

    currentChatWs.send(JSON.stringify({ content: text }));
    input.value = '';
}

init();