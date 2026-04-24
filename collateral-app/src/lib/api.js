import { mockApi } from "@/integrations/mockApi";
import { ruleEngineSeed } from "@/data/ruleEngineSeed";

const BASE =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? "http://localhost:3001" : "/api");
const USE_REMOTE_API = Boolean(BASE);

let _refreshing = null; // in-flight refresh promise — collapses concurrent retries

async function tryRefresh() {
  if (_refreshing) return _refreshing;
  _refreshing = fetch(`${BASE}/session/refresh`, { method: 'POST', credentials: 'include' })
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
  if (res.status === 401 && _retry && path !== '/session/login') {
    const hadUser = !!localStorage.getItem('co_user');
    const refreshed = await tryRefresh();
    if (refreshed) return request(method, path, body, false); // retry once
    localStorage.removeItem('co_user');
    // Only reload if the user had an active session — prevents infinite loop for
    // unauthenticated visitors where refresh always fails (no cookie to send).
    if (hadUser) window.location.reload();
    return;
  }
  if (res.status === 401) {
    localStorage.removeItem('co_user');
    return; // refresh succeeded but token still rejected — let caller handle gracefully
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || 'API error');
  }
  return res.json();
}

const remoteApi = {
  login: async (email, password) => {
    const data = await request('POST', '/session/login', { email, password });
    if (data?.user) localStorage.setItem('co_user', JSON.stringify(data.user));
    return data;
  },
  logout: async () => {
    await request('POST', '/session/logout');
    localStorage.removeItem('co_user');
  },
  me: () => request('GET', '/session/me'),
  changePassword: (currentPassword, newPassword) => request('PUT', '/session/password', { currentPassword, newPassword }),

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

  getRuleEngine: () =>
    request('GET', '/admin/rule-engine').catch(() => {
      try {
        const s = localStorage.getItem('co_rule_engine');
        return s ? JSON.parse(s) : { ...ruleEngineSeed };
      } catch { return { ...ruleEngineSeed }; }
    }),
  updateRuleEngine: (partial) =>
    request('PUT', '/admin/rule-engine', partial).catch(() => {
      try {
        const current = (() => { try { const s = localStorage.getItem('co_rule_engine'); return s ? JSON.parse(s) : { ...ruleEngineSeed }; } catch { return { ...ruleEngineSeed }; } })();
        const updated = { ...current, ...partial };
        localStorage.setItem('co_rule_engine', JSON.stringify(updated));
        return updated;
      } catch { return partial; }
    }),

  // ── SFTR ─────────────────────────────────────────────────────────────
  listSFTRSubmissions: () => request('GET', '/admin/sftr/submissions').then(r => r?.data ?? r),
  submitSFTRReport: (data) => request('POST', '/admin/sftr/submit', data),

  // ── Collateral agreements ────────────────────────────────────────────
  listAgreements: () => request('GET', '/agreements').then(r => r?.data ?? r),
  getAgreement:   (id) => request('GET', `/agreements/${id}`),
  createAgreement: (data) => request('POST', '/agreements', data),

  // ── Margin calls (event-sourced) ─────────────────────────────────────
  listMarginCalls: (query = {}) => {
    const qs = new URLSearchParams(query).toString();
    return request('GET', `/margin-calls${qs ? `?${qs}` : ''}`).then(r => r?.data ?? r);
  },
  getMarginCall:    (id) => request('GET', `/margin-calls/${id}`),
  createMarginCall: (data) => request('POST', '/margin-calls', data),
  issueMarginCall:  (id, body = {}) => request('POST', `/margin-calls/${id}/issue`, body),
  acceptMarginCall: (id, body = {}) => request('POST', `/margin-calls/${id}/accept`, body),
  markDelivered:    (id, body)      => request('POST', `/margin-calls/${id}/mark-delivered`, body),
  confirmSettlement:(id, body = {}) => request('POST', `/margin-calls/${id}/confirm-settlement`, body),
  cancelMarginCall: (id, body)      => request('POST', `/margin-calls/${id}/cancel`, body),
  suggestedCalls:   () => request('GET', '/margin-calls/suggested').then(r => r?.data ?? r),
  aiAssessCall:     (id) => request('POST', `/margin-calls/${id}/ai-assess`, {}),
  downloadMarginCallPdf: (id) => fetch(`${BASE}/margin-calls/${id}/pdf`, { credentials: 'include' }),

  // ── Disputes ─────────────────────────────────────────────────────────
  openDispute:      (callId, body)    => request('POST', `/margin-calls/${callId}/disputes`, body),
  proposeDispute:   (disputeId, body) => request('POST', `/disputes/${disputeId}/propose`, body),
  agreeDispute:     (disputeId, body) => request('POST', `/disputes/${disputeId}/agree`, body),
  withdrawDispute:  (disputeId, body) => request('POST', `/disputes/${disputeId}/withdraw`, body),
  escalateDispute:  (disputeId, body) => request('POST', `/disputes/${disputeId}/escalate`, body),

  // ── Approvals (four-eyes inbox) ──────────────────────────────────────
  listPendingApprovals: () => request('GET', '/approvals/pending').then(r => r?.data ?? r),
  grantApproval:  (id, body = {})  => request('POST', `/approvals/${id}/grant`, body),
  rejectApproval: (id, body)       => request('POST', `/approvals/${id}/reject`, body),

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
