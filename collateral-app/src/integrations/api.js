import { mockApi } from "@/integrations/mockApi";

const BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : "");
const USE_REMOTE_API = Boolean(BASE);

function getToken() {
  return localStorage.getItem('co_token');
}

async function request(method, path, body) {
  if (!USE_REMOTE_API) {
    throw new Error("Remote API disabled");
  }
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    localStorage.removeItem('co_token');
    localStorage.removeItem('co_user');
    window.location.reload();
    return;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

const remoteApi = {
  login:  (email, password) => request('POST', '/auth/login', { email, password }),
  me:     () => request('GET', '/auth/me'),

  getAssets:    () => request('GET', '/assets'),
  updateAsset:  (id, data) => request('PUT', `/assets/${id}`, data),
  importAssets: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/assets/import`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${getToken()}` },
      body: formData,
    });
    if (!res.ok) throw new Error('Import failed');
    return res.json();
  },

  getRepos:    () => request('GET', '/repos'),
  createRepo:  (data) => request('POST', '/repos', data),
  updateRepo:  (id, data) => request('PUT', `/repos/${id}`, data),

  getAudit:  () => request('GET', '/audit'),
  addAudit:  (entry) => request('POST', '/audit', entry),

  getNotifications:    () => request('GET', '/notifications'),
  addNotification:     (n) => request('POST', '/notifications', n),
  deleteNotification:  (id) => request('DELETE', `/notifications/${id}`),

  resetDemo: () => request('POST', '/admin/reset'),

  downloadCsvTemplate: async () => {
    const res = await fetch(`${BASE}/admin/csv-template`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error('Download failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'collateral_import_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  },
};

export const api = USE_REMOTE_API ? remoteApi : mockApi;
