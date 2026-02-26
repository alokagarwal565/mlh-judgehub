import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';
import authRoutes from './routes/auth.js';
import eventRoutes from './routes/events.js';
import projectRoutes from './routes/projects.js';
import judgeRoutes from './routes/judges.js';
import assignmentRoutes from './routes/assignments.js';
import scoreRoutes from './routes/scores.js';
import resultRoutes from './routes/results.js';
import flagRoutes from './routes/flags.js';
import trackRoutes from './routes/tracks.js';
import userRoutes from './routes/users.js';
import editRequestRoutes from './routes/editRequests.js';
import { setupSocket } from './socket/handler.js';

export const prisma = new PrismaClient();
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  transports: ['polling', 'websocket']
});

app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

app.set('io', io);

app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/events', projectRoutes);
app.use('/api/events', judgeRoutes);
app.use('/api/events', assignmentRoutes);
app.use('/api/events', scoreRoutes);
app.use('/api/events', resultRoutes);
app.use('/api/events', flagRoutes);
app.use('/api/events', trackRoutes);
app.use('/api/admin', userRoutes);
app.use('/api/edit-requests', editRequestRoutes);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

setupSocket(io);

// Only bind port when running locally
if (process.env.VERCEL !== '1') {
  const PORT = process.env.PORT || 3001;
  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
