import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
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
import { prisma } from './lib/prisma.js';

const allowedOrigins = process.env.CLIENT_ORIGIN
  ? process.env.CLIENT_ORIGIN.split(',').map(s => s.trim())
  : ['http://localhost:5173', 'http://localhost:3000', 'http://127.0.0.1:5173'];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    return callback(new Error('CORS not allowed for this origin'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  exposedHeaders: ['Content-Disposition']
};

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: allowedOrigins.includes('*') ? '*' : allowedOrigins, methods: ['GET', 'POST', 'PUT', 'DELETE'] },
  transports: ['polling', 'websocket']
});

app.use(cors(corsOptions));
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

// ponytail: Centralized Express error handler sanitizes call stacks in production
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[AppError]', err);
  const status = typeof err.status === 'number' ? err.status : 500;
  const message = process.env.NODE_ENV === 'production' && status === 500
    ? 'Internal server error'
    : err.message || 'An unexpected error occurred';
  res.status(status).json({ error: message });
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
