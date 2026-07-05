import { Router } from 'express';
import { body } from 'express-validator';
import {
  getJobs, createJob, getJob,
  cancelJob, retryJob, getJobLogs,
  createBatchJobs, getDLQ, retryDLQJob,
} from '../controllers/jobController';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router({ mergeParams: true });
router.use(authenticate);

// Read-only — all roles
router.get('/', getJobs);
router.get('/dlq', getDLQ);
router.get('/:jobId', getJob);
router.get('/:jobId/logs', getJobLogs);

// Write — ADMIN or MEMBER
router.post('/',
  requireRole('ADMIN', 'MEMBER'),
  body('name').trim().notEmpty(),
  body('type').optional().isIn(['IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH']),
  validate,
  createJob
);
router.post('/batch',
  requireRole('ADMIN', 'MEMBER'),
  body('batchName').trim().notEmpty(),
  body('jobs').isArray({ min: 1 }),
  validate,
  createBatchJobs
);
router.post('/:jobId/retry',    requireRole('ADMIN', 'MEMBER'), retryJob);
router.post('/dlq/:dlqId/retry', requireRole('ADMIN', 'MEMBER'), retryDLQJob);

// Cancel — ADMIN only
router.post('/:jobId/cancel', requireRole('ADMIN'), cancelJob);

export default router;
