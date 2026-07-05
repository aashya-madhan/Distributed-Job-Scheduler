import { Request, Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { NotFoundError } from '../utils/errors';
import { AuthRequest } from '../middleware/auth';
import os from 'os';
import cronParser from 'cron-parser';
import { wsService } from '../services/websocket';
import { calculateRetryDelay, canClaimJob } from '../utils/jobUtils';

export const registerWorker = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { queueId, concurrency = 1 } = req.body;
    const worker = await prisma.worker.create({
      data: {
        queueId: queueId || null,
        hostname: os.hostname(),
        pid: process.pid,
        concurrency,
        status: 'IDLE',
        lastHeartbeat: new Date(),
      },
      include: { queue: { select: { id: true, name: true } } },
    });
    wsService.broadcast('workers', { event: 'worker:registered', data: worker });
    res.status(201).json({ success: true, data: worker });
  } catch (err) { next(err); }
};

export const heartbeat = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workerId } = req.params;
    const { activeJobs = 0, memoryMb, cpuPercent } = req.body;

    const worker = await prisma.worker.findUnique({ where: { id: workerId } });
    if (!worker) throw new NotFoundError('Worker');

    const [updated] = await prisma.$transaction([
      prisma.worker.update({
        where: { id: workerId },
        data: {
          lastHeartbeat: new Date(),
          status: activeJobs > 0 ? 'BUSY' : 'IDLE',
        },
      }),
      prisma.workerHeartbeat.create({
        data: { workerId, activeJobs, memoryMb, cpuPercent },
      }),
    ]);

    wsService.broadcast('workers', { event: 'worker:heartbeat', data: { id: workerId, status: updated.status, activeJobs } });
    res.json({ success: true });
  } catch (err) { next(err); }
};

export const claimJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { workerId, queueId } = req.body;

    const result = await prisma.$transaction(async (tx) => {
      const queue = await tx.queue.findUnique({ where: { id: queueId } });
      if (!queue || !canClaimJob(0, queue.concurrencyLimit, queue.isPaused)) {
        // Quick pause check before counting
        if (!queue || queue.isPaused) return null;
      }

      const activeCount = await tx.jobExecution.count({
        where: { job: { queueId }, status: 'STARTED', finishedAt: null },
      });
      if (!canClaimJob(activeCount, queue!.concurrencyLimit, queue!.isPaused)) return null;

      // Find the highest-priority eligible job
      const job = await tx.job.findFirst({
        where: {
          queueId,
          status: 'QUEUED',
          OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
        },
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      });
      if (!job) return null;

      // Race-safe claim: updateMany returns count=0 if another worker already claimed it
      const { count } = await tx.job.updateMany({
        where: { id: job.id, status: 'QUEUED' },   // optimistic lock on status
        data:  { status: 'CLAIMED' },
      });
      if (count === 0) return null;  // lost the race — caller retries on next poll

      // Re-fetch to get current state after the update
      const claimed = await tx.job.findUniqueOrThrow({ where: { id: job.id } });

      const execution = await tx.jobExecution.create({
        data: { jobId: claimed.id, workerId, status: 'STARTED', attempt: claimed.retryCount + 1 },
      });

      await tx.worker.update({ where: { id: workerId }, data: { status: 'BUSY' } });

      return { job: claimed, execution };
    });

    if (result) {
      wsService.broadcast(`queue:${result.job.queueId}`, { event: 'job:claimed', data: result.job });
    }
    res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

