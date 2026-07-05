// Set env vars before any module is loaded
process.env.NODE_ENV    = 'test';
process.env.JWT_SECRET  = 'test-secret-key-for-jest';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
