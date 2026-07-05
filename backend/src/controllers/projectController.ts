import { Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../utils/prisma';
import { AuthRequest } from '../middleware/auth';
import { NotFoundError, ForbiddenError } from '../utils/errors';

export const getProjects = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const projects = await prisma.project.findMany({
      where: { ownerId: req.user!.id },
      include: { _count: { select: { queues: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: projects });
  } catch (err) { next(err); }
};

export const createProject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { name, description } = req.body;
    const project = await prisma.project.create({
      data: { name, description, ownerId: req.user!.id, apiKey: uuidv4() },
    });
    res.status(201).json({ success: true, data: project });
  } catch (err) { next(err); }
};

export const getProject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findUnique({
      where: { id: req.params.id },
      include: {
        queues: {
          include: { _count: { select: { jobs: true } } },
        },
        _count: { select: { queues: true } },
      },
    });
    if (!project) throw new NotFoundError('Project');
    if (project.ownerId !== req.user!.id) throw new ForbiddenError();
    res.json({ success: true, data: project });
  } catch (err) { next(err); }
};

export const updateProject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) throw new NotFoundError('Project');
    if (project.ownerId !== req.user!.id) throw new ForbiddenError();

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: { name: req.body.name, description: req.body.description },
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
};

export const deleteProject = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) throw new NotFoundError('Project');
    if (project.ownerId !== req.user!.id) throw new ForbiddenError();

    await prisma.project.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Project deleted' });
  } catch (err) { next(err); }
};

export const regenerateApiKey = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const project = await prisma.project.findUnique({ where: { id: req.params.id } });
    if (!project) throw new NotFoundError('Project');
    if (project.ownerId !== req.user!.id) throw new ForbiddenError();

    const updated = await prisma.project.update({
      where: { id: req.params.id },
      data: { apiKey: uuidv4() },
    });
    res.json({ success: true, data: { apiKey: updated.apiKey } });
  } catch (err) { next(err); }
};
