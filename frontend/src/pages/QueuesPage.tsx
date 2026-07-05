import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  Plus, Layers, Pause, Play, Trash2,
  ChevronRight, Settings, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { queuesApi, projectsApi } from '../services/api';
import type { Queue, Project, RetryStrategy } from '../types';
import Modal from '../components/Modal';
import ConfirmDialog from '../components/ConfirmDialog';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import QueueStatsModal from '../components/QueueStatsModal';

type QueueWithProject = Queue & { projectName?: string };

export default function QueuesPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editQueue, setEditQueue] = useState<QueueWithProject | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QueueWithProject | null>(null);
  const [statsQueue, setStatsQueue] = useState<QueueWithProject | null>(null);
  const [selectedProject, setSelectedProject] = useState('');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    name: '', description: '', concurrencyLimit: 5,
    maxRetries: 3, retryStrategy: 'EXPONENTIAL' as RetryStrategy, retryDelay: 1000,
  });

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then((r) => r.data.data as Project[]),
  });

  const { data: queues, isLoading } = useQuery({
    queryKey: ['all-queues', projects?.map((p) => p.id).join(',')],
    queryFn: async () => {
      if (!projects?.length) return [];
      const all = await Promise.all(
        projects.map((p) =>
          queuesApi.list(p.id).then((r) =>
            (r.data.data as Queue[]).map((q) => ({ ...q, projectName: p.name }))
          ).catch(() => [] as QueueWithProject[])
        )
      );
      return all.flat();
    },
    enabled: !!projects?.length,
  });

  const openCreate = () => {
    setForm({ name: '', description: '', concurrencyLimit: 5, maxRetries: 3, retryStrategy: 'EXPONENTIAL', retryDelay: 1000 });
    setSelectedProject(projects?.[0]?.id ?? '');
    setShowCreate(true);
  };

  const openEdit = (q: QueueWithProject) => {
    setEditQueue(q);
    setForm({
      name: q.name,
      description: q.description ?? '',
      concurrencyLimit: q.concurrencyLimit,
      maxRetries: q.maxRetries,
      retryStrategy: q.retryStrategy,
      retryDelay: q.retryDelay,
    });
  };

  const createMut = useMutation({
    mutationFn: () => queuesApi.create(selectedProject, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-queues'] });
      toast.success('Queue created');
      setShowCreate(false);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to create queue'),
  });

  const editMut = useMutation({
    mutationFn: () => queuesApi.update(editQueue!.projectId, editQueue!.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-queues'] });
      toast.success('Queue updated');
      setEditQueue(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to update queue'),
  });

  const pauseMut = useMutation({
    mutationFn: ({ projectId, queueId }: { projectId: string; queueId: string }) =>
      queuesApi.pause(projectId, queueId),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['all-queues'] });
      toast.success('Queue paused');
    },
  });

  const resumeMut = useMutation({
    mutationFn: ({ projectId, queueId }: { projectId: string; queueId: string }) =>
      queuesApi.resume(projectId, queueId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-queues'] });
      toast.success('Queue resumed');
    },
  });

  const deleteMut = useMutation({
    mutationFn: ({ projectId, queueId }: { projectId: string; queueId: string }) =>
      queuesApi.delete(projectId, queueId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['all-queues'] });
      toast.success('Queue deleted');
      setDeleteTarget(null);
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Failed to delete queue'),
  });

  const filtered = (queues ?? []).filter((q) =>
    !search || q.name.toLowerCase().includes(search.toLowerCase()) ||
    q.projectName?.toLowerCase().includes(search.toLowerCase())
  );

  const QueueForm = ({ onSubmit, loading }: { onSubmit: () => void; loading: boolean }) => (
    <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} className="space-y-4">
      {showCreate && (
        <div>
          <label className="label">Project *</label>
          <select value={selectedProject} onChange={(e) => setSelectedProject(e.target.value)}
            className="input" required>
            <option value="">Select a project…</option>
            {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="label">Queue name *</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input" placeholder="default" required autoFocus
          />
        </div>
        <div>
          <label className="label">Concurrency limit</label>
          <input
            type="number" min={1} max={100}
            value={form.concurrencyLimit}
            onChange={(e) => setForm({ ...form, concurrencyLimit: +e.target.value })}
            className="input"
          />
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="label">Max retries</label>
          <input
            type="number" min={0} max={50}
            value={form.maxRetries}
            onChange={(e) => setForm({ ...form, maxRetries: +e.target.value })}
            className="input"
          />
        </div>
        <div>
          <label className="label">Retry strategy</label>
          <select
            value={form.retryStrategy}
            onChange={(e) => setForm({ ...form, retryStrategy: e.target.value as RetryStrategy })}
            className="input"
          >
            <option value="FIXED">Fixed</option>
            <option value="LINEAR">Linear</option>
            <option value="EXPONENTIAL">Exponential</option>
          </select>
        </div>
        <div>
          <label className="label">Retry delay (ms)</label>
          <input
            type="number" min={100}
            value={form.retryDelay}
            onChange={(e) => setForm({ ...form, retryDelay: +e.target.value })}
            className="input"
          />
        </div>
      </div>
      <div>
        <label className="label">Description</label>
        <input
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          className="input" placeholder="Optional"
        />
      </div>
      <div className="flex justify-end gap-3 pt-1">
        <button
          type="button"
          onClick={() => { setShowCreate(false); setEditQueue(null); }}
          className="btn-secondary"
        >
          Cancel
        </button>
        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Saving…' : showCreate ? 'Create Queue' : 'Save Changes'}
        </button>
      </div>
    </form>
  );

  if (isLoading) return <LoadingSpinner label="Loading queues…" />;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Queues</h1>
          <p className="page-subtitle">
            {queues?.length ?? 0} queue{queues?.length !== 1 ? 's' : ''} across all projects
          </p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus className="w-4 h-4" /> New Queue
        </button>
      </div>

      {/* Search */}
      {(queues?.length ?? 0) > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9 py-1.5 text-xs"
            placeholder="Search queues…"
          />
        </div>
      )}

      {!filtered.length ? (
        <EmptyState
          icon={Layers}
          title={search ? 'No matching queues' : 'No queues yet'}
          description={search ? 'Try a different search term' : 'Create a queue to start processing jobs'}
          action={!search ? (
            <button onClick={openCreate} className="btn-primary">Create Queue</button>
          ) : undefined}
        />
      ) : (
        <div className="grid gap-3">
          {filtered.map((queue) => (
            <div key={queue.id} className="card group hover:border-slate-700/80 transition-colors">
              <div className="flex items-center gap-4">
                {/* Status indicator */}
                <div className={`p-2.5 rounded-xl flex-shrink-0 ${
                  queue.isPaused
                    ? 'bg-amber-500/10 border border-amber-500/20'
                    : 'bg-blue-500/10 border border-blue-500/20'
                }`}>
                  <Layers className={`w-4 h-4 ${queue.isPaused ? 'text-amber-400' : 'text-blue-400'}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-white">{queue.name}</h3>
                    {queue.isPaused && (
                      <span className="badge bg-amber-500/15 text-amber-400 border border-amber-500/30">
                        PAUSED
                      </span>
                    )}
                    <span className="text-xs text-slate-600">{queue.projectName}</span>
                  </div>
                  {queue.description && (
                    <p className="text-xs text-slate-500 mt-0.5 truncate">{queue.description}</p>
                  )}
                  <div className="flex items-center gap-4 mt-1.5 text-[11px] text-slate-500">
                    <span>{queue._count?.jobs ?? 0} jobs</span>
                    <span>concurrency: {queue.concurrencyLimit}</span>
                    <span>retries: {queue.maxRetries} · {queue.retryStrategy.toLowerCase()}</span>
                    <span>delay: {queue.retryDelay}ms</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => openEdit(queue)}
                    className="btn-ghost btn-sm text-slate-400"
                    title="Edit queue settings"
                  >
                    <Settings className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setStatsQueue(queue)}
                    className="btn-ghost btn-sm text-slate-400 text-xs"
                    title="View queue stats"
                  >
                    Stats
                  </button>

                  {queue.isPaused ? (
                    <button
                      onClick={() => resumeMut.mutate({ projectId: queue.projectId, queueId: queue.id })}
                      className="btn-ghost btn-sm text-emerald-400 hover:text-emerald-300"
                      title="Resume queue"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span className="text-xs">Resume</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => pauseMut.mutate({ projectId: queue.projectId, queueId: queue.id })}
                      className="btn-ghost btn-sm text-amber-400 hover:text-amber-300"
                      title="Pause queue"
                    >
                      <Pause className="w-3.5 h-3.5" />
                      <span className="text-xs">Pause</span>
                    </button>
                  )}

                  <button
                    onClick={() => setDeleteTarget(queue)}
                    className="btn-ghost btn-icon text-slate-500 hover:text-red-400"
                    title="Delete queue"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>

                  <Link to={`/queues/${queue.id}`} className="btn-secondary btn-sm ml-1">
                    Jobs <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Queue" size="lg">
        <QueueForm onSubmit={() => createMut.mutate()} loading={createMut.isPending} />
      </Modal>

      {/* Edit Modal */}
      <Modal isOpen={!!editQueue} onClose={() => setEditQueue(null)} title="Edit Queue" size="lg">
        <QueueForm onSubmit={() => editMut.mutate()} loading={editMut.isPending} />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() =>
          deleteTarget && deleteMut.mutate({ projectId: deleteTarget.projectId, queueId: deleteTarget.id })
        }
        title="Delete Queue"
        message={`Delete "${deleteTarget?.name}"? All jobs in this queue will be permanently removed.`}
        confirmLabel="Delete Queue"
        variant="danger"
        loading={deleteMut.isPending}
      />

      {/* Queue Stats */}
      {statsQueue && (
        <QueueStatsModal
          queue={statsQueue}
          isOpen={!!statsQueue}
          onClose={() => setStatsQueue(null)}
        />
      )}
    </div>
  );
}
