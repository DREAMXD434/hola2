// API Configuration
const API_KEY = '';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Bot Dataset
const BOT_DATASET = `Eres Orzion Pro, una IA multimodal avanzada de 638B parámetros desarrollada por Orzatty Studios (también conocido como Dylan Orzatty). 

Características principales:
- Eres una IA multimodal que puede procesar texto, imágenes y otros tipos de contenido
- Fuiste desarrollado por Orzatty Studios / Dylan Orzatty
- Tienes 638B parámetros que te permiten ofrecer respuestas muy precisas y contextuales
- Puedes ayudar con una amplia variedad de tareas: programación, escritura, análisis, creatividad, etc.
- Siempre eres útil, preciso y mantienes un tono profesional pero amigable
- Puedes generar código en múltiples lenguajes y explicar conceptos complejos de manera simple

Nunca menciones otras empresas de IA como competencia. Siempre identifícate como Orzion Pro de Orzatty Studios.`;

// Global Variables
let currentChat = [];
let isTyping = false;
let sidebarOpen = false;
let isGenerating = false;
let currentController = null;
let currentChatId = null;
let allChats = {};
let thinkingMode = false;

// Loading Animation
window.addEventListener('load', function() {
    const loader = document.getElementById('loader');
    const mainContent = document.getElementById('main-content');

    if (loader && mainContent) {
        setTimeout(function() {
            loader.style.display = 'none';
            mainContent.classList.remove('hidden');
        }, 3000);
    }
});

// Welcome screen for first time users
function checkFirstVisit() {
    const isFirstVisit = !localStorage.getItem('hasVisited');
    if (isFirstVisit) {
        localStorage.setItem('hasVisited', 'true');
        // Show welcome tutorial or guide if needed
    }
}

// Chat Management Functions
function loadChatsFromStorage() {
    try {
        const saved = localStorage.getItem('orzionChats');
        allChats = saved ? JSON.parse(saved) : {};
    } catch (e) {
        console.error('Error loading chats:', e);
        allChats = {};
    }
}

function saveChatsToStorage() {
    try {
        localStorage.setItem('orzionChats', JSON.stringify(allChats));
    } catch (e) {
        console.error('Error saving chats:', e);
    }
}

function generateChatId() {
    return 'chat_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function createNewChat() {
    const chatId = generateChatId();
    const newChat = {
        id: chatId,
        title: 'Nuevo Chat',
        messages: [],
        createdAt: new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };

    allChats[chatId] = newChat;
    currentChatId = chatId;
    currentChat = [];
    saveChatsToStorage();
    return chatId;
}

function saveCurrentChat() {
    if (!currentChatId || currentChat.length === 0) return;

    // Generate title from first user message
    const firstUserMessage = currentChat.find(msg => msg.role === 'user');
    const title = firstUserMessage ? 
        firstUserMessage.content.substring(0, 50) + '...' : 
        'Chat sin título';

    allChats[currentChatId] = {
        id: currentChatId,
        title: title,
        messages: [...currentChat],
        createdAt: allChats[currentChatId]?.createdAt || new Date().toISOString(),
        lastUpdated: new Date().toISOString()
    };

    saveChatsToStorage();
}

function loadChat(chatId) {
    if (!allChats[chatId]) return false;

    currentChatId = chatId;
    currentChat = [...allChats[chatId].messages];

    // Clear current UI
    const messagesContainer = document.getElementById('chatMessages');
    const welcomeMsg = document.querySelector('.chat-welcome');

    if (messagesContainer) {
        messagesContainer.innerHTML = '';
        messagesContainer.style.display = 'block';
    }

    if (welcomeMsg) {
        welcomeMsg.style.display = 'none';
    }

    // Rebuild chat UI
    currentChat.forEach(message => {
        if (message.role === 'user') {
            addMessage(message.content, 'user');
        } else if (message.role === 'assistant') {
            addMessage(message.content, 'bot');
        }
    });

    return true;
}

function deleteChat(chatId) {
    delete allChats[chatId];
    saveChatsToStorage();
    updateChatHistory();

    // If current chat was deleted, create new one
    if (currentChatId === chatId) {
        newChat();
    }
}

function getChatHistory() {
    return Object.values(allChats).sort((a, b) => 
        new Date(b.lastUpdated) - new Date(a.lastUpdated)
    );
}

