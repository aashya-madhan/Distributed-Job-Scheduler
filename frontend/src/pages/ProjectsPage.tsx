import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Plus, Briefcase, Key, Trash2, ChevronRight,
  RefreshCw, Copy, Check, FolderOpen,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { projectsApi } from '../services/api';
import type { Project } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import { format } from 'date-fns';

function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={copy}
      title={copied ? 'Copied!' : label}
      className="btn-ghost btn-sm btn-icon text-slate-500 hover:text-slate-200"
    >
      {copied
        ? <Check className="w-3.5 h-3.5 text-emerald-400" />
        : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

export default function ProjectsPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editProject, setEditProject] = useState<Project | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [regenTarget, setRegenTarget] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then((r) => r.data.data as Project[]),
  });

  const openCreate = () => {
    setName(''); setDescription('');
    setShowCreate(true);
  };

  const openEdit = (p: Project) => {
    setEditProject(p);
    setName(p.name);
    setDescription(p.description ?? '');
  };

  const createMut = useMutation({
    mutationFn: () => projectsApi.create({ name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project created');
      setShowCreate(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create project'),
  });

  const editMut = useMutation({
    mutationFn: () => projectsApi.update(editProject!.id, { name, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project updated');
      setEditProject(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update project'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => projectsApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('Project deleted');
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete project'),
  });

  const regenMut = useMutation({
    mutationFn: (id: string) => projectsApi.regenerateKey(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      toast.success('API key regenerated');
      setRegenTarget(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed'),
  });

  if (isLoading) return <LoadingSpinner label="Loading projects…" />;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Projects</h1>
          <p className="page-subtitle">Organize job queues under separate projects</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> New Project
        </button>
      </div>

      {!data?.length ? (
        <EmptyState
          icon={Briefcase}
          title="No projects yet"
          description="Create a project to start organizing your job queues and API keys"
          action={<button onClick={openCreate} className="btn-primary">Create Project</button>}
        />
      ) : (
        <div className="grid gap-3">
          {data.map((project) => (
            <div
              key={project.id}
              className="card group hover:border-slate-700/80 transition-colors animate-fade-in"
            >
              <div className="flex items-center justify-between gap-4">
                {/* Left: info */}
                <div className="flex items-center gap-4 flex-1 min-w-0">
                  <div className="p-2.5 bg-blue-500/10 border border-blue-500/20 rounded-xl flex-shrink-0">
                    <Briefcase className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-white">{project.name}</h3>
                      <span className="text-xs text-slate-600">
                        {project._count?.queues ?? 0} queue{project._count?.queues !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {project.description && (
                      <p className="text-sm text-slate-400 mt-0.5 truncate">{project.description}</p>
                    )}
                    <div className="flex items-center gap-1 mt-2">
                      <Key className="w-3 h-3 text-slate-600 flex-shrink-0" />
                      <code className="text-[11px] font-mono text-slate-500">
                        {project.apiKey.slice(0, 20)}…
                      </code>
                      <CopyButton value={project.apiKey} label="Copy API key" />
                    </div>
                    <p className="text-[10px] text-slate-600 mt-0.5">
                      Created {format(new Date(project.createdAt), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>

                {/* Right: actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(project)}
                    className="btn-ghost btn-sm text-slate-400"
                    title="Edit project"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => setRegenTarget(project)}
                    className="btn-ghost btn-icon text-slate-500 hover:text-amber-400"
                    title="Regenerate API key"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setDeleteTarget(project)}
                    className="btn-ghost btn-icon text-slate-500 hover:text-red-400"
                    title="Delete project"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                  <Link
                    to={`/queues`}
                    className="btn-secondary btn-sm ml-1"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Queues
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Project">
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }} className="space-y-4">
          <div>
            <label className="label" htmlFor="proj-name">Project name *</label>
            <input
              id="proj-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              placeholder="My Project"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="proj-desc">Description</label>
            <input
              id="proj-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              placeholder="Optional description"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary">
              {createMut.isPending ? 'Creating…' : 'Create Project'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editProject} onClose={() => setEditProject(null)} title="Edit Project">
        <form onSubmit={(e) => { e.preventDefault(); editMut.mutate(); }} className="space-y-4">
          <div>
            <label className="label" htmlFor="edit-name">Project name *</label>
            <input
              id="edit-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input"
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label" htmlFor="edit-desc">Description</label>
            <input
              id="edit-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input"
              placeholder="Optional description"
            />
          </div>
          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setEditProject(null)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={editMut.isPending} className="btn-primary">
              {editMut.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMut.mutate(deleteTarget.id)}
        title="Delete Project"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This will remove all associated queues and jobs permanently.`}
        confirmLabel="Delete Project"
        variant="danger"
        loading={deleteMut.isPending}
      />

      {/* Regen confirm */}
      <ConfirmDialog
        isOpen={!!regenTarget}
        onClose={() => setRegenTarget(null)}
        onConfirm={() => regenTarget && regenMut.mutate(regenTarget.id)}
        title="Regenerate API Key"
        message={`This will invalidate the current API key for "${regenTarget?.name}". Any services using the old key will lose access immediately.`}
        confirmLabel="Regenerate Key"
        variant="warning"
        loading={regenMut.isPending}
      />
    </div>
  );
}
