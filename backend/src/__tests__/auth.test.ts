/**
 * Auth API tests — mocks Prisma so no live DB is needed.
 */
import request from 'supertest';
import app from '../index';
import prisma from '../utils/prisma';
import bcrypt from 'bcryptjs';

// ── Silence scheduler / WS noise in tests ──────────────────────────────────
jest.mock('../services/scheduler', () => ({
  schedulerService: { start: jest.fn(), stop: jest.fn() },
}));
jest.mock('../services/websocket', () => ({
  wsService: { initialize: jest.fn(), broadcast: jest.fn(), broadcastToUser: jest.fn() },
}));
jest.mock('../utils/prisma', () => ({
  __esModule: true,
  default: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ── Helpers ─────────────────────────────────────────────────────────────────
const makeUser = (overrides = {}) => ({
  id: 'user-1',
  email: 'test@example.com',
  name: 'Test User',
  role: 'MEMBER' as const,
  passwordHash: bcrypt.hashSync('password123', 1),
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

// ── Tests ────────────────────────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 422 for invalid email', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'pass123', name: 'Alice' });
    expect(res.status).toBe(422);
  });

  it('returns 422 for short password', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'alice@example.com', password: '123', name: 'Alice' });
    expect(res.status).toBe(422);
  });

  it('returns 409 when email already registered', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(makeUser());
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'password123', name: 'Alice' });
    expect(res.status).toBe(409);
  });

  it('creates a user and returns token', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const user = makeUser();
    (mockPrisma.user.create as jest.Mock).mockResolvedValueOnce(user);

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'new@example.com', password: 'password123', name: 'New User' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.token).toBeDefined();
    expect(res.body.data.user.email).toBe(user.email);
  });
});

describe('POST /api/auth/login', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns 401 for unknown email', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(null);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'ghost@example.com', password: 'password123' });
    expect(res.status).toBe(401);
  });

  it('returns 401 for wrong password', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(makeUser());
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'wrongpassword' });
    expect(res.status).toBe(401);
  });

  it('returns token on valid credentials', async () => {
    (mockPrisma.user.findUnique as jest.Mock).mockResolvedValueOnce(makeUser());
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test@example.com', password: 'password123' });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeDefined();
  });
});

describe('GET /api/auth/me', () => {
  it('returns 401 without token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns 401 with malformed token', async () => {
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', 'Bearer not.a.real.token');
    expect(res.status).toBe(401);
  });
});
