import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import http from 'http';
import { errorHandler, notFound } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import projectRoutes from './routes/projects';
import queueRoutes from './routes/queues';
import jobRoutes from './routes/jobs';
import workerRoutes from './routes/workers';
import metricsRoutes from './routes/metrics';
import { wsService } from './services/websocket';
import { schedulerService } from './services/scheduler';
import logger from './utils/logger';

const app = express();
const server = http.createServer(app);

// Support comma-separated list of allowed origins, e.g. "https://app.vercel.app,https://app.netlify.app"
const rawOrigins = process.env.FRONTEND_URL || 'http://localhost:5173';
const allowedOrigins = rawOrigins.split(',').map((o) => o.trim());

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, health checks)
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan('dev'));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/projects/:projectId/queues', queueRoutes);
app.use('/api/queues/:queueId/jobs', jobRoutes);
app.use('/api/workers', workerRoutes);
app.use('/api/metrics', metricsRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: new Date() }));

app.use(notFound);
app.use(errorHandler);

// WebSocket
wsService.initialize(server);

// Scheduler
schedulerService.start();

const PORT = process.env.PORT || 3001;

// Only bind port when not running in test environment
if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
  });
}

process.on('SIGTERM', () => {
  schedulerService.stop();
  server.close(() => process.exit(0));
});

export default app;
