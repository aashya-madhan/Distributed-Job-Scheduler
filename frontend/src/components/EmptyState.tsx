import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface Props {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon: Icon, title, description, action }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-fade-in">
      <div className="relative mb-5">
        <div className="w-16 h-16 bg-slate-800/80 border border-slate-700/50 rounded-2xl
                        flex items-center justify-center">
          <Icon className="w-7 h-7 text-slate-500" />
        </div>
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-b from-slate-700/10 to-transparent" />
      </div>
      <h3 className="text-base font-semibold text-slate-200 mb-1">{title}</h3>
      <p className="text-sm text-slate-500 max-w-xs mb-5 leading-relaxed">{description}</p>
      {action}
    </div>
  );
}
