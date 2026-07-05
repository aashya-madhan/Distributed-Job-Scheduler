import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  register: (data: { email: string; password: string; name: string }) =>
    api.post('/auth/register', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// Projects
export const projectsApi = {
  list: () => api.get('/projects'),
  create: (data: { name: string; description?: string }) => api.post('/projects', data),
  get: (id: string) => api.get(`/projects/${id}`),
  update: (id: string, data: { name: string; description?: string }) => api.put(`/projects/${id}`, data),
  delete: (id: string) => api.delete(`/projects/${id}`),
  regenerateKey: (id: string) => api.post(`/projects/${id}/regenerate-key`),
};

// Queues
export const queuesApi = {
  list: (projectId: string) => api.get(`/projects/${projectId}/queues`),
  create: (projectId: string, data: Partial<import('../types').Queue>) =>
    api.post(`/projects/${projectId}/queues`, data),
  get: (projectId: string, queueId: string) => api.get(`/projects/${projectId}/queues/${queueId}`),
  update: (projectId: string, queueId: string, data: Partial<import('../types').Queue>) =>
    api.put(`/projects/${projectId}/queues/${queueId}`, data),
  delete: (projectId: string, queueId: string) =>
    api.delete(`/projects/${projectId}/queues/${queueId}`),
  pause: (projectId: string, queueId: string) =>
    api.post(`/projects/${projectId}/queues/${queueId}/pause`),
  resume: (projectId: string, queueId: string) =>
    api.post(`/projects/${projectId}/queues/${queueId}/resume`),
  stats: (projectId: string, queueId: string) =>
    api.get(`/projects/${projectId}/queues/${queueId}/stats`),
};

// Jobs
export const jobsApi = {
  list: (queueId: string, params?: Record<string, string>) =>
    api.get(`/queues/${queueId}/jobs`, { params }),
  create: (queueId: string, data: Partial<import('../types').Job>) =>
    api.post(`/queues/${queueId}/jobs`, data),
  get: (queueId: string, jobId: string) => api.get(`/queues/${queueId}/jobs/${jobId}`),
  cancel: (queueId: string, jobId: string) =>
    api.post(`/queues/${queueId}/jobs/${jobId}/cancel`),
  retry: (queueId: string, jobId: string) =>
    api.post(`/queues/${queueId}/jobs/${jobId}/retry`),
  logs: (queueId: string, jobId: string) =>
    api.get(`/queues/${queueId}/jobs/${jobId}/logs`),
  batch: (queueId: string, data: { batchName: string; jobs: Partial<import('../types').Job>[] }) =>
    api.post(`/queues/${queueId}/jobs/batch`, data),
  dlq: (queueId: string) => api.get(`/queues/${queueId}/jobs/dlq`),
  retryDlq: (queueId: string, dlqId: string) =>
    api.post(`/queues/${queueId}/jobs/dlq/${dlqId}/retry`),
};

// Workers
export const workersApi = {
  list: () => api.get('/workers'),
};

// Metrics
export const metricsApi = {
  dashboard: () => api.get('/metrics/dashboard'),
};

export default api;
