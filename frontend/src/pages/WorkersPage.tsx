import React, { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Users, RefreshCw, Radio } from 'lucide-react';
import { workersApi } from '../services/api';
import type { Worker } from '../types';
import StatusBadge from '../components/StatusBadge';
import EmptyState from '../components/EmptyState';
import LoadingSpinner from '../components/LoadingSpinner';
import StatCard from '../components/StatCard';
import { formatDistanceToNow } from 'date-fns';
import { useAuth } from '../hooks/useAuth';
import { useWebSocket } from '../hooks/useWebSocket';

function SuccessRate({ processed, failed }: { processed: number; failed: number }) {
  const rate = processed === 0 ? 0 : ((processed - failed) / processed) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 progress-bar max-w-[60px]">
        <div
          className={`progress-fill ${rate >= 90 ? 'bg-emerald-500' : rate >= 70 ? 'bg-amber-500' : 'bg-red-500'}`}
          style={{ width: `${rate}%` }}
        />
      </div>
      <span className={`text-xs tabular-nums font-medium ${
        rate >= 90 ? 'text-emerald-400' : rate >= 70 ? 'text-amber-400' : 'text-red-400'
      }`}>
        {rate.toFixed(0)}%
      </span>
    </div>
  );
}

export default function WorkersPage() {
  const { data, isLoading, dataUpdatedAt, refetch, isFetching } = useQuery({
    queryKey: ['workers'],
    queryFn: () => workersApi.list().then((r) => r.data.data as Worker[]),
    refetchInterval: 10_000,
  });

  const qc = useQueryClient();
  const { token } = useAuth();
  const [wsConnected, setWsConnected] = useState(false);

  const onWsMessage = useCallback((msg: any) => {
    if (msg.type === 'connected') { setWsConnected(true); return; }
    if (msg.channel === 'workers') {
      qc.invalidateQueries({ queryKey: ['workers'] });
    }
  }, [qc]);

  const { subscribe, unsubscribe } = useWebSocket(token, onWsMessage);

  React.useEffect(() => {
    subscribe('workers');
    return () => unsubscribe('workers');
  }, [subscribe, unsubscribe]);

  const workers = data ?? [];
  const byStatus = {
    active:  workers.filter((w) => w.status !== 'OFFLINE').length,
    busy:    workers.filter((w) => w.status === 'BUSY').length,
    idle:    workers.filter((w) => w.status === 'IDLE').length,
    offline: workers.filter((w) => w.status === 'OFFLINE').length,
  };

  const totalProcessed = workers.reduce((s, w) => s + w.jobsProcessed, 0);
  const totalFailed    = workers.reduce((s, w) => s + w.jobsFailed, 0);

  if (isLoading) return <LoadingSpinner label="Loading workers…" />;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Workers</h1>
          <p className="page-subtitle">
            {workers.length} worker{workers.length !== 1 ? 's' : ''} registered
            {dataUpdatedAt && (
              <span className="ml-2 text-slate-600 text-xs">
                · updated {formatDistanceToNow(new Date(dataUpdatedAt), { addSuffix: true })}
              </span>
            )}
            <span className={`ml-2 inline-flex items-center gap-1 text-xs ${wsConnected ? 'text-emerald-400' : 'text-slate-600'}`}>
              <Radio className="w-3 h-3" />
              {wsConnected ? 'Live' : 'Connecting…'}
            </span>
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="btn-secondary btn-sm"
          title="Refresh workers"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Active"
          value={byStatus.active}
          icon={Users}
          iconColor="text-emerald-400"
          bgColor="bg-emerald-500/10"
          sublabel={`${byStatus.busy} busy`}
        />
        <StatCard
          label="Idle"
          value={byStatus.idle}
          icon={Users}
          iconColor="text-blue-400"
          bgColor="bg-blue-500/10"
        />
        <StatCard
          label="Offline"
          value={byStatus.offline}
          icon={Users}
          iconColor={byStatus.offline ? 'text-red-400' : 'text-slate-500'}
          bgColor={byStatus.offline ? 'bg-red-500/10' : 'bg-slate-800'}
        />
        <StatCard
          label="Total Processed"
          value={totalProcessed.toLocaleString()}
          icon={Users}
          iconColor="text-purple-400"
          bgColor="bg-purple-500/10"
          sublabel={`${totalFailed} failed`}
        />
      </div>

      {!workers.length ? (
        <EmptyState
          icon={Users}
          title="No workers registered"
          description="Start the worker service to begin processing jobs from your queues"
        />
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-900/50">
                <th className="table-header">Worker</th>
                <th className="table-header">Status</th>
                <th className="table-header">Queue</th>
                <th className="table-header">Concurrency</th>
                <th className="table-header">Processed</th>
                <th className="table-header">Failed</th>
                <th className="table-header">Success Rate</th>
                <th className="table-header">Last Heartbeat</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {workers.map((worker) => {
                const isOnline  = worker.status !== 'OFFLINE';
                const isBusy    = worker.status === 'BUSY';

                return (
                  <tr key={worker.id} className="table-row">
                    <td className="table-cell">
                      <div className="flex items-center gap-2.5">
                        <div className="relative flex-shrink-0">
                          <div className={`w-2 h-2 rounded-full ${
                            !isOnline ? 'bg-slate-600'
                            : isBusy   ? 'bg-emerald-400 animate-pulse'
                            : 'bg-blue-400'
                          }`} />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white font-mono leading-tight">
                            {worker.hostname}
                          </p>
                          <p className="text-[10px] text-slate-500">PID {worker.pid}</p>
                        </div>
                      </div>
                    </td>

                    <td className="table-cell">
                      <StatusBadge status={worker.status} type="worker" />
                    </td>

                    <td className="table-cell text-sm text-slate-400">
                      {worker.queue?.name ?? <span className="text-slate-600">—</span>}
                    </td>

                    <td className="table-cell text-sm text-slate-400 tabular-nums">
                      {worker.concurrency}
                    </td>

                    <td className="table-cell text-sm font-semibold text-emerald-400 tabular-nums">
                      {worker.jobsProcessed.toLocaleString()}
                    </td>

                    <td className="table-cell text-sm font-semibold text-red-400 tabular-nums">
                      {worker.jobsFailed}
                    </td>

                    <td className="table-cell">
                      <SuccessRate
                        processed={worker.jobsProcessed}
                        failed={worker.jobsFailed}
                      />
                    </td>

                    <td className="table-cell text-xs text-slate-500">
                      {formatDistanceToNow(new Date(worker.lastHeartbeat), { addSuffix: true })}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
