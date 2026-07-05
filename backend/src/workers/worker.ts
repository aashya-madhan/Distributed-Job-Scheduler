/**
 * Worker Service
 * - Polls queues, atomically claims jobs using updateMany (race-safe)
 * - Executes concurrently up to CONCURRENCY limit
 * - Sends heartbeats, supports graceful shutdown
 * - All shared logic imported from utils/jobUtils (same code the tests verify)
 */
import prisma from '../utils/prisma';
import logger from '../utils/logger';
import os from 'os';
import cronParser from 'cron-parser';
import { calculateRetryDelay, canClaimJob } from '../utils/jobUtils';

const QUEUE_ID          = process.env.QUEUE_ID || '';
const POLL_INTERVAL     = parseInt(process.env.WORKER_POLL_INTERVAL     || '2000');
const HEARTBEAT_INTERVAL = parseInt(process.env.WORKER_HEARTBEAT_INTERVAL || '10000');
const CONCURRENCY       = parseInt(process.env.WORKER_CONCURRENCY       || '3');

let workerId: string | null = null;
let isShuttingDown = false;
let activeJobs = 0;

// ── Registration ─────────────────────────────────────────────────────────────

async function register() {
  const worker = await prisma.worker.create({
    data: {
      queueId: QUEUE_ID || null,
      hostname: os.hostname(),
      pid: process.pid,
      concurrency: CONCURRENCY,
      status: 'IDLE',
      lastHeartbeat: new Date(),
    },
  });
  workerId = worker.id;
  logger.info(`Worker registered: ${workerId}`);
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────

async function sendHeartbeat() {
  if (!workerId) return;
  try {
    await prisma.worker.update({
      where: { id: workerId },
      data: { lastHeartbeat: new Date(), status: activeJobs > 0 ? 'BUSY' : 'IDLE' },
    });
    await prisma.workerHeartbeat.create({
      data: { workerId, activeJobs, memoryMb: process.memoryUsage().rss / 1024 / 1024 },
    });
  } catch (err) {
    logger.error('Heartbeat failed:', err);
  }
}

// ── Atomic claim (race-safe) ──────────────────────────────────────────────────

async function claimAndExecute() {
  if (!workerId || isShuttingDown || activeJobs >= CONCURRENCY) return;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const whereClause: any = {
        status: 'QUEUED',
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      };
      if (QUEUE_ID) whereClause.queueId = QUEUE_ID;

      const job = await tx.job.findFirst({
        where: whereClause,
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: { queue: true },
      });
      if (!job) return null;

      // Shared gate — same logic as unit-tested canClaimJob
      const activeForQueue = await tx.jobExecution.count({
        where: { job: { queueId: job.queueId }, status: 'STARTED', finishedAt: null },
      });
      if (!canClaimJob(activeForQueue, job.queue.concurrencyLimit, job.queue.isPaused)) return null;

      // Race-safe: updateMany returns count=0 if another worker already claimed this job
      const { count } = await tx.job.updateMany({
        where: { id: job.id, status: 'QUEUED' },
        data:  { status: 'RUNNING' },
      });
      if (count === 0) return null;   // lost the race — skip, retry on next poll

      const claimed = await tx.job.findUniqueOrThrow({ where: { id: job.id } });

      const execution = await tx.jobExecution.create({
        data: {
          jobId: claimed.id,
          workerId: workerId!,
          status: 'STARTED',
          attempt: claimed.retryCount + 1,
        },
      });

      return { job: claimed, execution };
    });

    if (!result) return;

    activeJobs++;
    logger.info(`Executing job ${result.job.id} (${result.job.name})`);

    executeJob(result.job, result.execution.id).finally(() => { activeJobs--; });
  } catch (err) {
    logger.error('Claim error:', err);
  }
}

// ── Execution ────────────────────────────────────────────────────────────────

