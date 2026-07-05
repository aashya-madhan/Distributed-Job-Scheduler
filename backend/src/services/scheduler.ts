import cron from 'node-cron';
import cronParser from 'cron-parser';
import prisma from '../utils/prisma';
import logger from '../utils/logger';

export class SchedulerService {
  private task: cron.ScheduledTask | null = null;

  start() {
    // Run every 10 seconds to promote scheduled/recurring jobs
    this.task = cron.schedule('*/10 * * * * *', async () => {
      await this.promoteScheduledJobs();
      await this.processRecurringJobs();
    });
    logger.info('Scheduler started');
  }

  stop() {
    this.task?.stop();
    logger.info('Scheduler stopped');
  }

  private async promoteScheduledJobs() {
    try {
      await prisma.job.updateMany({
        where: {
          status: 'SCHEDULED',
          type: { in: ['DELAYED', 'SCHEDULED'] },
          OR: [
            { scheduledAt: { lte: new Date() } },
            { nextRunAt: { lte: new Date() } },
          ],
        },
        data: { status: 'QUEUED' },
      });
    } catch (err) {
      logger.error('Error promoting scheduled jobs:', err);
    }
  }

  private async processRecurringJobs() {
    try {
      const dueJobs = await prisma.job.findMany({
        where: {
          type: 'RECURRING',
          status: 'SCHEDULED',
          nextRunAt: { lte: new Date() },
          cronExpression: { not: null },
        },
      });

      for (const job of dueJobs) {
        try {
          const interval = cronParser.parseExpression(job.cronExpression!);
          const nextRunAt = interval.next().toDate();

          await prisma.job.update({
            where: { id: job.id },
            data: { status: 'QUEUED', nextRunAt },
          });
        } catch (err) {
          logger.error(`Failed to process recurring job ${job.id}:`, err);
        }
      }
    } catch (err) {
      logger.error('Error processing recurring jobs:', err);
    }
  }
}

export const schedulerService = new SchedulerService();
