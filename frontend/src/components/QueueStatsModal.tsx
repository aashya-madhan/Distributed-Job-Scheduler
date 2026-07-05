import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { queuesApi } from '../services/api';
import Modal from './Modal';
import LoadingSpinner from './LoadingSpinner';
import {
  BarChart, Bar, Cell, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import type { Queue } from '../types';

interface Props {
  queue: Queue & { projectName?: string };
  isOpen: boolean;
  onClose: () => void;
}

const STATUS_COLORS: Record<string, string> = {
  QUEUED: '#f59e0b', SCHEDULED: '#3b82f6', CLAIMED: '#8b5cf6',
  RUNNING: '#22c55e', COMPLETED: '#10b981', FAILED: '#ef4444',
  DEAD: '#6b7280', CANCELLED: '#475569',
};

const TOOLTIP_STYLE = {
  contentStyle: { background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 },
  labelStyle: { color: '#94a3b8' },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
};

export default function QueueStatsModal({ queue, isOpen, onClose }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ['queue-stats', queue.projectId, queue.id],
    queryFn: () => queuesApi.stats(queue.projectId, queue.id).then((r) => r.data.data),
    enabled: isOpen,
    refetchInterval: isOpen ? 10_000 : false,
  });

  const chartData = data
    ? Object.entries(data.jobsByStatus as Record<string, number>)
        .filter(([, v]) => v > 0)
        .map(([status, count]) => ({ status, count, fill: STATUS_COLORS[status] ?? '#6b7280' }))
    : [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${queue.name} — Stats`} size="lg">
      {isLoading ? (
        <LoadingSpinner />
      ) : !data ? (
        <p className="text-sm text-slate-400 text-center py-8">No stats available</p>
      ) : (
        <div className="space-y-5">
          {/* KPI row */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Active Workers', value: data.activeWorkers, color: 'text-emerald-400' },
              { label: 'Throughput / hr', value: data.throughputLastHour, color: 'text-blue-400' },
              { label: 'Avg Duration', value: `${Math.round(data.avgDurationMs)}ms`, color: 'text-violet-400' },
            ].map((k) => (
              <div key={k.label} className="bg-slate-800/60 border border-slate-700/40 rounded-xl p-4 text-center">
                <p className={`text-2xl font-bold tabular-nums ${k.color}`}>{k.value}</p>
                <p className="text-xs text-slate-500 mt-1">{k.label}</p>
              </div>
            ))}
          </div>

          {/* Queue config */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            {[
              { label: 'Concurrency limit', value: queue.concurrencyLimit },
              { label: 'Max retries', value: queue.maxRetries },
              { label: 'Retry strategy', value: queue.retryStrategy },
              { label: 'Retry delay', value: `${queue.retryDelay}ms` },
              { label: 'Priority', value: queue.priority },
              { label: 'Status', value: queue.isPaused ? 'Paused' : 'Active' },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center
                                               bg-slate-800/40 rounded-lg px-3 py-2 border border-slate-700/30">
                <span className="text-slate-500">{item.label}</span>
                <span className="font-medium text-slate-200">{item.value}</span>
              </div>
            ))}
          </div>

          {/* Jobs by status chart */}
          {chartData.length > 0 && (
            <div>
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">Jobs by Status</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="status" stroke="#334155" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                  <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                    {chartData.map((entry) => (
                      <Cell key={entry.status} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