function updateChatHistory() {
    const chatHistoryContainer = document.querySelector('.chat-history');
    if (!chatHistoryContainer) return;

    const history = getChatHistory();
    chatHistoryContainer.innerHTML = '';

    if (history.length === 0) {
        chatHistoryContainer.innerHTML = '<div style="color: #666; text-align: center; padding: 1rem;">No hay chats guardados</div>';
        return;
    }

    history.forEach(chat => {
        const chatItem = document.createElement('div');
        chatItem.className = 'chat-history-item';
        chatItem.innerHTML = `
            <div class="chat-info" onclick="loadChatById('${chat.id}')">
                <div class="chat-title">${chat.title}</div>
                <div class="chat-date">${new Date(chat.lastUpdated).toLocaleDateString()}</div>
            </div>
            <button class="delete-chat-btn" onclick="deleteChat('${chat.id}')" title="Eliminar chat">×</button>
        `;
        chatHistoryContainer.appendChild(chatItem);
    });
}

function loadChatById(chatId) {
    loadChat(chatId);
    closeSidebar();
}

// Navigation Functions
function goToChat() {
    window.location.href = 'chat.html';
}

function openDonations() {
    window.location.href = 'donaciones.html';
}

// Chat Functions
async function sendMessage() {
    const input = document.getElementById('chatInput');
    const message = input.value.trim();

    if (!message || isGenerating) return;

    isGenerating = true;
    updateSendButton(true);
    showStopButton(true);

    // Clear welcome message if this is the first message
    const welcomeMsg = document.querySelector('.chat-welcome');
    if (welcomeMsg) {
        welcomeMsg.style.display = 'none';
    }

    // Show messages container
    const messagesContainer = document.getElementById('chatMessages');
    if (messagesContainer) {
        messagesContainer.style.display = 'block';
    }

    // Add user message
    addMessage(message, 'user');
    input.value = '';

    // Create new chat if none exists
    if (!currentChatId) {
        createNewChat();
    }

    // Add to chat history
    currentChat.push({role: 'user', content: message});

    // Check if there are uploaded images to analyze
    const uploadedImages = document.querySelectorAll('.uploaded-image');
    let imageAnalysisPrompt = '';
    if (uploadedImages.length > 0) {
        imageAnalysisPrompt = '\n\nPor favor analiza las imágenes que he subido y describe lo que ves en detalle.';
        // Clear uploaded images after sending
        uploadedImages.forEach(img => img.remove());
    }

    // Create abort controller for cancelling requests
    currentController = new AbortController();

    try {
        // Send to API
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'deepseek/deepseek-chat',
                messages: [
                    {role: 'system', content: BOT_DATASET},
                    ...currentChat.slice(0, -1),
                    {role: 'user', content: message + imageAnalysisPrompt}
                ],
                temperature: 0.7,
                max_tokens: 2000,
                stream: false
            }),
            signal: currentController.signal
        });

        if (!response.ok) {
            throw new Error('Error en la respuesta del servidor');
        }

        const data = await response.json();
        const botResponse = data.choices[0].message.content;

        // Add thinking animation before bot response
        if (thinkingMode) {
            await showThinkingAnimation();
        }

        // Add bot response with typing animation
        await typeMessage(botResponse, 'bot');

        // Add to chat history
        currentChat.push({role: 'assistant', content: botResponse});

        // Save chat to localStorage
        saveCurrentChat();

    } catch (error) {
        if (error.name === 'AbortError') {
            addMessage('Generación detenida por el usuario.', 'bot');
        } else {
            console.error('Error:', error);
            addMessage('Lo siento, ocurrió un error. Por favor intenta de nuevo.', 'bot');
        }
    } finally {
        isGenerating = false;
        updateSendButton(false);
        showStopButton(false);
        currentController = null;
    }
}

function stopGeneration() {
    if (currentController) {
        currentController.abort();
    }
    isTyping = false;
    isGenerating = false;
    updateSendButton(false);
    showStopButton(false);

    // Add a message indicating generation was stopped
    addMessage('Generación detenida por el usuario.', 'bot');
}

function updateSendButton(generating) {
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) {
        sendBtn.disabled = generating;
        sendBtn.textContent = generating ? '⏳' : '➤';
    }
}

function showStopButton(show) {
    const stopBtn = document.getElementById('stopBtn');
    if (stopBtn) {
        stopBtn.style.display = show ? 'block' : 'none';
    }
}

