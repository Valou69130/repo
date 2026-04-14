import { mockApi } from "@/integrations/mockApi";

const BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : "");
const USE_REMOTE_API = Boolean(BASE);

let _refreshing = null; // in-flight refresh promise — collapses concurrent retries

async function tryRefresh() {
  if (_refreshing) return _refreshing;
  _refreshing = fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(r => r.ok)
    .catch(() => false)
    .finally(() => { _refreshing = null; });
  return _refreshing;
}

async function request(method, path, body, _retry = true) {
  if (!USE_REMOTE_API) {
    throw new Error("Remote API disabled");
  }
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && _retry && path !== '/auth/login') {
    const refreshed = await tryRefresh();
    if (refreshed) return request(method, path, body, false); // retry once
    localStorage.removeItem('co_user');
    window.location.reload();
    return;
  }
  if (res.status === 401) {
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
  login: async (email, password) => {
    const data = await request('POST', '/auth/login', { email, password });
    if (data?.user) localStorage.setItem('co_user', JSON.stringify(data.user));
    return data;
  },
  logout: async () => {
    await request('POST', '/auth/logout');
    localStorage.removeItem('co_user');
  },
  me: () => request('GET', '/auth/me'),
  changePassword: (currentPassword, newPassword) => request('PUT', '/auth/password', { currentPassword, newPassword }),

  getAssets:   () => request('GET', '/assets').then(r => r?.data ?? r),
  updateAsset: (id, data) => request('PUT', `/assets/${id}`, data),
  importAssets: async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(`${BASE}/assets/import`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });
    if (!res.ok) throw new Error('Import failed');
    return res.json();
  },

  getRepos:   () => request('GET', '/repos').then(r => r?.data ?? r),
  createRepo: (data) => request('POST', '/repos', data),
  updateRepo: (id, data) => request('PUT', `/repos/${id}`, data),

  getAudit:         () => request('GET', '/audit'),
  addAudit:         (entry) => request('POST', '/audit', entry),
  verifyAuditChain: () => request('GET', '/audit/verify'),

  getNotifications:      () => request('GET', '/notifications'),
  addNotification:       (n) => request('POST', '/notifications', n),
  acknowledgeNotification: (id) => request('PATCH', `/notifications/${id}`),
  deleteNotification:    (id) => request('DELETE', `/notifications/${id}`),

  confirmSettlement: (repoId, data) => request('POST', `/repos/${repoId}/settle`, data),

  resetDemo: () => request('POST', '/admin/reset'),

  aiStatus:            () => request('GET', '/ai/status'),
  aiExplainDeficit:    (repoId) => request('POST', '/ai/margin/explain', { repoId }),
  aiAnalysePortfolio:  () => request('POST', '/ai/margin/portfolio'),
  aiCorrelate:         () => request('POST', '/ai/exceptions/correlate'),
  aiChat:              (history) => request('POST', '/ai/chat', { history }),

  downloadCsvTemplate: async () => {
    const res = await fetch(`${BASE}/admin/csv-template`, {
      credentials: 'include',
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
