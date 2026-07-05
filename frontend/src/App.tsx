import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthContext, useAuthProvider } from './hooks/useAuth';
import Sidebar from './components/Sidebar';
import LoadingSpinner from './components/LoadingSpinner';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import DashboardPage from './pages/DashboardPage';
import ProjectsPage from './pages/ProjectsPage';
import QueuesPage from './pages/QueuesPage';
import JobsPage from './pages/JobsPage';
import WorkersPage from './pages/WorkersPage';
import MetricsPage from './pages/MetricsPage';
import BatchPage from './pages/BatchPage';

function ProtectedLayout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/queues" element={<QueuesPage />} />
          <Route path="/queues/:queueId" element={<JobsPage />} />
          <Route path="/jobs" element={<QueuesPage />} />
          <Route path="/batch" element={<BatchPage />} />
          <Route path="/workers" element={<WorkersPage />} />
          <Route path="/metrics" element={<MetricsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const auth = useAuthProvider();

  if (auth.loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={auth}>
      <Routes>
        <Route path="/login" element={auth.user ? <Navigate to="/" replace /> : <LoginPage />} />
        <Route path="/register" element={auth.user ? <Navigate to="/" replace /> : <RegisterPage />} />
        <Route
          path="/*"
          element={auth.user ? <ProtectedLayout /> : <Navigate to="/login" replace />}
        />
      </Routes>
    </AuthContext.Provider>
  );
}
