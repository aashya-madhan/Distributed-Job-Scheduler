import { Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError, ForbiddenError } from '../utils/errors';
import { JobStatus } from '@prisma/client';
import { wsService } from '../services/websocket';

const verifyProjectOwner = async (projectId: string, userId: string) => {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw new NotFoundError('Project');
  if (project.ownerId !== userId) throw new ForbiddenError();
  return project;
};

export const getQueues = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await verifyProjectOwner(req.params.projectId, req.user!.id);
    const queues = await prisma.queue.findMany({
      where: { projectId: req.params.projectId },
      include: {
        _count: { select: { jobs: true, workers: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: queues });
  } catch (err) { next(err); }
};

export const createQueue = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    await verifyProjectOwner(req.params.projectId, req.user!.id);
    const { name, description, priority, concurrencyLimit, maxRetries, retryStrategy, retryDelay } = req.body;
    const queue = await prisma.queue.create({
      data: {
        projectId: req.params.projectId,
        name, description,
        priority: priority ?? 0,
        concurrencyLimit: concurrencyLimit ?? 5,
        maxRetries: maxRetries ?? 3,
        retryStrategy: retryStrategy ?? 'EXPONENTIAL',
        retryDelay: retryDelay ?? 1000,
      },
    });
    res.status(201).json({ success: true, data: queue });
  } catch (err) { next(err); }
};

export const getQueue = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queue = await prisma.queue.findUnique({
      where: { id: req.params.queueId },
      include: {
        project: true,
        _count: { select: { jobs: true, workers: true } },
      },
    });
    if (!queue) throw new NotFoundError('Queue');
    await verifyProjectOwner(queue.projectId, req.user!.id);
    res.json({ success: true, data: queue });
  } catch (err) { next(err); }
};

export const updateQueue = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queue = await prisma.queue.findUnique({ where: { id: req.params.queueId } });
    if (!queue) throw new NotFoundError('Queue');
    await verifyProjectOwner(queue.projectId, req.user!.id);

    const updated = await prisma.queue.update({
      where: { id: req.params.queueId },
      data: req.body,
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

export const deleteQueue = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queue = await prisma.queue.findUnique({ where: { id: req.params.queueId } });
    if (!queue) throw new NotFoundError('Queue');
    await verifyProjectOwner(queue.projectId, req.user!.id);

    await prisma.queue.delete({ where: { id: req.params.queueId } });
    res.json({ success: true, message: 'Queue deleted' });
  } catch (err) { next(err); }
};

export const pauseQueue = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queue = await prisma.queue.findUnique({ where: { id: req.params.queueId } });
    if (!queue) throw new NotFoundError('Queue');
    await verifyProjectOwner(queue.projectId, req.user!.id);

    const updated = await prisma.queue.update({
      where: { id: req.params.queueId },
      data: { isPaused: true },
    });
    wsService.broadcast(`queue:${updated.id}`, { event: 'queue:paused', data: { id: updated.id } });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

export const resumeQueue = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queue = await prisma.queue.findUnique({ where: { id: req.params.queueId } });
    if (!queue) throw new NotFoundError('Queue');
    await verifyProjectOwner(queue.projectId, req.user!.id);

    const updated = await prisma.queue.update({
      where: { id: req.params.queueId },
      data: { isPaused: false },
    });
    wsService.broadcast(`queue:${updated.id}`, { event: 'queue:resumed', data: { id: updated.id } });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

export const getQueueStats = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const queue = await prisma.queue.findUnique({ where: { id: req.params.queueId } });
    if (!queue) throw new NotFoundError('Queue');
    await verifyProjectOwner(queue.projectId, req.user!.id);

    const [statusCounts, throughput, workers] = await Promise.all([
      prisma.job.groupBy({
        by: ['status'],
        where: { queueId: req.params.queueId },
        _count: true,
      }),
      prisma.jobExecution.aggregate({
        where: {
          job: { queueId: req.params.queueId },
          status: 'SUCCESS',
          startedAt: { gte: new Date(Date.now() - 3600000) },
        },
        _count: true,
        _avg: { durationMs: true },
      }),
      prisma.worker.count({
        where: { queueId: req.params.queueId, status: { not: 'OFFLINE' } },
      }),
    ]);

    const stats: Record<string, number> = {};
    statusCounts.forEach((s) => { stats[s.status] = s._count; });

    res.json({
      success: true,
      data: {
        jobsByStatus: stats,
        activeWorkers: workers,
        throughputLastHour: throughput._count,
        avgDurationMs: throughput._avg.durationMs ?? 0,
      },
    });
  } catch (err) { next(err); }
};
