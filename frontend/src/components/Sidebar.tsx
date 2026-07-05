import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Layers, Briefcase, Users,
  LogOut, Zap, Activity, ChevronLeft, ChevronRight, Package,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useQuery } from '@tanstack/react-query';
import { metricsApi } from '../services/api';
import type { DashboardMetrics } from '../types';

const navItems = [
  { to: '/',         icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/projects', icon: Briefcase,        label: 'Projects' },
  { to: '/queues',   icon: Layers,           label: 'Queues' },
  { to: '/batch',    icon: Package,          label: 'Batch Jobs' },
  { to: '/workers',  icon: Users,            label: 'Workers' },
  { to: '/metrics',  icon: Activity,         label: 'Metrics' },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const { data } = useQuery<{ data: DashboardMetrics }>({
    queryKey: ['dashboard'],
    queryFn: () => metricsApi.dashboard().then((r) => r.data),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const dlqCount = data?.data?.dlqCount ?? 0;

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <aside
      className={`flex-shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col
                  transition-all duration-200 ${collapsed ? 'w-[60px]' : 'w-60'}`}
    >
      {/* Logo */}
      <div className={`flex items-center border-b border-slate-800 h-[57px]
                       ${collapsed ? 'justify-center px-0' : 'px-4 gap-3'}`}>
        {!collapsed && (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm shadow-blue-900/50">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-white text-sm leading-tight">JobFlow</p>
              <p className="text-[10px] text-slate-500 leading-tight">Job Scheduler</p>
            </div>
          </div>
        )}
        {collapsed && (
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-sm shadow-blue-900/50">
            <Zap className="w-4 h-4 text-white" />
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {navItems.map(({ to, icon: Icon, label, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              `relative flex items-center gap-3 rounded-lg text-sm font-medium transition-colors
               ${collapsed ? 'px-0 py-2.5 justify-center' : 'px-3 py-2'}
               ${isActive
                 ? 'bg-blue-600/15 text-blue-400'
                 : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
               }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-blue-500 rounded-r-full" />
                )}
                <div className="relative flex-shrink-0">
                  <Icon className="w-4 h-4" />
                  {/* DLQ badge on Dashboard nav item */}
                  {to === '/' && dlqCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-3.5 px-0.5
                                     bg-red-500 rounded-full text-[9px] font-bold text-white
                                     flex items-center justify-center leading-none">
                      {dlqCount > 9 ? '9+' : dlqCount}
                    </span>
                  )}
                </div>
                {!collapsed && <span>{label}</span>}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Bottom section */}
      <div className="border-t border-slate-800">
        {/* Collapse toggle */}
        <div className="px-2 py-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`w-full flex items-center rounded-lg text-slate-500 hover:text-slate-300
                        hover:bg-slate-800 text-xs transition-colors py-2
                        ${collapsed ? 'justify-center px-0' : 'px-3 gap-2'}`}
          >
            {collapsed
              ? <ChevronRight className="w-4 h-4" />
              : <><ChevronLeft className="w-4 h-4" /><span>Collapse</span></>
            }
          </button>
        </div>

        {/* User */}
        <div className={`px-2 pb-3 ${collapsed ? '' : ''}`}>
          <div className={`flex items-center rounded-lg px-2 py-2 gap-3
                           ${collapsed ? 'justify-center px-0' : ''}`}>
            <div className="relative flex-shrink-0">
              <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full
                              flex items-center justify-center text-xs font-bold text-white shadow-sm">
                {user?.name?.[0]?.toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500
                               border-2 border-slate-900 rounded-full" />
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-200 truncate leading-tight">{user?.name}</p>
                <p className="text-[10px] text-slate-500 truncate leading-tight capitalize">
                  {user?.role?.toLowerCase()}
                </p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                title="Sign out"
                className="text-slate-500 hover:text-red-400 transition-colors p-1 rounded"
              >
                <LogOut className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {collapsed && (
            <button
              onClick={handleLogout}
              title="Sign out"
              className="w-full flex justify-center mt-1 text-slate-500 hover:text-red-400
                         transition-colors py-1.5 rounded-lg hover:bg-slate-800"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
