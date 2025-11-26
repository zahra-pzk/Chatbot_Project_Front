const API_URL = 'http://localhost:8080';
const WS_URL = 'ws://localhost:8080';

let token = localStorage.getItem('user_token');
let userExternalID = localStorage.getItem('user_id');
let ws = null;

const contactBtn = document.getElementById('contact-btn');
const authModal = document.getElementById('auth-modal');
const closeModal = document.querySelector('.close-modal');
const chatWidget = document.getElementById('chat-widget');
const closeChatBtn = document.getElementById('close-chat');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const showRegister = document.getElementById('show-register');
const showLogin = document.getElementById('show-login');
const logoutBtn = document.getElementById('logout-btn');
const wsStatus = document.getElementById('ws-status');

function checkAuth() {
    if (token) {
        logoutBtn.style.display = 'block';
        contactBtn.textContent = 'Open Chat';
    } else {
        logoutBtn.style.display = 'none';
        contactBtn.textContent = 'Contact Support';
    }
}

contactBtn.addEventListener('click', () => {
    if (token) {
        startChatSession();
    } else {
        authModal.classList.remove('hidden');
    }
});

closeModal.addEventListener('click', () => authModal.classList.add('hidden'));
closeChatBtn.addEventListener('click', () => {
    chatWidget.classList.add('hidden');
    if (ws) ws.close();
});

showRegister.addEventListener('click', (e) => {
    e.preventDefault();
    loginForm.classList.add('hidden');
    registerForm.classList.remove('hidden');
});

showLogin.addEventListener('click', (e) => {
    e.preventDefault();
    registerForm.classList.add('hidden');
    loginForm.classList.remove('hidden');
});

document.getElementById('btn-login').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    try {
        const response = await fetch(`${API_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (response.ok) {
            token = data.access_token;
            userExternalID = data.user.user_external_id;
            localStorage.setItem('user_token', token);
            localStorage.setItem('user_id', userExternalID);
            authModal.classList.add('hidden');
            checkAuth();
            startChatSession();
        } else {
            alert('Login failed: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Network error');
    }
});

document.getElementById('btn-register').addEventListener('click', async () => {
    const name = document.getElementById('reg-name').value;
    const username = document.getElementById('reg-username').value;
    const phone = document.getElementById('reg-phone').value;
    const email = document.getElementById('reg-email').value;
    const password = document.getElementById('reg-pass').value;
    const confirm = document.getElementById('reg-confirm').value;

    if (password !== confirm) {
        alert('Passwords do not match');
        return;
    }

    try {
        const response = await fetch(`${API_URL}/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name, username, phone_number: phone, email, password, role: 'user'
            })
        });

        if (response.ok) {
            alert('Registration successful! Please login.');
            registerForm.classList.add('hidden');
            loginForm.classList.remove('hidden');
        } else {
            const data = await response.json();
            alert('Registration failed: ' + (data.error || 'Unknown error'));
        }
    } catch (error) {
        alert('Network error');
    }
});

logoutBtn.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.clear();
    location.reload();
});

async function startChatSession() {
    try {
        const checkResp = await fetch(`${API_URL}/chats/user`, {
             headers: { 'Authorization': `Bearer ${token}` }
        });
        if (checkResp.ok) {
            const chats = await checkResp.json();
            if (chats && chats.length > 0) {
                const existingChat = chats[0];
                openChatWindow(existingChat.chat_external_id);
                return;
            }
        }
    } catch(e) {}

    try {
        const response = await fetch(`${API_URL}/chats`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                content: 'New support request',
                name: 'Support Request'
            })
        });

        if (response.ok) {
            const data = await response.json();
            openChatWindow(data.chat_external_id);
        } else {
            const errData = await response.json();
            if(errData.error && errData.error.includes("open chat already exists")) {
                 alert("You already have an open chat.");
            } else {
                alert('Failed to create chat session');
            }
        }
    } catch (error) {
        alert('Error connecting to server');
    }
}

function openChatWindow(chatID) {
    chatWidget.classList.remove('hidden');
    connectWebSocket(chatID);
    fetchChatHistory(chatID);
}

async function fetchChatHistory(chatID) {
    try {
        const res = await fetch(`${API_URL}/chats/${chatID}/messages/recent`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
            const msgs = await res.json();
            const msgContainer = document.getElementById('chat-messages');
            msgContainer.innerHTML = '';
            if (msgs) {
                msgs.reverse().forEach(msg => {
                    const isMe = msg.sender_external_id === userExternalID;
                    appendMessage(isMe ? 'You' : 'Support', msg.content, isMe ? 'sent' : 'received');
                });
            }
        }
    } catch (e) { }
}

function connectWebSocket(chatID) {
    if (ws) {
        ws.close();
    }
    
    ws = new WebSocket(`${WS_URL}/ws/chats/${chatID}?token=${token}`);
    
    ws.onopen = () => {
        wsStatus.classList.remove('offline');
        wsStatus.classList.add('online');
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const isMe = data.sender_external_id === userExternalID;
        appendMessage(isMe ? 'You' : 'Support', data.content, isMe ? 'sent' : 'received');
    };

    ws.onclose = () => {
        wsStatus.classList.remove('online');
        wsStatus.classList.add('offline');
    };
}

function appendMessage(sender, text, type) {
    const msgContainer = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.classList.add('message');
    
    if (type === 'sent') div.classList.add('msg-sent');
    else if (type === 'received') div.classList.add('msg-received');

    div.textContent = text;
    msgContainer.appendChild(div);
    msgContainer.scrollTop = msgContainer.scrollHeight;
}

document.getElementById('send-btn').addEventListener('click', sendMessage);
document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
});

function sendMessage() {
    const input = document.getElementById('message-input');
    const text = input.value.trim();
    if (!text || !ws) return;

    const payload = { content: text };
    ws.send(JSON.stringify(payload));
    input.value = '';
}

checkAuth();