async function executeJob(job: any, executionId: string) {
  const startedAt = Date.now();
  try {
    await simulateWork(job);
    const durationMs = Date.now() - startedAt;

    await prisma.$transaction(async (tx) => {
      await tx.jobExecution.update({
        where: { id: executionId },
        data: { status: 'SUCCESS', finishedAt: new Date(), durationMs, result: { message: 'Completed' } },
      });

      if (job.type === 'RECURRING' && job.cronExpression) {
        const interval = cronParser.parseExpression(job.cronExpression);
        await tx.job.update({
          where: { id: job.id },
          data: { status: 'SCHEDULED', nextRunAt: interval.next().toDate(), completedAt: new Date() },
        });
      } else {
        await tx.job.update({
          where: { id: job.id },
          data: { status: 'COMPLETED', completedAt: new Date() },
        });
      }

      await tx.worker.update({ where: { id: workerId! }, data: { jobsProcessed: { increment: 1 } } });
      await tx.jobLog.create({
        data: { jobId: job.id, level: 'INFO', message: `Job completed in ${durationMs}ms`, metadata: { executionId } },
      });
    });

    logger.info(`Job ${job.id} completed in ${durationMs}ms`);
  } catch (err: any) {
    const durationMs = Date.now() - startedAt;
    const errorMsg = err.message || 'Unknown error';

    await prisma.$transaction(async (tx) => {
      await tx.jobExecution.update({
        where: { id: executionId },
        data: { status: 'FAILED', finishedAt: new Date(), durationMs, error: errorMsg },
      });

      const newRetryCount = job.retryCount + 1;
      if (newRetryCount <= job.maxRetries) {
        const delay = calculateRetryDelay(job.retryStrategy, job.retryDelay, newRetryCount);
        await tx.job.update({
          where: { id: job.id },
          data: { status: 'QUEUED', retryCount: newRetryCount, scheduledAt: new Date(Date.now() + delay) },
        });
        logger.info(`Job ${job.id} queued for retry #${newRetryCount} in ${delay}ms`);
      } else {
        await tx.job.update({
          where: { id: job.id },
          data: { status: 'DEAD', failedAt: new Date(), retryCount: newRetryCount },
        });
        await tx.dLQEntry.upsert({
          where: { jobId: job.id },
          update: { reason: errorMsg, lastError: errorMsg, retryCount: newRetryCount },
          create: {
            jobId: job.id, queueId: job.queueId,
            reason: errorMsg, payload: job.payload,
            retryCount: newRetryCount, lastError: errorMsg,
          },
        });
        logger.warn(`Job ${job.id} moved to DLQ after ${newRetryCount} retries`);
      }

      await tx.worker.update({ where: { id: workerId! }, data: { jobsFailed: { increment: 1 } } });
      await tx.jobLog.create({
        data: { jobId: job.id, level: 'ERROR', message: `Job failed: ${errorMsg}`, metadata: { executionId } },
      });
    });
  }
}

async function simulateWork(job: any) {
  const duration   = (job.payload as any)?.duration   ?? (Math.random() * 2000 + 500);
  const shouldFail = (job.payload as any)?.shouldFail ?? false;
  await new Promise((resolve) => setTimeout(resolve, duration));
  if (shouldFail) throw new Error('Simulated job failure');
}

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function gracefulShutdown() {
  logger.info('Worker shutting down gracefully…');
  isShuttingDown = true;

  while (activeJobs > 0) {
    logger.info(`Draining — ${activeJobs} active job(s) remaining…`);
    await new Promise((r) => setTimeout(r, 1000));
  }

  if (workerId) {
    await prisma.worker.update({ where: { id: workerId }, data: { status: 'OFFLINE' } });
  }

  logger.info('Worker shutdown complete');
  process.exit(0);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  await register();

  const heartbeatTimer = setInterval(sendHeartbeat,    HEARTBEAT_INTERVAL);
  const pollTimer      = setInterval(claimAndExecute,  POLL_INTERVAL);

  const shutdown = async () => {
    clearInterval(heartbeatTimer);
    clearInterval(pollTimer);
    await gracefulShutdown();
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT',  shutdown);

  logger.info(`Worker started — polling every ${POLL_INTERVAL}ms, concurrency ${CONCURRENCY}${QUEUE_ID ? `, queue ${QUEUE_ID}` : ' (all queues)'}`);
}

main().catch((err) => {
  logger.error('Worker failed to start:', err);
  process.exit(1);
});
