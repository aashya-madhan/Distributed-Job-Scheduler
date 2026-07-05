import React from 'react';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
}

export default function LoadingSpinner({ size = 'md', label }: Props) {
  const sizeClass = { sm: 'w-4 h-4', md: 'w-8 h-8', lg: 'w-12 h-12' }[size];

  return (
    <div className="flex flex-col items-center justify-center gap-3 p-10">
      <div className={`${sizeClass} border-2 border-slate-700 border-t-blue-500 rounded-full animate-spin`} />
      {label && <p className="text-sm text-slate-500">{label}</p>}
    </div>
  );
}
