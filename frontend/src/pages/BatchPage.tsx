import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Layers, Package, CheckCircle2, XCircle, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import { jobsApi, queuesApi, projectsApi } from '../services/api';
import type { Queue, Project, JobBatch } from '../types';
import Modal from '../components/Modal';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import { format } from 'date-fns';

interface BatchJobRow {
  id: string;       // local key only
  name: string;
  payload: string;
  priority: number;
}

function BatchProgress({ batch }: { batch: JobBatch }) {
  const pct = batch.totalJobs === 0 ? 0 : Math.round((batch.completed / batch.totalJobs) * 100);
  const failPct = batch.totalJobs === 0 ? 0 : Math.round((batch.failed / batch.totalJobs) * 100);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-400">Progress</span>
        <span className="text-slate-300 tabular-nums font-medium">{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden flex">
        <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${pct}%` }} />
        <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${failPct}%` }} />
      </div>
      <div className="flex gap-4 text-[10px] text-slate-500">
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
          {batch.completed} completed
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" />
          {batch.failed} failed
        </span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block" />
          {batch.pending} pending
        </span>
      </div>
    </div>
  );
}

const makeRow = (): BatchJobRow => ({
  id: Math.random().toString(36).slice(2),
  name: '',
  payload: '{}',
  priority: 0,
});

