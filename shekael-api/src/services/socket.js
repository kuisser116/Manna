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
    pingInterval: 30000,
    pingTimeout: 10000,
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
    } catch (err) {
      next(new Error('Token inválido o expirado'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.userId;
    void(`[WS] Conectado: ${userId?.substring(0,8)} (${socket.id})`);

    // Trackear usuario
    if (!connectedUsers.has(userId)) {
      connectedUsers.set(userId, new Set());
    }
    connectedUsers.get(userId).add(socket.id);

    // Unirse a una conversación (room)
    socket.on('join:conversation', (convId) => {
      if (!convId) return;
      socket.join(`conv:${convId}`);
      void(`[WS] ${userId?.substring(0,8)} joined conv:${convId?.substring(0,8)}`);
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
      void(`[WS] Desconectado: ${userId?.substring(0,8)}`);
    });
  });

  void('[WS] Socket.IO inicializado');
  return io;
}

export function getIO() {
  return io;
}

// Helpers para emitir desde rutas HTTP

export function emitToConversation(conversationId, event, data) {
  if (!io) {
    void(`[WS EMIT FAIL] io es null, evento: ${event}, conv: ${conversationId?.substring(0,8)}`);
    return;
  }
  const room = `conv:${conversationId}`;
  const socketsInRoom = io.sockets.adapter.rooms.get(room);
  const count = socketsInRoom ? socketsInRoom.size : 0;
  void(`[WS EMIT] ${event} → room:${conversationId?.substring(0,8)} sockets:${count}`);
  io.to(room).emit(event, data);
}

export function emitToUser(userId, event, data) {
  if (!io) {
    void(`[WS EMIT FAIL] io es null, evento: ${event}, userId: ${userId?.substring(0,8)}`);
    return;
  }
  const sockets = connectedUsers.get(userId);
  if (sockets) {
    void(`[WS EMIT] ${event} → user:${userId?.substring(0,8)} sockets:${sockets.size}`);
    sockets.forEach((socketId) => {
      io.to(socketId).emit(event, data);
    });
  } else {
    void(`[WS EMIT NO_USER] ${event} → user:${userId?.substring(0,8)} (no conectado)`);
  }
}

export function isUserOnline(userId) {
  return connectedUsers.has(userId) && connectedUsers.get(userId).size > 0;
}