export const completeJob = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { executionId } = req.params;
    const { result, error, status = 'SUCCESS' } = req.body;
    const finishedAt = new Date();

    const execution = await prisma.jobExecution.findUnique({
      where: { id: executionId },
      include: { job: { include: { queue: { include: { project: true } } } } },
    });
    if (!execution) throw new NotFoundError('Execution');

    const durationMs = finishedAt.getTime() - execution.startedAt.getTime();
    let finalJobStatus = 'COMPLETED';

    await prisma.$transaction(async (tx) => {
      await tx.jobExecution.update({
        where: { id: executionId },
        data: { status, finishedAt, durationMs, result, error },
      });

      const job = execution.job;

      if (status === 'SUCCESS') {
        if (job.type === 'RECURRING' && job.cronExpression) {
          const interval = cronParser.parseExpression(job.cronExpression);
          finalJobStatus = 'SCHEDULED';
          await tx.job.update({
            where: { id: job.id },
            data: { status: 'SCHEDULED', nextRunAt: interval.next().toDate(), completedAt: finishedAt },
          });
        } else {
          finalJobStatus = 'COMPLETED';
          await tx.job.update({ where: { id: job.id }, data: { status: 'COMPLETED', completedAt: finishedAt } });
        }
        await tx.worker.update({
          where: { id: execution.workerId! },
          data: { status: 'IDLE', jobsProcessed: { increment: 1 } },
        });
      } else {
        const newRetryCount = job.retryCount + 1;
        if (newRetryCount <= job.maxRetries) {
          const delay = calculateRetryDelay(job.retryStrategy, job.retryDelay, newRetryCount);
          finalJobStatus = 'QUEUED';
          await tx.job.update({
            where: { id: job.id },
            data: { status: 'QUEUED', retryCount: newRetryCount, scheduledAt: new Date(Date.now() + delay) },
          });
        } else {
          finalJobStatus = 'DEAD';
          await tx.job.update({ where: { id: job.id }, data: { status: 'DEAD', failedAt: finishedAt, retryCount: newRetryCount } });
          await tx.dLQEntry.upsert({
            where: { jobId: job.id },
            update: { reason: error || 'Max retries exceeded', lastError: error, retryCount: newRetryCount },
            create: {
              jobId: job.id, queueId: job.queueId,
              reason: error || 'Max retries exceeded',
              payload: job.payload as any,
              retryCount: newRetryCount, lastError: error,
            },
          });
        }
        await tx.worker.update({
          where: { id: execution.workerId! },
          data: { status: 'IDLE', jobsFailed: { increment: 1 } },
        });
      }

      await tx.jobLog.create({
        data: {
          jobId: job.id,
          level: status === 'SUCCESS' ? 'INFO' : 'ERROR',
          message: status === 'SUCCESS' ? `Job completed in ${durationMs}ms` : `Job failed: ${error}`,
          metadata: { executionId, durationMs },
        },
      });
    });

    // Broadcast job status update to subscribers
    wsService.broadcast(`queue:${execution.job.queueId}`, {
      event: 'job:updated',
      data: { id: execution.job.id, status: finalJobStatus, queueId: execution.job.queueId },
    });
    wsService.broadcast('workers', {
      event: 'worker:updated',
      data: { id: execution.workerId, status: 'IDLE' },
    });

    res.json({ success: true });
  } catch (err) { next(err); }
};

export const getWorkers = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const staleThreshold = parseInt(process.env.WORKER_STALE_THRESHOLD || '30000');
    await prisma.worker.updateMany({
      where: { lastHeartbeat: { lt: new Date(Date.now() - staleThreshold) }, status: { not: 'OFFLINE' } },
      data: { status: 'OFFLINE' },
    });

    const workers = await prisma.worker.findMany({
      include: {
        queue: { select: { id: true, name: true } },
        _count: { select: { executions: true } },
      },
      orderBy: { registeredAt: 'desc' },
    });
    res.json({ success: true, data: workers });
  } catch (err) { next(err); }
};

export const deregisterWorker = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const worker = await prisma.worker.update({
      where: { id: req.params.workerId },
      data: { status: 'OFFLINE' },
    });
    wsService.broadcast('workers', { event: 'worker:offline', data: { id: worker.id } });
    res.json({ success: true });
  } catch (err) { next(err); }
};
