import React from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, CartesianGrid, AreaChart, Area,
} from 'recharts';
import { metricsApi } from '../services/api';
import type { DashboardMetrics } from '../types';
import LoadingSpinner from '../components/LoadingSpinner';
import StatCard from '../components/StatCard';
import { format, formatDistanceToNow } from 'date-fns';
import {
  CheckCircle2, XCircle, Clock, BarChart2, RefreshCw,
} from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  QUEUED:    '#f59e0b',
  SCHEDULED: '#3b82f6',
  CLAIMED:   '#8b5cf6',
  RUNNING:   '#22c55e',
  COMPLETED: '#10b981',
  FAILED:    '#ef4444',
  DEAD:      '#6b7280',
  CANCELLED: '#475569',
};
const WORKER_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];

const TOOLTIP_STYLE = {
  contentStyle: {
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: 8,
    fontSize: 12,
    color: '#e2e8f0',
  },
  labelStyle: { color: '#94a3b8' },
  cursor: { fill: 'rgba(255,255,255,0.03)' },
};

export default function MetricsPage() {
  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery<{ data: DashboardMetrics }>({
    queryKey: ['dashboard'],
    queryFn: () => metricsApi.dashboard().then((r) => r.data),
    refetchInterval: 30_000,
  });

  const m = data?.data;
  if (isLoading) return <LoadingSpinner label="Loading metrics…" />;

  const jobStatusData = Object.entries(m?.jobs ?? {})
    .filter(([, count]) => count > 0)
    .map(([status, count]) => ({ status, count, fill: STATUS_COLORS[status] ?? '#6b7280' }));

  const workerData = Object.entries(m?.workers ?? {}).map(([status, count]) => ({ status, count }));

  const throughputData = m?.throughput?.map((t) => ({
    hour: format(new Date(t.hour), 'HH:mm'),
    count: t.count,
  })) ?? [];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">Metrics</h1>
          <p className="page-subtitle">
            System performance and analytics
            {dataUpdatedAt && (
              <span className="ml-2 text-slate-600 text-xs">
                · {formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })}
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary btn-sm"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Success Rate"
          value={`${(m?.executions.successRate ?? 0).toFixed(1)}%`}
          icon={CheckCircle2}
          iconColor="text-emerald-400"
          bgColor="bg-emerald-500/10"
        />
        <StatCard
          label="Failure Rate"
          value={`${(m?.executions.failureRate ?? 0).toFixed(1)}%`}
          icon={XCircle}
          iconColor="text-red-400"
          bgColor="bg-red-500/10"
        />
        <StatCard
          label="Avg Duration"
          value={`${(m?.executions.avgDurationMs ?? 0).toLocaleString()}ms`}
          icon={Clock}
          iconColor="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          label="Executions (24h)"
          value={(m?.executions.last24h ?? 0).toLocaleString()}
          icon={BarChart2}
          iconColor="text-violet-400"
          bgColor="bg-violet-500/10"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Throughput */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Hourly Throughput</h2>
              <p className="text-xs text-slate-500 mt-0.5">Job executions per hour</p>
            </div>
          </div>
          {throughputData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={throughputData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="metricGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="hour" stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Area
                  type="monotone" dataKey="count" stroke="#3b82f6"
                  fill="url(#metricGrad)" strokeWidth={2} dot={false}
                  activeDot={{ r: 4, fill: '#3b82f6' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <NoData />
          )}
        </div>

        {/* Job status pie */}
        <div className="card">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Job Status Distribution</h2>
            <p className="text-xs text-slate-500 mt-0.5">Breakdown by current status</p>
          </div>
          {jobStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={jobStatusData}
                  dataKey="count"
                  nameKey="status"
                  cx="50%" cy="50%"
                  outerRadius={80}
                  innerRadius={40}
                  paddingAngle={2}
                >
                  {jobStatusData.map((entry) => (
                    <Cell key={entry.status} fill={entry.fill} stroke="transparent" />
                  ))}
                </Pie>
                <Tooltip {...TOOLTIP_STYLE} formatter={(v: any, name) => [v, name]} />
                <Legend
                  formatter={(v) => <span style={{ fontSize: 11, color: '#94a3b8' }}>{v}</span>}
                  iconType="circle"
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <NoData message="No jobs yet" />
          )}
        </div>

        {/* Jobs by status bar */}
        <div className="card">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Jobs by Status</h2>
            <p className="text-xs text-slate-500 mt-0.5">Count per status category</p>
          </div>
          {jobStatusData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={jobStatusData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="status" stroke="#334155" tick={{ fontSize: 9, fill: '#64748b' }} tickLine={false} />
                <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {jobStatusData.map((entry) => (
                    <Cell key={entry.status} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoData />
          )}
        </div>

        {/* Worker status */}
        <div className="card">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white">Worker Status</h2>
            <p className="text-xs text-slate-500 mt-0.5">Workers by current state</p>
          </div>
          {workerData.length > 0 && workerData.some((d) => d.count > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={workerData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="status" stroke="#334155" tick={{ fontSize: 11, fill: '#64748b' }} tickLine={false} />
                <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip {...TOOLTIP_STYLE} />
                <Bar dataKey="count" radius={[4, 4, 0, 0]} maxBarSize={60}>
                  {workerData.map((entry, i) => (
                    <Cell key={entry.status} fill={WORKER_COLORS[i % WORKER_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <NoData message="No workers" />
          )}
        </div>
      </div>
    </div>
  );
}

function NoData({ message = 'No data available' }: { message?: string }) {
  return (
    <div className="h-[220px] flex items-center justify-center text-slate-600 text-sm">
      {message}
    </div>
  );
}
