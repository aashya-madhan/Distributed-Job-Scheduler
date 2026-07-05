import { Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError, ForbiddenError, ConflictError } from '../utils/errors';
import { JobStatus, JobType } from '@prisma/client';
import cronParser from 'cron-parser';
import { wsService } from '../services/websocket';

const verifyQueueAccess = async (queueId: string, userId: string) => {
  const queue = await prisma.queue.findUnique({
    where: { id: queueId },
    include: { project: true },
  });
  if (!queue) throw new NotFoundError('Queue');
  if (queue.project.ownerId !== userId) throw new ForbiddenError();
  return queue;
};

export const getJobs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queue = await verifyQueueAccess(req.params.queueId, req.user!.id);
    const { status, type, page = '1', limit = '20', search } = req.query;

    const where: any = { queueId: req.params.queueId };
    if (status) where.status = status as JobStatus;
    if (type) where.type = type as JobType;
    if (search) where.name = { contains: search as string, mode: 'insensitive' };

    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
        include: {
          _count: { select: { executions: true, logs: true } },
          dlqEntry: true,
        },
      }),
      prisma.job.count({ where }),
    ]);

    res.json({
      success: true,
      data: jobs,
      pagination: {
        total,
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  } catch (err) { next(err); }
};

export const createJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queue = await verifyQueueAccess(req.params.queueId, req.user!.id);
    const {
      name, type = 'IMMEDIATE', payload = {}, priority = 0,
      scheduledAt, cronExpression, runAt, maxRetries, retryStrategy,
      retryDelay, timeout, idempotencyKey,
    } = req.body;

    // Idempotency check
    if (idempotencyKey) {
      const existing = await prisma.job.findFirst({ where: { idempotencyKey, queueId: queue.id } });
      if (existing) throw new ConflictError('Job with this idempotency key already exists');
    }

    let nextRunAt: Date | undefined;
    let jobScheduledAt: Date | undefined;
    let status: JobStatus = 'QUEUED';

    if (type === 'DELAYED' && runAt) {
      jobScheduledAt = new Date(runAt);
      status = 'SCHEDULED';
      nextRunAt = new Date(runAt);
    } else if (type === 'SCHEDULED' && scheduledAt) {
      jobScheduledAt = new Date(scheduledAt);
      status = 'SCHEDULED';
      nextRunAt = new Date(scheduledAt);
    } else if (type === 'RECURRING' && cronExpression) {
      const interval = cronParser.parseExpression(cronExpression);
      nextRunAt = interval.next().toDate();
      status = 'SCHEDULED';
    }

    const job = await prisma.job.create({
      data: {
        queueId: queue.id,
        name,
        type: type as JobType,
        status,
        priority,
        payload,
        scheduledAt: jobScheduledAt,
        cronExpression,
        nextRunAt,
        runAt: runAt ? new Date(runAt) : undefined,
        maxRetries: maxRetries ?? queue.maxRetries,
        retryStrategy: retryStrategy ?? queue.retryStrategy,
        retryDelay: retryDelay ?? queue.retryDelay,
        timeout: timeout ?? 30000,
        idempotencyKey,
      },
    });

    wsService.broadcast(`queue:${queue.id}`, { event: 'job:created', data: job });
    res.status(201).json({ success: true, data: job });
  } catch (err) { next(err); }
};

export const getJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId },
      include: {
        queue: { include: { project: true } },
        executions: { orderBy: { startedAt: 'desc' }, take: 10 },
        logs: { orderBy: { createdAt: 'desc' }, take: 50 },
        dlqEntry: true,
      },
    });
    if (!job) throw new NotFoundError('Job');
    if (job.queue.project.ownerId !== req.user!.id) throw new ForbiddenError();
    res.json({ success: true, data: job });
  } catch (err) { next(err); }
};

export const cancelJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId },
      include: { queue: { include: { project: true } } },
    });
    if (!job) throw new NotFoundError('Job');
    if (job.queue.project.ownerId !== req.user!.id) throw new ForbiddenError();

    const updated = await prisma.job.update({
      where: { id: req.params.jobId },
      data: { status: 'CANCELLED' },
    });
    wsService.broadcast(`queue:${updated.queueId}`, { event: 'job:updated', data: { id: updated.id, status: 'CANCELLED', queueId: updated.queueId } });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

export const retryJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId },
      include: { queue: { include: { project: true } } },
    });
    if (!job) throw new NotFoundError('Job');
    if (job.queue.project.ownerId !== req.user!.id) throw new ForbiddenError();

    const updated = await prisma.job.update({
      where: { id: req.params.jobId },
      data: { status: 'QUEUED', retryCount: 0, failedAt: null },
    });
    wsService.broadcast(`queue:${updated.queueId}`, { event: 'job:updated', data: { id: updated.id, status: 'QUEUED', queueId: updated.queueId } });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

export const getJobLogs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const job = await prisma.job.findUnique({
      where: { id: req.params.jobId },
      include: { queue: { include: { project: true } } },
    });
    if (!job) throw new NotFoundError('Job');
    if (job.queue.project.ownerId !== req.user!.id) throw new ForbiddenError();

    const logs = await prisma.jobLog.findMany({
      where: { jobId: req.params.jobId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({ success: true, data: logs });
  } catch (err) { next(err); }
};

export const createBatchJobs = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queue = await verifyQueueAccess(req.params.queueId, req.user!.id);
    const { batchName, jobs } = req.body;

    const batch = await prisma.jobBatch.create({
      data: { name: batchName, projectId: queue.projectId, totalJobs: jobs.length, pending: jobs.length },
    });

    const created = await prisma.$transaction(
      jobs.map((j: any) =>
        prisma.job.create({
          data: {
            queueId: queue.id,
            name: j.name,
            type: 'BATCH',
            payload: j.payload ?? {},
            priority: j.priority ?? 0,
            maxRetries: j.maxRetries ?? queue.maxRetries,
            retryStrategy: j.retryStrategy ?? queue.retryStrategy,
            retryDelay: j.retryDelay ?? queue.retryDelay,
            batchId: batch.id,
          },
        })
      )
    );

    res.status(201).json({ success: true, data: { batch, jobs: created } });
  } catch (err) { next(err); }
};

export const getDLQ = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queue = await verifyQueueAccess(req.params.queueId, req.user!.id);
    const entries = await prisma.dLQEntry.findMany({
      where: { queueId: queue.id },
      include: { job: true },
      orderBy: { failedAt: 'desc' },
    });
    res.json({ success: true, data: entries });
  } catch (err) { next(err); }
};

export const retryDLQJob = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const entry = await prisma.dLQEntry.findUnique({
      where: { id: req.params.dlqId },
      include: { job: { include: { queue: { include: { project: true } } } } },
    });
    if (!entry) throw new NotFoundError('DLQ entry');
    if (entry.job.queue.project.ownerId !== req.user!.id) throw new ForbiddenError();

    await prisma.$transaction([
      prisma.job.update({
        where: { id: entry.jobId },
        data: { status: 'QUEUED', retryCount: 0, failedAt: null },
      }),
      prisma.dLQEntry.delete({ where: { id: req.params.dlqId } }),
    ]);

    wsService.broadcast(`queue:${entry.job.queueId}`, { event: 'job:updated', data: { id: entry.jobId, status: 'QUEUED', queueId: entry.job.queueId } });
    res.json({ success: true, message: 'Job requeued from DLQ' });
  } catch (err) { next(err); }
};
