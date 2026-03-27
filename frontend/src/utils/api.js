import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export const api = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

// ─── Request interceptor: attach JWT ─────────────────────────────────────────
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('midp_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ─── Response interceptor: handle 401 globally ───────────────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('midp_token');
      localStorage.removeItem('midp_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  me: () => api.get('/auth/me'),
  changePassword: (data) => api.post('/auth/change-password', data),
};

// ─── Projects ─────────────────────────────────────────────────────────────────
export const projectsAPI = {
  list: () => api.get('/projects'),
  get: (id) => api.get(`/projects/${id}`),
  create: (data) => api.post('/projects', data),
  update: (id, data) => api.put(`/projects/${id}`, data),
};

// ─── Field Schemas ────────────────────────────────────────────────────────────
export const schemasAPI = {
  list: (projectId) => api.get(`/schemas/${projectId}`),
  create: (projectId, data) => api.post(`/schemas/${projectId}`, data),
  update: (projectId, schemaId, data) => api.put(`/schemas/${projectId}/${schemaId}`, data),
  delete: (projectId, schemaId) => api.delete(`/schemas/${projectId}/${schemaId}`),
  reorder: (projectId, order) => api.post(`/schemas/${projectId}/reorder`, { order }),
};

// ─── Deliverables ─────────────────────────────────────────────────────────────
export const deliverablesAPI = {
  list: (projectId, params) => api.get(`/deliverables/${projectId}`, { params }),
  get: (projectId, id) => api.get(`/deliverables/${projectId}/${id}`),
  create: (projectId, data) => api.post(`/deliverables/${projectId}`, data),
  update: (projectId, id, data) => api.put(`/deliverables/${projectId}/${id}`, data),
  delete: (projectId, id) => api.delete(`/deliverables/${projectId}/${id}`),
  validateCode: (projectId, field_values, exclude_id) =>
    api.post(`/deliverables/${projectId}/validate-code`, { field_values, exclude_id }),
};

// ─── Production Units ─────────────────────────────────────────────────────────
export const productionAPI = {
  list: (deliverableId) => api.get(`/production/${deliverableId}`),
  create: (deliverableId, data) => api.post(`/production/${deliverableId}`, data),
  update: (id, data) => api.put(`/production/${id}`, data),
};

// ─── Import / Export ──────────────────────────────────────────────────────────
export const importAPI = {
  downloadTemplate: (projectId) =>
    api.get(`/import/${projectId}/template`, { responseType: 'blob' }),
  upload: (projectId, file, onProgress) => {
    const form = new FormData();
    form.append('file', file);
    return api.post(`/import/${projectId}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      onUploadProgress: (e) => onProgress?.(Math.round((e.loaded * 100) / e.total)),
    });
  },
};

export const exportAPI = {
  excel: (projectId, params) =>
    api.get(`/export/${projectId}/excel`, { params, responseType: 'blob' }),
  json: (projectId) =>
    api.get(`/export/${projectId}/json`, { responseType: 'blob' }),
  csv: (projectId) =>
    api.get(`/export/${projectId}/csv`, { responseType: 'blob' }),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardAPI = {
  get: (projectId) => api.get(`/dashboard/${projectId}`),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersAPI = {
  list: () => api.get('/users'),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
};

// ─── Audit ────────────────────────────────────────────────────────────────────
export const auditAPI = {
  list: (projectId, params) => api.get(`/audit/${projectId}`, { params }),
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
export const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
