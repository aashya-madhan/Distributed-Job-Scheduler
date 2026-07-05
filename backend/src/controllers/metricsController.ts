import { Response, NextFunction } from 'express';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';

export const getDashboardMetrics = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.user!.id;
    const projects = await prisma.project.findMany({ where: { ownerId: userId }, select: { id: true } });
    const projectIds = projects.map((p) => p.id);

    const [
      totalQueues,
      queuesByStatus,
      jobsByStatus,
      recentExecutions,
      workerStats,
      dlqCount,
      throughputData,
    ] = await Promise.all([
      prisma.queue.count({ where: { projectId: { in: projectIds } } }),

      prisma.queue.groupBy({
        by: ['isPaused'],
        where: { projectId: { in: projectIds } },
        _count: true,
      }),

      prisma.job.groupBy({
        by: ['status'],
        where: { queue: { projectId: { in: projectIds } } },
        _count: true,
      }),

      prisma.jobExecution.findMany({
        where: {
          job: { queue: { projectId: { in: projectIds } } },
          startedAt: { gte: new Date(Date.now() - 86400000) },
        },
        select: { status: true, durationMs: true, startedAt: true },
        orderBy: { startedAt: 'desc' },
        take: 500,
      }),

      prisma.worker.groupBy({
        by: ['status'],
        _count: true,
      }),

      prisma.dLQEntry.count({ where: { job: { queue: { projectId: { in: projectIds } } } } }),

      // Last 24h throughput bucketed by hour
      prisma.$queryRaw<{ hour: Date; count: bigint }[]>`
        SELECT date_trunc('hour', "startedAt") as hour, COUNT(*) as count
        FROM "JobExecution"
        WHERE "startedAt" >= NOW() - INTERVAL '24 hours'
        GROUP BY hour
        ORDER BY hour
      `,
    ]);

    const jobStats: Record<string, number> = {};
    jobsByStatus.forEach((j) => { jobStats[j.status] = j._count; });

    const workerMap: Record<string, number> = {};
    workerStats.forEach((w) => { workerMap[w.status] = w._count; });

    const successCount = recentExecutions.filter((e) => e.status === 'SUCCESS').length;
    const failCount = recentExecutions.filter((e) => e.status === 'FAILED').length;
    const avgDuration = recentExecutions
      .filter((e) => e.durationMs)
      .reduce((acc, e) => acc + (e.durationMs || 0), 0) / (recentExecutions.length || 1);

    res.json({
      success: true,
      data: {
        projects: projectIds.length,
        queues: {
          total: totalQueues,
          active: queuesByStatus.find((q) => !q.isPaused)?._count ?? 0,
          paused: queuesByStatus.find((q) => q.isPaused)?._count ?? 0,
        },
        jobs: jobStats,
        workers: workerMap,
        dlqCount,
        executions: {
          last24h: recentExecutions.length,
          successRate: recentExecutions.length ? (successCount / recentExecutions.length) * 100 : 0,
          failureRate: recentExecutions.length ? (failCount / recentExecutions.length) * 100 : 0,
          avgDurationMs: Math.round(avgDuration),
        },
        throughput: throughputData.map((t) => ({
          hour: t.hour,
          count: Number(t.count),
        })),
      },
    });
  } catch (err) { next(err); }
};