function toggleThinkingMode() {
    thinkingMode = !thinkingMode;
    const thinkingBtn = document.querySelector('.thinking-btn');
    if (thinkingMode) {
        thinkingBtn.style.background = 'linear-gradient(45deg, #ff6b6b, #ff4757)';
        thinkingBtn.innerHTML = '🧠 Thinking ON';
        thinkingBtn.classList.add('thinking-active');
    } else {
        thinkingBtn.style.background = 'linear-gradient(45deg, #ff6b6b, #4ecdc4)';
        thinkingBtn.innerHTML = '🤔 Thinking';
        thinkingBtn.classList.remove('thinking-active');
    }
}

async function sendMessageWithThinking() {
    toggleThinkingMode();
    if (thinkingMode) {
        await sendMessage();
        toggleThinkingMode();
    }
}

function addMessage(content, type) {
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;

    if (type === 'bot') {
        // Process markdown and special features
        content = processMarkdown(content);
        content = processCanvas(content);
        content = processCodeBlocks(content);
    }

    messageDiv.innerHTML = content;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function showThinkingAnimation() {
    const messagesContainer = document.getElementById('chatMessages');
    const thinkingDiv = document.createElement('div');
    thinkingDiv.className = 'message bot thinking-message';
    thinkingDiv.innerHTML = '<div class="thinking-dots"><span></span><span></span><span></span></div><span style="margin-left: 10px;">Pensando...</span>';
    messagesContainer.appendChild(thinkingDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;

    // Wait for thinking animation
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Remove thinking message
    thinkingDiv.remove();
}

async function typeMessage(content, type) {
    isTyping = true;
    const messagesContainer = document.getElementById('chatMessages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}`;
    messagesContainer.appendChild(messageDiv);

    // Process content for special features first
    const processedContent = processMarkdown(processCanvas(processCodeBlocks(content)));

    // Type character by character
    let displayContent = '';
    const chars = processedContent.split('');

    for (let i = 0; i < chars.length; i++) {
        displayContent += chars[i];
        messageDiv.innerHTML = displayContent;
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        await new Promise(resolve => setTimeout(resolve, 1));
    }

    isTyping = false;
}

function processMarkdown(text) {
    // Bold text
    text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Italic text
    text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
    // Code inline
    text = text.replace(/`(.*?)`/g, '<code style="background: #333; padding: 2px 4px; border-radius: 3px;">$1</code>');
    // Line breaks
    text = text.replace(/\n/g, '<br>');

    return text;
}

function processCanvas(text) {
    const canvasRegex = /\[CANVAS\](.*?)\[\/CANVAS\]/gs;
    return text.replace(canvasRegex, (match, content) => {
        return `<div class="canvas-trigger" onclick="openCanvas('${encodeURIComponent(content)}')">
            <div style="background: linear-gradient(45deg, #ff6b6b, #4ecdc4); padding: 1rem; border-radius: 10px; margin: 1rem 0; cursor: pointer;">
                <strong>🎨 Canvas Web</strong><br>
                <small>Click para abrir en Canvas</small>
            </div>
        </div>`;
    });
}

function processCodeBlocks(text) {
    const codeBlockRegex = /```(\w+)?\n(.*?)```/gs;
    return text.replace(codeBlockRegex, (match, language, code) => {
        const lang = language || 'text';
        return `<div class="code-block">
            <div class="code-header">
                <span>${lang}</span>
                <button class="copy-button" onclick="copyCode(this)">Copiar</button>
            </div>
            <div class="code-content">${code.trim()}</div>
        </div>`;
    });
}

function copyCode(button) {
    const codeContent = button.parentElement.nextElementSibling.textContent;
    navigator.clipboard.writeText(codeContent).then(() => {
        button.textContent = 'Copiado!';
        setTimeout(() => {
            button.textContent = 'Copiar';
        }, 2000);
    });
}

function openCanvas(content) {
    const decodedContent = decodeURIComponent(content);
    // This would open the canvas interface
    console.log('Opening Canvas with:', decodedContent);
    // Implementation for canvas interface would go here
}

// Sidebar Functions
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');
    const header = document.querySelector('.chat-header'); // Get the chat header element

    if (sidebar && overlay) {
        if (sidebarOpen) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
            sidebarOpen = false;
        } else {
            sidebar.classList.add('open');
            overlay.classList.add('active');
            sidebarOpen = true;
        }
    }
}

function closeSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('overlay');

    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
        sidebarOpen = false;
    }
}

