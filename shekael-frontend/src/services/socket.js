import { io } from 'socket.io-client';

const API_URL = import.meta.env.VITE_API_URL || location.origin;

let socket = null;
let reconnectTimer = null;

const callbacks = {
  onMessageSent: null,
  onMessageEdited: null,
  onMessageDeleted: null,
  onTyping: null,
  onConversationUpdated: null,
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
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  });

  socket.on('disconnect', () => {});

  socket.on('connect_error', () => {});

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

export function joinConversation(convId) {
  if (!convId) return;
  if (socket?.connected) {
    socket.emit('join:conversation', convId);
  } else if (socket) {
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

let typingTimer = null;
export function emitTyping(conversationId, isTyping) {
  if (!socket?.connected || !conversationId) return;

  if (typingTimer) {
    clearTimeout(typingTimer);
    typingTimer = null;
  }

  socket.emit('typing', { conversationId, typing: isTyping });

  if (isTyping) {
    typingTimer = setTimeout(() => {
      socket.emit('typing', { conversationId, typing: false });
    }, 3000);
  }
}

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
