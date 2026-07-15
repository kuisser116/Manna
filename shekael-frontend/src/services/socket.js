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
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 20000,
  });

  socket.on('connect', () => {
    console.log('[WS] Conectado socket:', socket.id);
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  });

  socket.on('disconnect', (reason) => {
    console.log('[WS] Desconectado:', reason, 'transport:', socket.io?.engine?.transport?.name);
  });

  // Log cuando cambia de transporte (útil para debug)
  socket.io?.engine?.on?.('upgrade', (transport) => {
    console.log('[WS] Upgrade a:', transport.name);
  });

  socket.on('connect_error', (err) => {
    console.warn('[WS] Error de conexión:', err.message, 'transport:', socket.io?.engine?.transport?.name);
  });

  socket.on('reconnect_attempt', (attempt) => {
    console.log('[WS] Reconnect attempt:', attempt, 'transport:', socket.io?.engine?.transport?.name);
  });

  socket.on('reconnect_error', (err) => {
    console.warn('[WS] Reconnect error:', err.message);
  });

  socket.on('reconnect_failed', () => {
    console.warn('[WS] Reconnect failed');
  });

  // ── Eventos del chat ──

  socket.on('message:sent', (data) => {
    console.log('[WS EVENT] message:sent id:', data?.id?.substring(0,8));
    if (callbacks.onMessageSent) callbacks.onMessageSent(data);
  });

  socket.on('message:edited', (data) => {
    console.log('[WS EVENT] message:edited id:', data?.messageId?.substring(0,8));
    if (callbacks.onMessageEdited) callbacks.onMessageEdited(data);
  });

  socket.on('message:deleted', (data) => {
    console.log('[WS EVENT] message:deleted id:', data?.messageId?.substring(0,8));
    if (callbacks.onMessageDeleted) callbacks.onMessageDeleted(data);
  });

  socket.on('typing', (data) => {
    if (callbacks.onTyping) callbacks.onTyping(data);
  });

  socket.on('conversation:updated', (data) => {
    console.log('[WS EVENT] conversation:updated conv:', data?.conversationId?.substring(0,8));
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
    console.log('[WS JOIN] room conv:', convId?.substring(0,8));
    socket.emit('join:conversation', convId);
  } else if (socket) {
    console.log('[WS JOIN] esperando conexión para unirse a:', convId?.substring(0,8));
    const onConnect = () => {
      console.log('[WS JOIN] socket conectado, uniendo a:', convId?.substring(0,8));
      socket.emit('join:conversation', convId);
      socket.off('connect', onConnect);
    };
    socket.on('connect', onConnect);
  } else {
    console.warn('[WS JOIN] no hay socket para unirse a:', convId?.substring(0,8));
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
