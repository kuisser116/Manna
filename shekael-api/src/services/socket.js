import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

const connectedUsers = new Map(); // userId -> Set<socketId>

let io = null;

export function initSocketIO(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL || [
        'http://localhost:5173',
        'http://localhost:4173',
        'http://127.0.0.1:5173',
        'http://127.0.0.1:4173',
      ],
      credentials: true,
    },
    // Minimizar overhead para datos móviles
    pingInterval: 30000,  // 30s entre pings
    pingTimeout: 10000,   // 10s para responder
    transports: ['websocket'], // Solo WS, sin polling HTTP
  });

  // Auth middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Token requerido'));
    }
    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = payload.id;
      socket.userEmail = payload.email;
      next();
    } catch {
      next(new Error('Token inválido o expirado'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    console.log(`[WS] Conectado: ${userId?.substring(0,8)} (${socket.id})`);

    // Trackear usuario
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId).add(socket.id);

    // Unirse a una conversación (room)
    socket.on('join:conversation', (convId) => {
      if (!convId) return;
      socket.join(`conv:${convId}`);
      console.log(`[WS] ${userId?.substring(0,8)} joined conv:${convId?.substring(0,8)}`);
    });

    // Salir de una conversación
    socket.on('leave:conversation', (convId) => {
      if (!convId) return;
      socket.leave(`conv:${convId}`);
    });

    // Typing indicator
    socket.on('typing', ({ conversationId, typing }) => {
      if (!conversationId) return;
      socket.to(`conv:${conversationId}`).emit('typing', {
        userId,
        conversationId,
        typing,
      });
    });

    // Desconexión
    socket.on('disconnect', () => {
      const sockets = connectedUsers.get(userId);
      if (sockets) {
        sockets.delete(socket.id);
        if (sockets.size === 0) {
          connectedUsers.delete(userId);
        }
      }
      console.log(`[WS] Desconectado: ${userId?.substring(0,8)}`);
    });
  });

  console.log('[WS] Socket.IO inicializado');
  return io;
}

export function getIO() {
  return io;
}

// Helpers para emitir desde rutas HTTP

export function emitToConversation(conversationId, event, data) {
  if (!io) return;
  io.to(`conv:${conversationId}`).emit(event, data);
}

export function emitToUser(userId, event, data) {
  if (!io) return;
  const sockets = connectedUsers.get(userId);
  if (sockets) {
    sockets.forEach((socketId) => {
      io.to(socketId).emit(event, data);
    });
  }
}

export function isUserOnline(userId) {
  return connectedUsers.has(userId) && connectedUsers.get(userId).size > 0;
}
