import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '../services/api';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import {
  Activity, Zap, Layers, Users, AlertTriangle,
  CheckCircle2, Clock, TrendingUp, Radio,
} from 'lucide-react';
import StatCard from '../components/StatCard';
import LoadingSpinner from '../components/LoadingSpinner';
import type { DashboardMetrics } from '../types';
import { format } from 'date-fns';
import { Link } from 'react-router-dom';

const STATUS_COLORS: Record<string, string> = {
  QUEUED: '#f59e0b', SCHEDULED: '#3b82f6', CLAIMED: '#8b5cf6',
  RUNNING: '#22c55e', COMPLETED: '#10b981', FAILED: '#ef4444',
  DEAD: '#6b7280', CANCELLED: '#475569',
};

export default function DashboardPage() {
  const { data, isLoading, dataUpdatedAt } = useQuery<{ data: DashboardMetrics }>({
    queryKey: ['dashboard'],
    queryFn: () => metricsApi.dashboard().then((r) => r.data),
    refetchInterval: 15_000,
  });

  const m = data?.data;
  if (isLoading) return <LoadingSpinner label="Loading dashboard…" />;

  const totalJobs = m ? Object.values(m.jobs).reduce((a, b) => a + b, 0) : 0;
  const activeWorkers = (m?.workers?.IDLE || 0) + (m?.workers?.BUSY || 0);

  const throughputData = m?.throughput?.map((t) => ({
    hour: format(new Date(t.hour), 'HH:mm'),
    count: t.count,
  })) ?? [];

  const lastUpdated = dataUpdatedAt
    ? format(new Date(dataUpdatedAt), 'HH:mm:ss')
    : null;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">System overview and real-time metrics</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
          <span>Live{lastUpdated && ` · ${lastUpdated}`}</span>
        </div>
      </div>

      {/* Primary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Jobs"
          value={totalJobs.toLocaleString()}
          icon={Zap}
          iconColor="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          label="Active Queues"
          value={m?.queues.active ?? 0}
          icon={Layers}
          iconColor="text-violet-400"
          bgColor="bg-violet-500/10"
          sublabel={`${m?.queues.paused ?? 0} paused`}
        />
        <StatCard
          label="Active Workers"
          value={activeWorkers}
          icon={Users}
          iconColor="text-emerald-400"
          bgColor="bg-emerald-500/10"
          sublabel={`${m?.workers?.BUSY ?? 0} busy`}
        />
        <Link to="/queues" className="block">
          <StatCard
            label="Dead Letter Queue"
            value={m?.dlqCount ?? 0}
            icon={AlertTriangle}
            iconColor={m?.dlqCount ? 'text-red-400' : 'text-slate-500'}
            bgColor={m?.dlqCount ? 'bg-red-500/10' : 'bg-slate-800'}
            sublabel={m?.dlqCount ? 'Needs attention' : 'All clear'}
          />
        </Link>
      </div>

      {/* Job status row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Completed"
          value={(m?.jobs?.COMPLETED ?? 0).toLocaleString()}
          icon={CheckCircle2}
          iconColor="text-emerald-400"
          bgColor="bg-emerald-500/10"
        />
        <StatCard
          label="Running"
          value={m?.jobs?.RUNNING ?? 0}
          icon={Activity}
          iconColor="text-green-400"
          bgColor="bg-green-500/10"
        />
        <StatCard
          label="Queued"
          value={m?.jobs?.QUEUED ?? 0}
          icon={Clock}
          iconColor="text-amber-400"
          bgColor="bg-amber-500/10"
        />
        <StatCard
          label="Failed"
          value={m?.jobs?.FAILED ?? 0}
          icon={AlertTriangle}
          iconColor="text-red-400"
          bgColor="bg-red-500/10"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Throughput chart */}
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-white text-sm">Throughput</h2>
              <p className="text-xs text-slate-500 mt-0.5">Last 24 hours</p>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-semibold text-white tabular-nums">
                {(m?.executions.last24h ?? 0).toLocaleString()}
              </span>
              <span className="text-xs text-slate-500">executions</span>
            </div>
          </div>

          {throughputData.length > 0 ? (
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={throughputData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="tpGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="hour" stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} />
                <YAxis stroke="#334155" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ background: '#0f172a', border: '1px solid #1e293b', borderRadius: 8, fontSize: 12 }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#3b82f6' }}
                  cursor={{ stroke: '#334155' }}
                />
                <Area
                  type="monotone" dataKey="count" stroke="#3b82f6"
                  fill="url(#tpGrad)" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#3b82f6' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[190px] flex items-center justify-center text-slate-600 text-sm">
              No throughput data yet
            </div>
          )}
        </div>

        {/* Execution health panel */}
        <div className="card flex flex-col gap-5">
          <h2 className="font-semibold text-white text-sm">Execution Health</h2>

          <div className="space-y-4 flex-1">
            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-400">Success Rate</span>
                <span className="text-sm font-semibold text-emerald-400">
                  {(m?.executions.successRate ?? 0).toFixed(1)}%
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill bg-emerald-500"
                  style={{ width: `${m?.executions.successRate ?? 0}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-xs text-slate-400">Failure Rate</span>
                <span className="text-sm font-semibold text-red-400">
                  {(m?.executions.failureRate ?? 0).toFixed(1)}%
                </span>
              </div>
              <div className="progress-bar">
                <div
                  className="progress-fill bg-red-500"
                  style={{ width: `${m?.executions.failureRate ?? 0}%` }}
                />
              </div>
            </div>

            <div className="divider" />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-slate-500 mb-1">Avg Duration</p>
                <p className="text-lg font-bold text-white tabular-nums">
                  {m?.executions.avgDurationMs ?? 0}
                  <span className="text-xs font-normal text-slate-500 ml-1">ms</span>
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500 mb-1">Projects</p>
                <p className="text-lg font-bold text-white tabular-nums">
                  {m?.projects ?? 0}
                </p>
              </div>
            </div>

            {Object.keys(m?.workers ?? {}).length > 0 && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Workers by Status</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(m?.workers ?? {}).map(([status, count]) => (
                    <span key={status} className="text-[10px] px-2 py-0.5 bg-slate-800
                                                   border border-slate-700/50 rounded-full text-slate-300 tabular-nums">
                      {status}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Job status distribution */}
      <div className="card">
        <h2 className="font-semibold text-white text-sm mb-4">Job Status Distribution</h2>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-4">
          {Object.entries(m?.jobs ?? {}).map(([status, count]) => (
            <div key={status} className="text-center group">
              <div
                className="w-2 h-2 rounded-full mx-auto mb-2"
                style={{ backgroundColor: STATUS_COLORS[status] ?? '#6b7280' }}
              />
              <p className="text-xl font-bold text-white tabular-nums">{count.toLocaleString()}</p>
              <p className="text-[10px] text-slate-500 mt-0.5 uppercase tracking-wide">{status}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
