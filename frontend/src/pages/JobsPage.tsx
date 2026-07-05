import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Plus, Zap, RefreshCw, XCircle, ChevronLeft,
  AlertTriangle, Filter, Search, ChevronDown, ChevronUp,
  Radio,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { jobsApi, queuesApi, projectsApi } from '../services/api';
import type { Job, Queue, JobStatus, JobType, Project } from '../types';
import Modal from '../components/Modal';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import { format } from 'date-fns';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';

const JOB_TYPES: JobType[] = ['IMMEDIATE', 'DELAYED', 'SCHEDULED', 'RECURRING', 'BATCH'];
const JOB_STATUSES: JobStatus[] = ['QUEUED', 'SCHEDULED', 'CLAIMED', 'RUNNING', 'COMPLETED', 'FAILED', 'DEAD', 'CANCELLED'];

export default function JobsPage() {
  const { queueId } = useParams<{ queueId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { token } = useAuth();
  const [wsConnected, setWsConnected] = useState(false);

  // Real-time WS updates for this queue
  const onWsMessage = useCallback((msg: any) => {
    if (msg.type === 'connected') { setWsConnected(true); return; }
    if (msg.channel === `queue:${queueId}`) {
      // Invalidate jobs query so the table refreshes immediately
      qc.invalidateQueries({ queryKey: ['jobs', queueId] });
      qc.invalidateQueries({ queryKey: ['dlq', queueId] });
    }
  }, [queueId, qc]);

  const { subscribe, unsubscribe } = useWebSocket(token, onWsMessage);

  // Subscribe once we have a queueId
  React.useEffect(() => {
    if (!queueId) return;
    subscribe(`queue:${queueId}`);
    return () => unsubscribe(`queue:${queueId}`);
  }, [queueId, subscribe, unsubscribe]);

  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [form, setForm] = useState({
    name: '', type: 'IMMEDIATE' as JobType,
    payload: '{}', priority: 0,
    cronExpression: '', runAt: '', scheduledAt: '',
    maxRetries: 3, timeout: 30_000,
  });

  const params: Record<string, string> = { page: String(page), limit: '20' };
  if (statusFilter) params.status = statusFilter;
  if (typeFilter)   params.type   = typeFilter;

  const { data: queue } = useQuery({
    queryKey: ['queue-detail', queueId],
    queryFn: async () => {
      const projects = await projectsApi.list().then((r) => r.data.data as Project[]);
      for (const p of projects) {
        try {
          return await queuesApi.get(p.id, queueId!).then((r) => r.data.data as Queue);
        } catch {}
      }
      return null;
    },
    enabled: !!queueId,
  });

  const { data: jobsData, isLoading } = useQuery({
    queryKey: ['jobs', queueId, statusFilter, typeFilter, page],
    queryFn: () => jobsApi.list(queueId!, params).then((r) => r.data),
    enabled: !!queueId,
    refetchInterval: 5_000,
  });

  const { data: dlqData } = useQuery({
    queryKey: ['dlq', queueId],
    queryFn: () => jobsApi.dlq(queueId!).then((r) => r.data.data),
    enabled: !!queueId,
  });

  const createMut = useMutation({
    mutationFn: () => {
      let payload: Record<string, unknown>;
      try { payload = JSON.parse(form.payload || '{}'); }
      catch { throw new Error('Invalid JSON payload'); }

      const data: any = {
        name: form.name, type: form.type,
        priority: form.priority, payload,
        maxRetries: form.maxRetries, timeout: form.timeout,
      };
      if (form.type === 'RECURRING') data.cronExpression = form.cronExpression;
      if (form.type === 'DELAYED')   data.runAt          = form.runAt;
      if (form.type === 'SCHEDULED') data.scheduledAt    = form.scheduledAt;
      return jobsApi.create(queueId!, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs', queueId] });
      toast.success('Job created');
      setShowCreate(false);
      setForm({ name: '', type: 'IMMEDIATE', payload: '{}', priority: 0, cronExpression: '', runAt: '', scheduledAt: '', maxRetries: 3, timeout: 30_000 });
    },
    onError: (e: any) => toast.error(e.message || e.response?.data?.error || 'Failed'),
  });

  const cancelMut = useMutation({
    mutationFn: (jobId: string) => jobsApi.cancel(queueId!, jobId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs', queueId] }); toast.success('Job cancelled'); },
  });

  const retryMut = useMutation({
    mutationFn: (jobId: string) => jobsApi.retry(queueId!, jobId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['jobs', queueId] }); toast.success('Job requeued'); },
  });

  const retryDlqMut = useMutation({
    mutationFn: (dlqId: string) => jobsApi.retryDlq(queueId!, dlqId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['jobs', queueId] });
      qc.invalidateQueries({ queryKey: ['dlq', queueId] });
      toast.success('Requeued from DLQ');
    },
  });

  const jobs = jobsData?.data as Job[] ?? [];
  const pagination = jobsData?.pagination;

  const filteredJobs = search
    ? jobs.filter((j) => j.name.toLowerCase().includes(search.toLowerCase()))
    : jobs;

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const resetFilters = () => {
    setStatusFilter(''); setTypeFilter(''); setSearch(''); setPage(1);
  };

  const hasFilters = statusFilter || typeFilter || search;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate('/queues')} className="btn-ghost btn-icon" title="Back to queues">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="page-title">{queue?.name ?? 'Jobs'}</h1>
            {queue?.isPaused && (
              <span className="badge bg-amber-500/15 text-amber-400 border border-amber-500/30">PAUSED</span>
            )}
            <span className={`flex items-center gap-1 text-xs ${wsConnected ? 'text-emerald-400' : 'text-slate-600'}`}>
              <Radio className="w-3 h-3" />
              {wsConnected ? 'Live' : 'Connecting…'}
            </span>
          </div>
          <p className="page-subtitle">
            {queue?.description || 'Job queue management'}
          </p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary">
          <Plus className="w-4 h-4" /> New Job
        </button>
      </div>

      {/* DLQ Alert */}
      {(dlqData as any[])?.length > 0 && (
        <div className="card border-red-500/30 bg-red-500/5 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span className="text-sm text-red-400 font-medium">
                {(dlqData as any[]).length} job{(dlqData as any[]).length !== 1 ? 's' : ''} in Dead Letter Queue
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {(dlqData as any[]).map((e: any) => (
                <button
                  key={e.id}
                  onClick={() => retryDlqMut.mutate(e.id)}
                  disabled={retryDlqMut.isPending}
                  className="btn-secondary btn-sm text-red-400 border-red-500/30"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry: {e.job?.name ?? e.id.slice(0, 8)}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-sm pl-8 w-44"
            placeholder="Search jobs…"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="input-sm w-36"
        >
          <option value="">All Statuses</option>
          {JOB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="input-sm w-36"
        >
          <option value="">All Types</option>
          {JOB_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {hasFilters && (
          <button onClick={resetFilters} className="btn-ghost btn-sm text-slate-500 text-xs">
            Clear filters
          </button>
        )}

        <span className="ml-auto text-xs text-slate-500 tabular-nums">
          {pagination?.total ?? filteredJobs.length} jobs
        </span>
      </div>

      {/* Content */}
      {isLoading ? (
        <LoadingSpinner label="Loading jobs…" />
      ) : !filteredJobs.length ? (
        <EmptyState
          icon={Zap}
          title={hasFilters ? 'No jobs match filters' : 'No jobs yet'}
          description={hasFilters ? 'Try adjusting your filters' : 'Create a job to get started'}
          action={
            hasFilters
              ? <button onClick={resetFilters} className="btn-secondary btn-sm">Clear filters</button>
              : <button onClick={() => setShowCreate(true)} className="btn-primary">Create Job</button>
          }
        />
      ) : (
        <>
          <div className="card p-0 overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-900/50">
                  <th className="table-header w-8" />
                  <th className="table-header">Name</th>
                  <th className="table-header">Type</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Priority</th>
                  <th className="table-header">Retries</th>
                  <th className="table-header">Created</th>
                  <th className="table-header text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredJobs.map((job) => {
                  const expanded = expandedRows.has(job.id);
                  return (
                    <React.Fragment key={job.id}>
                      <tr className="table-row">
                        <td className="table-cell w-8">
                          <button
                            onClick={() => toggleRow(job.id)}
                            className="text-slate-600 hover:text-slate-300 transition-colors"
                            aria-label={expanded ? 'Collapse row' : 'Expand row'}
                          >
                            {expanded
                              ? <ChevronUp className="w-3.5 h-3.5" />
                              : <ChevronDown className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                        <td className="table-cell">
                          <button
                            onClick={() => setSelectedJob(job)}
                            className="text-sm font-medium text-slate-100 hover:text-blue-400 transition-colors text-left"
                          >
                            {job.name}
                          </button>
                          {job.cronExpression && (
                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">{job.cronExpression}</p>
                          )}
                        </td>
                        <td className="table-cell">
                          <span className="badge bg-slate-800 text-slate-400 border border-slate-700/50 text-[10px]">
                            {job.type}
                          </span>
                        </td>
                        <td className="table-cell">
                          <StatusBadge status={job.status} />
                        </td>
                        <td className="table-cell text-sm text-slate-400 tabular-nums">{job.priority}</td>
                        <td className="table-cell">
                          <span className={`text-sm tabular-nums font-medium ${
                            job.retryCount > 0 ? 'text-amber-400' : 'text-slate-400'
                          }`}>
                            {job.retryCount}
                          </span>
                          <span className="text-slate-600 text-xs">/{job.maxRetries}</span>
                        </td>
                        <td className="table-cell text-xs text-slate-500 tabular-nums">
                          {format(new Date(job.createdAt), 'MMM d, HH:mm')}
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center justify-end gap-0.5">
                            {['FAILED', 'DEAD', 'CANCELLED'].includes(job.status) && (
                              <button
                                onClick={() => retryMut.mutate(job.id)}
                                disabled={retryMut.isPending}
                                className="btn-ghost btn-icon text-emerald-400 hover:text-emerald-300"
                                title="Retry job"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {['QUEUED', 'SCHEDULED', 'RUNNING'].includes(job.status) && (
                              <button
                                onClick={() => cancelMut.mutate(job.id)}
                                disabled={cancelMut.isPending}
                                className="btn-ghost btn-icon text-red-400 hover:text-red-300"
                                title="Cancel job"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {/* Inline expanded payload */}
                      {expanded && (
                        <tr className="bg-slate-950/50">
                          <td colSpan={8} className="px-4 py-3">
                            <div className="flex gap-6 text-xs flex-wrap">
                              <div className="flex-1 min-w-[200px]">
                                <p className="text-slate-500 mb-1.5 font-medium">Payload</p>
                                <pre className="code-block text-slate-300 max-h-24 overflow-auto">
                                  {JSON.stringify(job.payload, null, 2)}
                                </pre>
                              </div>
                              <div className="space-y-1 text-slate-400">
                                <p className="text-slate-500 font-medium mb-1.5">Details</p>
                                <p>ID: <span className="font-mono text-slate-500 text-[10px]">{job.id}</span></p>
                                <p>Timeout: {job.timeout}ms</p>
                                {job.idempotencyKey && <p>Idempotency key: {job.idempotencyKey}</p>}
                                {job.nextRunAt && <p>Next run: {format(new Date(job.nextRunAt), 'MMM d, HH:mm')}</p>}
                                {job.completedAt && <p>Completed: {format(new Date(job.completedAt), 'MMM d, HH:mm')}</p>}
                                {job.failedAt && <p>Failed: {format(new Date(job.failedAt), 'MMM d, HH:mm')}</p>}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary btn-sm"
              >
                Previous
              </button>
              <span className="text-sm text-slate-400 tabular-nums">
                Page {page} of {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Create Job Modal */}
      <Modal isOpen={showCreate} onClose={() => setShowCreate(false)} title="New Job" size="lg">
        <form
          onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}
          className="space-y-4"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="job-name">Job name *</label>
              <input
                id="job-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="input" placeholder="process-payment"
                required autoFocus
              />
            </div>
            <div>
              <label className="label" htmlFor="job-type">Type</label>
              <select
                id="job-type"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as JobType })}
                className="input"
              >
                <option value="IMMEDIATE">Immediate</option>
                <option value="DELAYED">Delayed</option>
                <option value="SCHEDULED">Scheduled</option>
                <option value="RECURRING">Recurring (Cron)</option>
              </select>
            </div>
          </div>

          {form.type === 'RECURRING' && (
            <div>
              <label className="label">Cron expression</label>
              <input
                value={form.cronExpression}
                onChange={(e) => setForm({ ...form, cronExpression: e.target.value })}
                className="input font-mono" placeholder="0 * * * * (every hour)"
              />
            </div>
          )}
          {form.type === 'DELAYED' && (
            <div>
              <label className="label">Run at</label>
              <input
                type="datetime-local"
                value={form.runAt}
                onChange={(e) => setForm({ ...form, runAt: e.target.value })}
                className="input"
              />
            </div>
          )}
          {form.type === 'SCHEDULED' && (
            <div>
              <label className="label">Scheduled at</label>
              <input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                className="input"
              />
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Priority</label>
              <input
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: +e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Max retries</label>
              <input
                type="number" min={0}
                value={form.maxRetries}
                onChange={(e) => setForm({ ...form, maxRetries: +e.target.value })}
                className="input"
              />
            </div>
            <div>
              <label className="label">Timeout (ms)</label>
              <input
                type="number" min={1_000}
                value={form.timeout}
                onChange={(e) => setForm({ ...form, timeout: +e.target.value })}
                className="input"
              />
            </div>
          </div>

          <div>
            <label className="label">Payload (JSON)</label>
            <textarea
              value={form.payload}
              onChange={(e) => setForm({ ...form, payload: e.target.value })}
              className="input font-mono h-24 resize-none"
              placeholder='{"key": "value"}'
              spellCheck={false}
            />
          </div>

          <div className="flex justify-end gap-3 pt-1">
            <button type="button" onClick={() => setShowCreate(false)} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" disabled={createMut.isPending} className="btn-primary">
              {createMut.isPending ? 'Creating…' : 'Create Job'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Job Detail Modal */}
      {selectedJob && (
        <Modal
          isOpen={!!selectedJob}
          onClose={() => setSelectedJob(null)}
          title={selectedJob.name}
          size="lg"
        >
          <JobDetailView job={selectedJob} queueId={queueId!} />
        </Modal>
      )}
    </div>
  );
}

function JobDetailView({ job, queueId }: { job: Job; queueId: string }) {
  const { data: logs } = useQuery({
    queryKey: ['job-logs', job.id],
    queryFn: () => jobsApi.logs(queueId, job.id).then((r) => r.data.data),
  });

  const { data: detail } = useQuery({
    queryKey: ['job-detail', job.id],
    queryFn: () => jobsApi.get(queueId, job.id).then((r) => r.data.data),
  });

  const infoItems = [
    { label: 'Status', value: <StatusBadge status={job.status} /> },
    { label: 'Type', value: <span className="font-medium text-white">{job.type}</span> },
    { label: 'Priority', value: <span className="font-medium text-white">{job.priority}</span> },
    { label: 'Retries', value: <span className="font-medium text-white">{job.retryCount} / {job.maxRetries}</span> },
    { label: 'Timeout', value: <span className="font-medium text-white">{job.timeout}ms</span> },
    ...(job.cronExpression ? [{ label: 'Cron', value: <code className="font-mono text-slate-300 text-xs">{job.cronExpression}</code> }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Info grid */}
      <div className="grid grid-cols-3 gap-2">
        {infoItems.map(({ label, value }) => (
          <div key={label} className="bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-2.5">
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mb-1">{label}</p>
            <div className="text-sm">{value}</div>
          </div>
        ))}
      </div>

      {/* Payload */}
      <div>
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Payload</p>
        <pre className="code-block max-h-36 overflow-auto">
          {JSON.stringify(job.payload, null, 2)}
        </pre>
      </div>

      {/* Execution history */}
      {(detail?.executions?.length ?? 0) > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            Execution History
          </p>
          <div className="space-y-1.5">
            {detail.executions.slice(0, 5).map((ex: any) => (
              <div
                key={ex.id}
                className="flex items-center justify-between bg-slate-800/60 border border-slate-700/40
                           rounded-lg px-3 py-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span className={`badge-dot ${ex.status === 'SUCCESS' ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span className={ex.status === 'SUCCESS' ? 'text-emerald-400' : 'text-red-400'}>
                    {ex.status}
                  </span>
                  <span className="text-slate-500">attempt #{ex.attempt}</span>
                </div>
                <span className="text-slate-500 tabular-nums">
                  {ex.durationMs ? `${ex.durationMs}ms` : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Logs */}
      {(logs as any[])?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Logs</p>
          <div className="code-block max-h-48 overflow-auto space-y-1">
            {(logs as any[]).map((log: any) => (
              <div key={log.id} className="flex gap-2 text-xs">
                <span className={
                  log.level === 'ERROR' ? 'text-red-400 font-semibold' :
                  log.level === 'WARN'  ? 'text-amber-400 font-semibold' :
                  log.level === 'INFO'  ? 'text-blue-400' : 'text-slate-500'
                }>
                  [{log.level}]
                </span>
                <span className="text-slate-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
