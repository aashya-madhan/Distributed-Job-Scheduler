export interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'MEMBER' | 'VIEWER';
  createdAt: string;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  apiKey: string;
  createdAt: string;
  _count?: { queues: number };
}

export type RetryStrategy = 'FIXED' | 'LINEAR' | 'EXPONENTIAL';

export interface Queue {
  id: string;
  projectId: string;
  name: string;
  description?: string;
  priority: number;
  concurrencyLimit: number;
  isPaused: boolean;
  maxRetries: number;
  retryStrategy: RetryStrategy;
  retryDelay: number;
  createdAt: string;
  _count?: { jobs: number; workers: number };
}

export type JobType = 'IMMEDIATE' | 'DELAYED' | 'SCHEDULED' | 'RECURRING' | 'BATCH';
export type JobStatus = 'QUEUED' | 'SCHEDULED' | 'CLAIMED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'DEAD' | 'CANCELLED';

export interface Job {
  id: string;
  queueId: string;
  name: string;
  type: JobType;
  status: JobStatus;
  priority: number;
  payload: Record<string, unknown>;
  scheduledAt?: string;
  cronExpression?: string;
  nextRunAt?: string;
  runAt?: string;
  batchId?: string;
  maxRetries: number;
  retryCount: number;
  retryStrategy: RetryStrategy;
  retryDelay: number;
  timeout: number;
  idempotencyKey?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  failedAt?: string;
  _count?: { executions: number; logs: number };
  dlqEntry?: DLQEntry;
}

export interface JobExecution {
  id: string;
  jobId: string;
  workerId?: string;
  status: 'STARTED' | 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';
  attempt: number;
  startedAt: string;
  finishedAt?: string;
  durationMs?: number;
  error?: string;
  result?: Record<string, unknown>;
}

export interface JobLog {
  id: string;
  jobId: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  message: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export type WorkerStatus = 'IDLE' | 'BUSY' | 'DRAINING' | 'OFFLINE';

export interface Worker {
  id: string;
  queueId?: string;
  hostname: string;
  pid: number;
  status: WorkerStatus;
  concurrency: number;
  jobsProcessed: number;
  jobsFailed: number;
  lastHeartbeat: string;
  registeredAt: string;
  queue?: { id: string; name: string };
  _count?: { executions: number };
}

export interface DLQEntry {
  id: string;
  jobId: string;
  queueId: string;
  reason: string;
  failedAt: string;
  payload: Record<string, unknown>;
  retryCount: number;
  lastError?: string;
  job?: Job;
}

export interface QueueStats {
  jobsByStatus: Record<string, number>;
  activeWorkers: number;
  throughputLastHour: number;
  avgDurationMs: number;
}

export interface DashboardMetrics {
  projects: number;
  queues: { total: number; active: number; paused: number };
  jobs: Record<string, number>;
  workers: Record<string, number>;
  dlqCount: number;
  executions: {
    last24h: number;
    successRate: number;
    failureRate: number;
    avgDurationMs: number;
  };
  throughput: { hour: string; count: number }[];
}

export interface JobBatch {
  id: string;
  name: string;
  projectId: string;
  totalJobs: number;
  pending: number;
  completed: number;
  failed: number;
  createdAt: string;
  updatedAt: string;
  jobs?: Job[];
}

export interface PaginatedResponse<T> {
  success: boolean;
  data: T[];
  pagination: { total: number; page: number; limit: number; totalPages: number };
}

export interface ApiResponse<T> {
  success: boolean;
  data: T;
}
