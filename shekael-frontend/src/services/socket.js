import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || location.origin;

let socket = null;
let listeners = {};
let reconnectTimer = null;

// Callbacks que el Chat registra
const callbacks = {
  onMessageSent: null,     // (msg) => {}
  onMessageEdited: null,   // (msg) => {}
  onMessageDeleted: null,  // ({ messageId }) => {}
  onTyping: null,          // ({ userId, typing }) => {}
  onConversationUpdated: null, // ({ conversationId, lastMessage }) => {}
};

export function connectSocket(token) {
  if (socket?.connected) return socket;

  socket = io(API_URL, {
    auth: { token },
    transports: ['websocket'],    // Solo WS, sin polling HTTP
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,       // Empieza en 1s
    reconnectionDelayMax: 30000,   // Máximo 30s entre intentos
    randomizationFactor: 0.5,
    timeout: 10000,
  });

  socket.on('connect', () => {
    console.log('[WS] Conectado');
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Desconectado:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[WS] Error de conexión:', err.message);
  });

  // ── Eventos del chat ──

  socket.on('message:sent', (data) => {
    if (callbacks.onMessageSent) callbacks.onMessageSent(data);
  });

  socket.on('message:edited', (data) => {
    if (callbacks.onMessageEdited) callbacks.onMessageEdited(data);
  });

  socket.on('message:deleted', (data) => {
    if (callbacks.onMessageDeleted) callbacks.onMessageDeleted(data);
  });

  socket.on('typing', (data) => {
    if (callbacks.onTyping) callbacks.onTyping(data);
  });

  socket.on('conversation:updated', (data) => {
    if (callbacks.onConversationUpdated) callbacks.onConversationUpdated(data);
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

// Unirse / salir de una conversación (room)
export function joinConversation(convId) {
  if (!convId) return;
  if (socket?.connected) {
    socket.emit('join:conversation', convId);
  } else if (socket) {
    // Socket conectándose — esperar a que conecte
    const onConnect = () => {
      socket.emit('join:conversation', convId);
      socket.off('connect', onConnect);
    };
    socket.on('connect', onConnect);
  }
}

export function leaveConversation(convId) {
  if (!convId) return;
  if (socket?.connected) {
    socket.emit('leave:conversation', convId);
  }
}

// Emitir typing
let typingTimer = null;
export function emitTyping(conversationId, isTyping) {
  if (!socket?.connected || !conversationId) return;

  if (typingTimer) {
    clearTimeout(typingTimer);
    typingTimer = null;
  }

  socket.emit('typing', { conversationId, typing: isTyping });

  // Auto-limpiar después de 3s si no se vuelve a llamar
  if (isTyping) {
    typingTimer = setTimeout(() => {
      socket.emit('typing', { conversationId, typing: false });
    }, 3000);
  }
}

// Callbacks
export function onMessageSent(cb) { callbacks.onMessageSent = cb; }
export function onMessageEdited(cb) { callbacks.onMessageEdited = cb; }
export function onMessageDeleted(cb) { callbacks.onMessageDeleted = cb; }
export function onTyping(cb) { callbacks.onTyping = cb; }
export function onConversationUpdated(cb) { callbacks.onConversationUpdated = cb; }

export function clearCallbacks() {
  callbacks.onMessageSent = null;
  callbacks.onMessageEdited = null;
  callbacks.onMessageDeleted = null;
  callbacks.onTyping = null;
  callbacks.onConversationUpdated = null;
}

export function isConnected() {
  return socket?.connected || false;
}
