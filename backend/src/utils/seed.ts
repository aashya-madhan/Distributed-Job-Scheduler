import prisma from './prisma';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('Seeding database...');

  const hash = await bcrypt.hash('password123', 12);

  const user = await prisma.user.upsert({
    where: { email: 'demo@example.com' },
    update: {},
    create: { email: 'demo@example.com', passwordHash: hash, name: 'Demo User', role: 'ADMIN' },
  });

  const project = await prisma.project.upsert({
    where: { apiKey: 'demo-api-key-00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      name: 'Demo Project',
      description: 'A sample project for demonstration',
      ownerId: user.id,
      apiKey: 'demo-api-key-00000000-0000-0000-0000-000000000001',
    },
  });

  const queue = await prisma.queue.upsert({
    where: { projectId_name: { projectId: project.id, name: 'default' } },
    update: {},
    create: {
      projectId: project.id,
      name: 'default',
      description: 'Default job queue',
      concurrencyLimit: 5,
      maxRetries: 3,
      retryStrategy: 'EXPONENTIAL',
    },
  });

  // Create sample jobs
  await prisma.job.createMany({
    skipDuplicates: true,
    data: [
      { queueId: queue.id, name: 'Send welcome email', type: 'IMMEDIATE', status: 'COMPLETED', payload: { email: 'user@example.com' } },
      { queueId: queue.id, name: 'Generate report', type: 'IMMEDIATE', status: 'RUNNING', payload: { reportId: 'rpt-001' } },
      { queueId: queue.id, name: 'Process payment', type: 'IMMEDIATE', status: 'QUEUED', payload: { amount: 99.99 } },
      { queueId: queue.id, name: 'Daily digest', type: 'RECURRING', status: 'SCHEDULED', cronExpression: '0 9 * * *', nextRunAt: new Date(Date.now() + 3600000) },
      { queueId: queue.id, name: 'Cleanup old files', type: 'SCHEDULED', status: 'SCHEDULED', scheduledAt: new Date(Date.now() + 7200000) },
      { queueId: queue.id, name: 'Sync inventory', type: 'IMMEDIATE', status: 'FAILED', retryCount: 3, failedAt: new Date() },
    ],
  });

  console.log(`Seeded: user=${user.email}, project=${project.name}, queue=${queue.name}`);
  await prisma.$disconnect();
}

seed().catch((e) => { console.error(e); process.exit(1); });
