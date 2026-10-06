import { Server, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, AuthPayload } from '../middleware/auth.js';

export function setupSocket(io: Server) {
  // Handshake authentication middleware
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) {
      return next(new Error('Authentication token required'));
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as AuthPayload;
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error('Invalid socket authentication token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const user = socket.data.user as AuthPayload | undefined;
    console.log(`Authenticated client connected: ${socket.id} (${user?.email || 'anonymous'})`);

    socket.on('join:event', (eventId: string) => {
      if (!eventId || typeof eventId !== 'string') return;
      socket.join(`event:${eventId}`);
      console.log(`Socket ${socket.id} joined event: ${eventId}`);
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
    });
  });
}
