import { Router } from 'express';
import { body } from 'express-validator';
import {
  getProjects, createProject, getProject,
  updateProject, deleteProject, regenerateApiKey,
} from '../controllers/projectController';
import { authenticate, requireRole } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();
router.use(authenticate);

// Any authenticated user can list and view projects
router.get('/', getProjects);
router.get('/:id', getProject);

// Creating and updating projects requires ADMIN or MEMBER role
router.post('/',
  requireRole('ADMIN', 'MEMBER'),
  body('name').trim().notEmpty(),
  validate,
  createProject
);
router.put('/:id',
  requireRole('ADMIN', 'MEMBER'),
  body('name').trim().notEmpty(),
  validate,
  updateProject
);

// Destructive / sensitive operations require ADMIN role only
router.delete('/:id', requireRole('ADMIN'), deleteProject);
router.post('/:id/regenerate-key', requireRole('ADMIN'), regenerateApiKey);

export default router;
