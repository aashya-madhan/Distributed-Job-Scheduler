/**
 * Jobs API tests — covers creation, pagination, cancellation, retry, DLQ.
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
    user: { findUnique: jest.fn() },
    queue: { findUnique: jest.fn() },
    job: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    jobLog: { findMany: jest.fn() },
    jobBatch: { create: jest.fn() },
    dLQEntry: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const TEST_USER = { id: 'user-1', email: 'u@test.com', role: 'ADMIN' };  // ADMIN to allow cancel
const QUEUE_ID  = 'queue-1';
const validToken = () =>
  jwt.sign(TEST_USER, process.env.JWT_SECRET ?? 'dev-jwt-secret-key-change-in-production', { expiresIn: '1h' });

const makeQueue = (overrides = {}) => ({
  id: QUEUE_ID,
  name: 'default',
  projectId: 'proj-1',
  isPaused: false,
  concurrencyLimit: 5,
  maxRetries: 3,
  retryStrategy: 'EXPONENTIAL',
  retryDelay: 1000,
  project: { id: 'proj-1', ownerId: 'user-1' },
  ...overrides,
});

const makeJob = (overrides = {}) => ({
  id: 'job-1',
  queueId: QUEUE_ID,
  name: 'test-job',
  type: 'IMMEDIATE',
  status: 'QUEUED',
  priority: 0,
  payload: {},
  retryCount: 0,
  maxRetries: 3,
  retryStrategy: 'EXPONENTIAL',
  retryDelay: 1000,
  timeout: 30000,
  createdAt: new Date(),
  updatedAt: new Date(),
  queue: { projectId: 'proj-1', project: { ownerId: 'user-1' } },
  _count: { executions: 0, logs: 0 },
  dlqEntry: null,
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(TEST_USER);
  (mockPrisma.queue.findUnique as jest.Mock).mockResolvedValue(makeQueue());
});

describe('GET /api/queues/:queueId/jobs', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get(`/api/queues/${QUEUE_ID}/jobs`);
    expect(res.status).toBe(401);
  });

  it('returns paginated job list', async () => {
    (mockPrisma.job.findMany as jest.Mock).mockResolvedValueOnce([makeJob()]);
    (mockPrisma.job.count as jest.Mock).mockResolvedValueOnce(1);

    const res = await request(app)
      .get(`/api/queues/${QUEUE_ID}/jobs`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.pagination.total).toBe(1);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('filters by status', async () => {
    (mockPrisma.job.findMany as jest.Mock).mockResolvedValueOnce([]);
    (mockPrisma.job.count as jest.Mock).mockResolvedValueOnce(0);

    const res = await request(app)
      .get(`/api/queues/${QUEUE_ID}/jobs?status=COMPLETED`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    // Verify the where clause would have status=COMPLETED
    const findManyCall = (mockPrisma.job.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.status).toBe('COMPLETED');
  });
});

describe('POST /api/queues/:queueId/jobs', () => {
  it('returns 422 when name is missing', async () => {
    const res = await request(app)
      .post(`/api/queues/${QUEUE_ID}/jobs`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ type: 'IMMEDIATE' });
    expect(res.status).toBe(422);
  });

  it('creates an immediate job', async () => {
    const job = makeJob();
    (mockPrisma.job.create as jest.Mock).mockResolvedValueOnce(job);

    const res = await request(app)
      .post(`/api/queues/${QUEUE_ID}/jobs`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ name: 'test-job', type: 'IMMEDIATE', payload: { key: 'val' } });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('test-job');
  });

  it('enforces idempotency key', async () => {
    (mockPrisma.job.findFirst as jest.Mock).mockResolvedValueOnce(makeJob());

    const res = await request(app)
      .post(`/api/queues/${QUEUE_ID}/jobs`)
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ name: 'dup-job', idempotencyKey: 'idem-1' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/queues/:queueId/jobs/:jobId/cancel', () => {
  it('cancels a queued job', async () => {
    const job = makeJob();
    (mockPrisma.job.findUnique as jest.Mock).mockResolvedValueOnce(job);
    (mockPrisma.job.update as jest.Mock).mockResolvedValueOnce({ ...job, status: 'CANCELLED' });

    const res = await request(app)
      .post(`/api/queues/${QUEUE_ID}/jobs/job-1/cancel`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('CANCELLED');
  });

  it('returns 403 when user is not owner', async () => {
    (mockPrisma.job.findUnique as jest.Mock).mockResolvedValueOnce(
      makeJob({ queue: { projectId: 'proj-1', project: { ownerId: 'other-user' } } })
    );
    const res = await request(app)
      .post(`/api/queues/${QUEUE_ID}/jobs/job-1/cancel`)
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(403);
  });
});

describe('POST /api/queues/:queueId/jobs/:jobId/retry', () => {
  it('requeues a failed job', async () => {
    const job = makeJob({ status: 'FAILED' });
    (mockPrisma.job.findUnique as jest.Mock).mockResolvedValueOnce(job);
    (mockPrisma.job.update as jest.Mock).mockResolvedValueOnce({ ...job, status: 'QUEUED', retryCount: 0 });

    const res = await request(app)
      .post(`/api/queues/${QUEUE_ID}/jobs/job-1/retry`)
      .set('Authorization', `Bearer ${validToken()}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('QUEUED');
  });
});