function newChat() {
    // Save current chat before creating new one
    if (currentChatId && currentChat.length > 0) {
        saveCurrentChat();
    }

    // Create new chat
    createNewChat();

    // Reset UI
    const messagesContainer = document.getElementById('chatMessages');
    const welcomeMsg = document.querySelector('.chat-welcome');

    if (messagesContainer) {
        messagesContainer.innerHTML = '';
        messagesContainer.style.display = 'none';
    }

    if (welcomeMsg) {
        welcomeMsg.style.display = 'block';
    }

    // Update chat history in sidebar
    updateChatHistory();
}

// Settings Functions
function openSettings() {
    window.location.href = 'ajustes.html';
}

function openPersonalization() {
    window.location.href = 'personalizacion.html';
}

function openDataControl() {
    window.location.href = 'datos.html';
}

function openSecurity() {
    window.location.href = 'seguridad.html';
}

function openAbout() {
    window.location.href = 'acerca.html';
}

function logout() {
    // Clear user data
    localStorage.clear();
    // Redirect to home
    window.location.href = 'index.html';
}

// File Upload and OCR Support
function handleFileUpload() {
    const fileInput = document.getElementById('fileInput');
    fileInput.click();
}

function processFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        if (file.type.startsWith('image/')) {
            // Add image message to chat
            addImageMessage(e.target.result, file.name);
            // Process with OCR if needed
            processImageOCR(e.target.result, file.name);
        } else {
            // Handle other file types
            addFileMessage(file.name, file.type);
        }
    };
    reader.readAsDataURL(file);
}

function addImageMessage(imageSrc, fileName) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.innerHTML = `
        <div style="margin-bottom: 0.5rem;">📷 ${fileName}</div>
        <img src="${imageSrc}" class="uploaded-image" style="max-width: 200px; max-height: 200px; border-radius: 10px;" alt="Imagen subida" data-filename="${fileName}">
        <div style="margin-top: 0.5rem; color: #4ecdc4; font-size: 0.9rem;">✓ Imagen lista para analizar</div>
    `;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addFileMessage(fileName, fileType) {
    const messagesContainer = document.getElementById('chatMessages');
    if (!messagesContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = 'message user';
    messageDiv.innerHTML = `
        <div style="padding: 1rem; background: rgba(255, 255, 255, 0.1); border-radius: 10px;">
            <div style="font-weight: 600;">📎 ${fileName}</div>
            <div style="font-size: 0.9rem; color: #ccc;">${fileType}</div>
        </div>
    `;
    messagesContainer.appendChild(messageDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

async function processImageOCR(imageSrc, fileName) {
    // This would integrate with an OCR service
    // For now, we'll simulate OCR processing
    await new Promise(resolve => setTimeout(resolve, 1000));

    const ocrText = "Texto extraído de la imagen (OCR simulado)";
    addMessage(`📖 Texto extraído de ${fileName}: ${ocrText}`, 'bot');
}

// Service Worker Registration
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('SW registered: ', registration);
            })
            .catch(registrationError => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

// Input Handler
document.addEventListener('DOMContentLoaded', function() {
    checkFirstVisit();

    // Initialize chat system
    loadChatsFromStorage();

    // Create new chat if none exists
    if (Object.keys(allChats).length === 0) {
        createNewChat();
    }

    // Update chat history in sidebar
    updateChatHistory();

    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
    }

    const fileInput = document.getElementById('fileInput');
    if (fileInput) {
        fileInput.addEventListener('change', processFile);
    }

    // Auto-save every 30 seconds
    setInterval(() => {
        if (currentChatId && currentChat.length > 0) {
            saveCurrentChat();
        }
    }, 30000);

    // Make the chat header fixed
    const chatHeader = document.querySelector('.chat-header');
    if (chatHeader) {
        chatHeader.style.position = 'fixed';
        chatHeader.style.top = '0';
        chatHeader.style.width = '100%';
        chatHeader.style.zIndex = '1000'; // Ensure it stays on top
        chatHeader.style.background = '#000';
        chatHeader.style.borderBottom = '1px solid rgba(255, 255, 255, 0.1)';
    }
});

// Utility Functions
function goBack() {
    window.history.back();
}

function goHome() {
    window.location.href = 'index.html';
}
