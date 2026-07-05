import React from 'react';
import type { JobStatus, WorkerStatus } from '../types';

const JOB_STATUS_STYLES: Record<JobStatus, string> = {
  QUEUED:    'bg-amber-500/15    text-amber-400    border border-amber-500/30',
  SCHEDULED: 'bg-blue-500/15    text-blue-400     border border-blue-500/30',
  CLAIMED:   'bg-purple-500/15  text-purple-400   border border-purple-500/30',
  RUNNING:   'bg-emerald-500/15 text-emerald-400  border border-emerald-500/30',
  COMPLETED: 'bg-emerald-500/10 text-emerald-500  border border-emerald-500/20',
  FAILED:    'bg-red-500/15     text-red-400      border border-red-500/30',
  DEAD:      'bg-slate-500/15   text-slate-400    border border-slate-500/30',
  CANCELLED: 'bg-slate-600/15   text-slate-500    border border-slate-600/30',
};

const JOB_STATUS_DOT: Record<JobStatus, string> = {
  QUEUED:    'bg-amber-400',
  SCHEDULED: 'bg-blue-400',
  CLAIMED:   'bg-purple-400',
  RUNNING:   'bg-emerald-400 animate-pulse',
  COMPLETED: 'bg-emerald-500',
  FAILED:    'bg-red-400',
  DEAD:      'bg-slate-400',
  CANCELLED: 'bg-slate-500',
};

const WORKER_STATUS_STYLES: Record<WorkerStatus, string> = {
  IDLE:     'bg-blue-500/15     text-blue-400     border border-blue-500/30',
  BUSY:     'bg-emerald-500/15  text-emerald-400  border border-emerald-500/30',
  DRAINING: 'bg-amber-500/15    text-amber-400    border border-amber-500/30',
  OFFLINE:  'bg-red-500/15      text-red-400      border border-red-500/30',
};

const WORKER_STATUS_DOT: Record<WorkerStatus, string> = {
  IDLE:     'bg-blue-400',
  BUSY:     'bg-emerald-400 animate-pulse',
  DRAINING: 'bg-amber-400',
  OFFLINE:  'bg-red-400',
};

interface Props {
  status: JobStatus | WorkerStatus;
  type?: 'job' | 'worker';
  showDot?: boolean;
}

export default function StatusBadge({ status, type = 'job', showDot = true }: Props) {
  const styles = type === 'job'
    ? JOB_STATUS_STYLES[status as JobStatus]
    : WORKER_STATUS_STYLES[status as WorkerStatus];

  const dot = type === 'job'
    ? JOB_STATUS_DOT[status as JobStatus]
    : WORKER_STATUS_DOT[status as WorkerStatus];

  return (
    <span className={`badge ${styles}`}>
      {showDot && <span className={`badge-dot ${dot}`} />}
      {status}
    </span>
  );
}
