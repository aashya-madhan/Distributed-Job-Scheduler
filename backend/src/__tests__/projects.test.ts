/**
 * Projects API tests — mocks Prisma + JWT auth.
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
    project: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

const TEST_USER = { id: 'user-1', email: 'u@test.com', role: 'ADMIN' };
const validToken = () =>
  jwt.sign(TEST_USER, process.env.JWT_SECRET ?? 'dev-jwt-secret-key-change-in-production', { expiresIn: '1h' });

const makeProject = (overrides = {}) => ({
  id: 'proj-1',
  name: 'My Project',
  description: 'desc',
  ownerId: 'user-1',
  orgId: null,
  apiKey: 'api-key-1',
  createdAt: new Date(),
  updatedAt: new Date(),
  _count: { queues: 0 },
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  (mockPrisma.user.findUnique as jest.Mock).mockResolvedValue(TEST_USER);
});

describe('GET /api/projects', () => {
  it('returns 401 without auth', async () => {
    const res = await request(app).get('/api/projects');
    expect(res.status).toBe(401);
  });

  it('returns list of projects', async () => {
    (mockPrisma.project.findMany as jest.Mock).mockResolvedValueOnce([makeProject()]);
    const res = await request(app)
      .get('/api/projects')
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /api/projects', () => {
  it('returns 422 when name is missing', async () => {
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ description: 'no name' });
    expect(res.status).toBe(422);
  });

  it('creates and returns a project', async () => {
    const proj = makeProject({ name: 'New Project' });
    (mockPrisma.project.create as jest.Mock).mockResolvedValueOnce(proj);
    const res = await request(app)
      .post('/api/projects')
      .set('Authorization', `Bearer ${validToken()}`)
      .send({ name: 'New Project', description: 'desc' });
    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('New Project');
  });
});

describe('DELETE /api/projects/:id', () => {
  it('returns 403 when user is not owner', async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValueOnce(makeProject({ ownerId: 'other-user' }));
    const res = await request(app)
      .delete('/api/projects/proj-1')
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(403);
  });

  it('deletes the project', async () => {
    (mockPrisma.project.findUnique as jest.Mock).mockResolvedValueOnce(makeProject());
    (mockPrisma.project.delete as jest.Mock).mockResolvedValueOnce({});
    const res = await request(app)
      .delete('/api/projects/proj-1')
      .set('Authorization', `Bearer ${validToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});
