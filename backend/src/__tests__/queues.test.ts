/**
 * Queues API tests — CRUD, pause/resume, stats.
 */
import request from 'supertest';
import app from '../index';
import prisma from '../utils/prisma';
import jwt from 'jsonwebtoken';

jest.mock('../services/scheduler', () => ({
  schedulerService: { start: jest.fn(), stop: jest.fn() },
}));
jest.mock('../services/websocket', () => ({
  wsService: { initialize: jest.fn(), broadcast: jest.fn(), broadcastToUser: jest.fn() },
}));
jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    user:    { findUnique: jest.fn() },
    project: { findUnique: jest.fn() },
    queue: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    job:          { groupBy: jest.fn() },
    jobExecution: { aggregate: jest.fn() },
    worker:       { count: jest.fn() },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const TEST_USER  = { id: 'user-1', email: 'u@test.com', role: 'ADMIN' };
const PROJECT_ID = 'proj-1';
const QUEUE_ID   = 'queue-1';
const validToken = () =>
  jwt.sign(TEST_USER, process.env.JWT_SECRET ?? 'dev-jwt-secret-key-change-in-production', { expiresIn: '1h' });

const makeProject = () => ({ id: PROJECT_ID, ownerId: 'user-1' });
const makeQueue   = (overrides = {}) => ({
  id: QUEUE_ID, projectId: PROJECT_ID, name: 'default',
  isPaused: false, concurrencyLimit: 5, maxRetries: 3,
  retryStrategy: 'EXPONENTIAL', retryDelay: 1000, priority: 0,
  createdAt: new Date(), updatedAt: new Date(),
  project: makeProject(),
  _count: { jobs: 0, workers: 0 },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(TEST_USER);
  (mockPrisma.project.findUnique as jest.Mock).mockResolvedValue(makeProject());
});

describe('GET /api/projects/:projectId/queues', () => {
  it('returns queue list', async () => {
    (mockPrisma.queue.findMany as jest.Mock).mockResolvedValueOnce([makeQueue()]);
    const res = await request(app)
      .get(`/api/projects/${PROJECT_ID}/queues`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});

describe('POST /api/projects/:projectId/queues', () => {
  it('returns 422 when name is missing', async () => {
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/queues`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ concurrencyLimit: 5 });
    expect(res.status).toBe(422);
  });

  it('creates a queue', async () => {
    (mockPrisma.queue.create as jest.Mock).mockResolvedValueOnce(makeQueue());
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/queues`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ name: 'default', concurrencyLimit: 5, maxRetries: 3, retryStrategy: 'EXPONENTIAL' });
    expect(res.status).toBe(201);
  });
});

describe('POST /api/projects/:projectId/queues/:queueId/pause', () => {
  it('pauses a queue', async () => {
    (mockPrisma.queue.findUnique as jest.Mock).mockResolvedValueOnce(makeQueue());
    (mockPrisma.queue.update as jest.Mock).mockResolvedValueOnce(makeQueue({ isPaused: true }));
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/queues/${QUEUE_ID}/pause`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isPaused).toBe(true);
  });
});

describe('POST /api/projects/:projectId/queues/:queueId/resume', () => {
  it('resumes a paused queue', async () => {
    (mockPrisma.queue.findUnique as jest.Mock).mockResolvedValueOnce(makeQueue({ isPaused: true }));
    (mockPrisma.queue.update as jest.Mock).mockResolvedValueOnce(makeQueue({ isPaused: false }));
    const res = await request(app)
      .post(`/api/projects/${PROJECT_ID}/queues/${QUEUE_ID}/resume`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.isPaused).toBe(false);
  });
});

describe('DELETE /api/projects/:projectId/queues/:queueId', () => {
  it('returns 403 for non-owner', async () => {
    // Project owner check passes (beforeEach mock), but queue's project owner is different
    (mockPrisma.queue.findUnique as jest.Mock).mockResolvedValueOnce(
      makeQueue({ project: { id: PROJECT_ID, ownerId: 'other-user' } })
    );
    // Override project mock so verifyProjectOwner sees a different owner
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValueOnce({ id: PROJECT_ID, ownerId: 'other-user' });
    const res = await request(app)
      .delete(`/api/projects/${PROJECT_ID}/queues/${QUEUE_ID}`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(403);
  });

  it('deletes the queue', async () => {
    (mockPrisma.queue.findUnique as jest.Mock).mockResolvedValueOnce(makeQueue());
    (mockPrisma.queue.delete as jest.Mock).mockResolvedValueOnce({});
    const res = await request(app)
      .delete(`/api/projects/${PROJECT_ID}/queues/${QUEUE_ID}`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
  });
});
