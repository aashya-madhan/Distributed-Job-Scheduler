import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface Props {
  label: string;
  value: string | number;
  icon: LucideIcon;
  iconColor?: string;
  bgColor?: string;
  trend?: number;        // percentage change, positive = up
  trendLabel?: string;
  sublabel?: string;
}

export default function StatCard({
  label, value, icon: Icon,
  iconColor = 'text-blue-400',
  bgColor = 'bg-slate-800',
  trend,
  trendLabel,
  sublabel,
}: Props) {
  const hasTrend = trend !== undefined;
  const trendUp = hasTrend && trend >= 0;

  return (
    <div className="card flex items-start gap-4 group hover:border-slate-700 transition-colors">
      <div className={`p-2.5 rounded-lg ${bgColor} ${iconColor} flex-shrink-0`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 font-medium uppercase tracking-wide">{label}</p>
        <p className="text-2xl font-bold text-white mt-1 tabular-nums">{value}</p>
        {sublabel && (
          <p className="text-xs text-slate-500 mt-0.5">{sublabel}</p>
        )}
        {hasTrend && (
          <div className={`flex items-center gap-1 mt-1.5 text-xs font-medium ${
            trendUp ? 'text-emerald-400' : 'text-red-400'
          }`}>
            {trendUp
              ? <TrendingUp className="w-3 h-3" />
              : <TrendingDown className="w-3 h-3" />
            }
            <span>{Math.abs(trend).toFixed(1)}%</span>
            {trendLabel && <span className="text-slate-600 font-normal">{trendLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}