export default function BatchPage() {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedQueueId, setSelectedQueueId] = useState('');
  const [batchName, setBatchName] = useState('');
  const [rows, setRows] = useState<BatchJobRow[]>([makeRow(), makeRow()]);
  const [payloadError, setPayloadError] = useState('');

  // ── Data ────────────────────────────────────────────────────────────────
  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list().then((r) => r.data.data as Project[]),
  });

  const { data: queues } = useQuery({
    queryKey: ['all-queues', projects?.map((p) => p.id).join(',')],
    queryFn: async () => {
      if (!projects?.length) return [];
      const all = await Promise.all(
        projects.map((p) =>
          queuesApi.list(p.id)
            .then((r) => (r.data.data as Queue[]).map((q) => ({ ...q, projectName: p.name })))
            .catch(() => [] as (Queue & { projectName: string })[])
        )
      );
      return all.flat();
    },
    enabled: !!projects?.length,
  });

  // Fake "recent batches" — in a real app this would be a dedicated endpoint.
  // We derive it by listing the jobs for a queue and grouping by batchId.
  // For now we show a placeholder until the queue is selected.
  const { data: recentJobs, isLoading: loadingJobs } = useQuery({
    queryKey: ['batch-jobs', selectedQueueId],
    queryFn: () => jobsApi.list(selectedQueueId, { limit: '100' }).then((r) => r.data.data),
    enabled: !!selectedQueueId,
    refetchInterval: 8_000,
  });

  // Group jobs that have a batchId
  const batches = React.useMemo(() => {
    if (!recentJobs) return [];
    const map = new Map<string, { batchId: string; jobs: any[] }>();
    (recentJobs as any[]).forEach((job) => {
      if (!job.batchId) return;
      if (!map.has(job.batchId)) map.set(job.batchId, { batchId: job.batchId, jobs: [] });
      map.get(job.batchId)!.jobs.push(job);
    });
    return Array.from(map.values()).map(({ batchId, jobs }) => {
      const completed = jobs.filter((j) => j.status === 'COMPLETED').length;
      const failed    = jobs.filter((j) => j.status === 'FAILED' || j.status === 'DEAD').length;
      const pending   = jobs.filter((j) => !['COMPLETED','FAILED','DEAD','CANCELLED'].includes(j.status)).length;
      return {
        id: batchId,
        name: `Batch (${batchId.slice(0, 8)}…)`,
        totalJobs: jobs.length,
        completed,
        failed,
        pending,
        createdAt: jobs[0]?.createdAt ?? '',
        updatedAt: jobs[0]?.updatedAt ?? '',
        jobs,
      } as JobBatch;
    });
  }, [recentJobs]);

  // ── Row helpers ──────────────────────────────────────────────────────────
  const addRow = () => setRows((r) => [...r, makeRow()]);
  const removeRow = (id: string) => setRows((r) => r.filter((x) => x.id !== id));
  const updateRow = (id: string, field: keyof BatchJobRow, value: string | number) =>
    setRows((r) => r.map((x) => (x.id === id ? { ...x, [field]: value } : x)));

  // ── Create mutation ──────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: () => {
      // Validate all payloads
      for (const row of rows) {
        try { JSON.parse(row.payload || '{}'); }
        catch { throw new Error(`Row "${row.name || 'unnamed'}": invalid JSON payload`); }
      }
      return jobsApi.batch(selectedQueueId, {
        batchName,
        jobs: rows.map((r) => ({
          name: r.name,
          payload: JSON.parse(r.payload || '{}'),
          priority: r.priority,
        })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['batch-jobs', selectedQueueId] });
      qc.invalidateQueries({ queryKey: ['jobs', selectedQueueId] });
      toast.success(`Batch "${batchName}" created — ${rows.length} jobs queued`);
      setShowCreate(false);
      setBatchName('');
      setRows([makeRow(), makeRow()]);
      setPayloadError('');
    },
    onError: (e: any) => {
      const msg = e.message || e.response?.data?.error || 'Failed to create batch';
      setPayloadError(msg);
      toast.error(msg);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPayloadError('');
    if (!selectedQueueId) { toast.error('Select a queue first'); return; }
    if (!batchName.trim()) { toast.error('Batch name is required'); return; }
    const empty = rows.find((r) => !r.name.trim());
    if (empty) { toast.error('All job rows need a name'); return; }
    createMut.mutate();
  };

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Batch Jobs</h1>
          <p className="page-subtitle">Create and monitor groups of jobs that run together</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New Batch
        </button>
      </div>

      {/* Queue selector */}
      <div className="flex items-center gap-3">
        <Layers className="w-4 h-4 text-slate-500 flex-shrink-0" />
        <select
          value={selectedQueueId}
          onChange={(e) => setSelectedQueueId(e.target.value)}
          className="input w-64"
        >
          <option value="">Select a queue to view batches…</option>
          {(queues ?? []).map((q) => (
            <option key={q.id} value={q.id}>
              {q.name} ({(q as any).projectName})
            </option>
          ))}
        </select>
      </div>

      {/* Batch list */}
      {!selectedQueueId ? (
        <EmptyState
          icon={Package}
          title="Select a queue"
          description="Choose a queue above to see its batch jobs"
        />
      ) : loadingJobs ? (
        <LoadingSpinner label="Loading batches…" />
      ) : batches.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No batch jobs yet"
          description="Create a batch to enqueue multiple jobs at once in a single operation"
          action={
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              Create Batch
            </button>
          }
        />
      ) : (
        <div className="grid gap-4">
          {batches.map((batch) => (
            <div key={batch.id} className="card hover:border-slate-700/80 transition-colors">
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className="p-2.5 bg-violet-500/10 border border-violet-500/20 rounded-xl flex-shrink-0 mt-0.5">
                  <Package className="w-4 h-4 text-violet-400" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0 space-y-3">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <h3 className="font-semibold text-white">{batch.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        ID: <code className="font-mono text-slate-600">{batch.id.slice(0, 16)}…</code>
                        {batch.createdAt && (
                          <span className="ml-3">
                            Created {format(new Date(batch.createdAt), 'MMM d, HH:mm')}
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Summary badges */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="badge bg-slate-800 text-slate-300 border border-slate-700/50">
                        {batch.totalJobs} jobs
                      </span>
                      <span className="badge bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        <CheckCircle2 className="w-3 h-3" /> {batch.completed}
                      </span>
                      {batch.failed > 0 && (
                        <span className="badge bg-red-500/15 text-red-400 border border-red-500/30">
                          <XCircle className="w-3 h-3" /> {batch.failed}
                        </span>
                      )}
                      {batch.pending > 0 && (
                        <span className="badge bg-amber-500/15 text-amber-400 border border-amber-500/30">
                          <Clock className="w-3 h-3" /> {batch.pending}
                        </span>
                      )}
                    </div>
                  </div>

                  <BatchProgress batch={batch} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Batch Modal */}
      <Modal
        isOpen={showCreate}
        onClose={() => { setShowCreate(false); setPayloadError(''); }}
        title="New Batch"
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Batch config */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="batch-name">Batch name *</label>
              <input
                id="batch-name"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                className="input"
                placeholder="e.g. nightly-reports"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="batch-queue">Target queue *</label>
              <select
                id="batch-queue"
                value={selectedQueueId}
                onChange={(e) => setSelectedQueueId(e.target.value)}
                className="input"
                required
              >
                <option value="">Select queue…</option>
                {(queues ?? []).map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name} — {(q as any).projectName}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Jobs table */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">
                Jobs ({rows.length})
              </label>
              <button
                type="button"
                onClick={addRow}
                className="btn-ghost btn-sm text-blue-400 text-xs"
              >
                <Plus className="w-3.5 h-3.5" /> Add row
              </button>
            </div>

            <div className="border border-slate-700/50 rounded-xl overflow-hidden">
              {/* Column headers */}
              <div className="grid grid-cols-[1fr_1fr_80px_40px] gap-2 px-3 py-2
                              bg-slate-800/50 border-b border-slate-700/50 text-[10px]
                              font-semibold text-slate-500 uppercase tracking-wide">
                <span>Job name *</span>
                <span>Payload (JSON)</span>
                <span>Priority</span>
                <span />
              </div>

              <div className="divide-y divide-slate-800/60 max-h-64 overflow-y-auto">
                {rows.map((row, idx) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1fr_1fr_80px_40px] gap-2 px-3 py-2 items-center"
                  >
                    <input
                      value={row.name}
                      onChange={(e) => updateRow(row.id, 'name', e.target.value)}
                      className="input py-1.5 text-xs"
                      placeholder={`job-${idx + 1}`}
                      required
                    />
                    <input
                      value={row.payload}
                      onChange={(e) => updateRow(row.id, 'payload', e.target.value)}
                      className="input py-1.5 text-xs font-mono"
                      placeholder='{}'
                      spellCheck={false}
                    />
                    <input
                      type="number"
                      value={row.priority}
                      onChange={(e) => updateRow(row.id, 'priority', +e.target.value)}
                      className="input py-1.5 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}
                      className="btn-ghost btn-icon text-slate-600 hover:text-red-400 disabled:opacity-30"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Payload validation error */}
            {payloadError && (
              <p className="text-xs text-red-400 mt-2 flex items-center gap-1.5">
                <XCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {payloadError}
              </p>
            )}
          </div>

          {/* Summary */}
          <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-800/40
                          border border-slate-700/40 rounded-lg px-3 py-2">
            <Package className="w-3.5 h-3.5 text-violet-400 flex-shrink-0" />
            <span>
              This will enqueue <strong className="text-slate-200">{rows.length} jobs</strong> atomically
              — all or none will be created.
            </span>
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={() => { setShowCreate(false); setPayloadError(''); }}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary">
              {createMut.isPending
                ? `Creating ${rows.length} jobs…`
                : `Create Batch (${rows.length} jobs)`}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
