import { assetsSeed } from "@/data/assets";
import { repoSeed } from "@/data/repos";
import { auditSeed } from "@/data/audit";
import { notificationsSeed } from "@/data/notifications";
import { ruleEngineSeed } from "@/data/ruleEngineSeed";

const USERS = [
  { id: 1, name: "Treasury Manager", email: "treasury@banca-demo.ro", password: "demo1234", role: "Treasury Manager" },
  { id: 2, name: "Collateral Manager", email: "collateral@banca-demo.ro", password: "demo1234", role: "Collateral Manager" },
  { id: 3, name: "Operations Analyst", email: "operations@banca-demo.ro", password: "demo1234", role: "Operations Analyst" },
  { id: 4, name: "Risk Reviewer", email: "risk@banca-demo.ro", password: "demo1234", role: "Risk Reviewer" },
];

const STORAGE_KEY = "collateral_demo_store_v2";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildSeedStore() {
  return {
    assets: clone(assetsSeed),
    repos: clone(repoSeed),
    audit: clone(auditSeed),
    notifications: clone(notificationsSeed),
    ruleEngine: clone(ruleEngineSeed),
  };
}

function readStore() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    const seed = buildSeedStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }

  try {
    const parsed = JSON.parse(raw);
    return {
      assets: parsed.assets ?? clone(assetsSeed),
      repos: parsed.repos ?? clone(repoSeed),
      audit: parsed.audit ?? clone(auditSeed),
      notifications: parsed.notifications ?? clone(notificationsSeed),
      ruleEngine: parsed.ruleEngine ?? clone(ruleEngineSeed),
    };
  } catch {
    const seed = buildSeedStore();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
    return seed;
  }
}

function writeStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

function getStoredUser() {
  const raw = localStorage.getItem("co_user");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function requireAuth() {
  const user = getStoredUser();
  if (!user) throw new Error("Unauthorized");
  return user;
}

function parseCsv(text) {
  return text
    .trim()
    .split("\n")
    .map((line) => line.split(",").map((value) => value.trim()));
}

function csvTemplate() {
  return [
    "Asset ID,ISIN,Name,Issuer,Type,Currency,Quantity,Market Value,Haircut %,Eligibility,Custody,Status",
    "AST-900,ROEXAMPLE0001,Imported Bond,Imported Issuer,Government Bond,RON,1000000,1015000,3,Eligible for overnight repo,SaFIR / BNR,Available",
  ].join("\n");
}

export const mockApi = {
  async login(email, password) {
    const user = USERS.find((candidate) => candidate.email === email);
    if (!user || user.password !== password) {
      throw new Error("Invalid credentials");
    }

    return {
      token: `demo-token-${user.id}`,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    };
  },

  async logout() {
    localStorage.removeItem("co_user");
  },

  async me() {
    return { user: requireAuth() };
  },

  async changePassword(_currentPassword, _newPassword) {
    requireAuth();
    return { ok: true };
  },

  async getAssets() {
    requireAuth();
    return clone(readStore().assets);
  },

  async updateAsset(id, data) {
    requireAuth();
    const store = readStore();
    const index = store.assets.findIndex((asset) => asset.id === id);
    if (index < 0) throw new Error("Asset not found");
    store.assets[index] = { ...store.assets[index], ...data };
    writeStore(store);
    return clone(store.assets[index]);
  },

  async importAssets(file) {
    requireAuth();
    const store = readStore();
    const text = await file.text();
    const rows = parseCsv(text);
    const [headers = [], ...body] = rows;
    const normalizedHeaders = headers.map((header) =>
      header.toLowerCase().replace(/\s+/g, "_").replace(/%/g, ""),
    );

    let imported = 0;
    const errors = [];

    body.forEach((values, rowIndex) => {
      if (values.every((value) => !value)) return;
      const row = Object.fromEntries(normalizedHeaders.map((header, index) => [header, values[index] ?? ""]));
      const id = row.asset_id || `IMP-${Date.now()}-${rowIndex + 1}`;
      const asset = {
        id,
        isin: row.isin || "",
        name: row.name || row.asset_name || "",
        issuer: row.issuer || "Imported",
        type: row.type || "Government Bond",
        currency: row.currency || "RON",
        quantity: Number.parseInt(row.quantity || "0", 10) || 0,
        marketValue: Number.parseFloat(row.market_value || "0") || 0,
        haircut: Number.parseFloat(row.haircut || "0") || 0,
        eligibility: row.eligibility || "Eligible for overnight repo",
        custody: row.custody || "SaFIR / BNR",
        status: row.status || "Available",
        integration: null,
      };

      if (!asset.id && !asset.isin) {
        errors.push({ line: rowIndex + 2, error: "Asset ID or ISIN is required" });
        return;
      }

      const existingIndex = store.assets.findIndex((existing) => existing.id === id);
      if (existingIndex >= 0) {
        store.assets[existingIndex] = { ...store.assets[existingIndex], ...asset };
      } else {
        store.assets.push(asset);
      }
      imported += 1;
    });

    writeStore(store);
    return { imported, errors };
  },

  async getRepos() {
    requireAuth();
    return clone(readStore().repos);
  },

  async createRepo(data) {
    requireAuth();
    const store = readStore();
    store.repos.unshift(clone(data));
    writeStore(store);
    return clone(data);
  },

  async updateRepo(id, data) {
    requireAuth();
    const store = readStore();
    const index = store.repos.findIndex((repo) => repo.id === id);
    if (index < 0) throw new Error("Repo not found");
    store.repos[index] = { ...store.repos[index], ...data };
    writeStore(store);
    return clone(store.repos[index]);
  },

  async getAudit() {
    requireAuth();
    return clone(readStore().audit);
  },

  async addAudit(entry) {
    requireAuth();
    const store = readStore();
    store.audit.unshift(clone(entry));
    writeStore(store);
    return clone(entry);
  },

  async getNotifications() {
    requireAuth();
    return clone(readStore().notifications);
  },

  async addNotification(notification) {
    requireAuth();
    const store = readStore();
    const nextId = store.notifications.reduce((max, item) => Math.max(max, Number(item.id) || 0), 0) + 1;
    const saved = { id: nextId, ...clone(notification) };
    store.notifications.unshift(saved);
    writeStore(store);
    return saved;
  },

  async deleteNotification(id) {
    requireAuth();
    const store = readStore();
    store.notifications = store.notifications.filter((notification) => String(notification.id) !== String(id));
    writeStore(store);
    return { ok: true };
  },

  async resetDemo() {
    requireAuth();
    const seed = buildSeedStore();
    writeStore(seed);
    return { ok: true };
  },

  async aiStatus()           { return { enabled: false }; },
  async aiExplainDeficit()   { throw new Error('AI disabled in mock mode'); },
  async aiAnalysePortfolio() { throw new Error('AI disabled in mock mode'); },
  async aiCorrelate()        { throw new Error('AI disabled in mock mode'); },
  async aiChat()             { throw new Error('AI disabled in mock mode'); },

  async getRuleEngine() {
    requireAuth();
    return clone(readStore().ruleEngine);
  },

  async updateRuleEngine(partial) {
    requireAuth();
    const store = readStore();
    store.ruleEngine = { ...store.ruleEngine, ...partial };
    writeStore(store);
    return clone(store.ruleEngine);
  },

  downloadCsvTemplate() {
    const blob = new Blob([csvTemplate()], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "collateral_import_template.csv";
    link.click();
    URL.revokeObjectURL(url);
  },
};
