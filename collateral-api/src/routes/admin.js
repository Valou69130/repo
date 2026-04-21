const crypto = require('crypto');
const router = require('express').Router();
const { getDb } = require('../db/schema');
const { requireAuth, requirePerm, ROLE_PERMS } = require('../middleware/auth');
const { seedDemoData } = require('../db/demoData');

const DEFAULT_RULE_ENGINE = {
  haircuts: {
    'Government Bond': 3, 'T-Bill': 2, 'MMF': 4, 'Corporate Bond': 8, 'Covered Bond': 5,
  },
  eligibility: {
    'Government Bond': ['overnight-repo', 'central-bank'],
    'T-Bill':          ['overnight-repo', 'central-bank'],
    'MMF':             ['overnight-repo'],
    'Corporate Bond':  [],
    'Covered Bond':    ['overnight-repo'],
  },
  counterparties: {
    'UniBank Bucharest':     { minCoverageRatio: 1.02, maxExposure: 25000000, mta: 100000 },
    'Danube Capital':        { minCoverageRatio: 1.03, maxExposure: 15000000, mta: 150000 },
    'Carpathia Bank':        { minCoverageRatio: 1.05, maxExposure: 12000000, mta: 200000 },
    'Balkan Treasury House': { minCoverageRatio: 1.04, maxExposure: 10000000, mta:  50000 },
    'BNR Open Market':       { minCoverageRatio: 1.01, maxExposure: 50000000, mta: 500000 },
  },
  approvalThreshold: 10000000,
  stressPct: 10,
};

// ── Full demo reset ────────────────────────────────────────────────────────────
router.post('/reset', requireAuth, requirePerm('canReset'), (req, res) => {
  const db = getDb();
  try {
    seedDemoData(db, { includeUsers: true });
    // Reset rule engine to defaults on demo reset
    db.prepare(`INSERT OR REPLACE INTO rule_engine (key, value_json, updated_by_user_id, updated_at)
      VALUES ('config', ?, ?, datetime('now'))`).run(JSON.stringify(DEFAULT_RULE_ENGINE), req.user.id);
    res.json({ ok: true, message: 'Demo data reset successfully' });
  } catch (err) {
    console.error('Admin reset error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Rule engine ────────────────────────────────────────────────────────────────
router.get('/rule-engine', requireAuth, (req, res) => {
  const db = getDb();
  const row = db.prepare("SELECT value_json FROM rule_engine WHERE key = 'config'").get();
  if (!row) {
    db.prepare("INSERT INTO rule_engine (key, value_json) VALUES ('config', ?)")
      .run(JSON.stringify(DEFAULT_RULE_ENGINE));
    return res.json(DEFAULT_RULE_ENGINE);
  }
  res.json(JSON.parse(row.value_json));
});

router.put('/rule-engine', requireAuth, (req, res) => {
  const db = getDb();
  const perms = ROLE_PERMS[req.user?.role] ?? {};
  if (!perms.canEditHaircuts && !perms.canEditCoverage && !perms.canEditRiskParams) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const row = db.prepare("SELECT value_json FROM rule_engine WHERE key = 'config'").get();
  const current = row ? JSON.parse(row.value_json) : { ...DEFAULT_RULE_ENGINE };
  const patch = req.body;
  const updated = { ...current, ...patch };
  if (patch.counterparties) {
    updated.counterparties = Object.fromEntries(
      Object.entries({ ...current.counterparties, ...patch.counterparties }).map(([cp, v]) => [
        cp, { ...(current.counterparties[cp] ?? {}), ...v },
      ])
    );
  }
  db.prepare(`INSERT OR REPLACE INTO rule_engine (key, value_json, updated_by_user_id, updated_at)
    VALUES ('config', ?, ?, datetime('now'))`).run(JSON.stringify(updated), req.user.id);
  res.json(updated);
});

// ── SFTR submissions ───────────────────────────────────────────────────────────
router.get('/sftr/submissions', requireAuth, (req, res) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT s.*, u.name AS submitted_by_name
    FROM sftr_submissions s
    LEFT JOIN users u ON u.id = s.submitted_by_user_id
    ORDER BY s.submitted_at DESC
    LIMIT 200
  `).all();
  res.json({ data: rows });
});

router.post('/sftr/submit', requireAuth, (req, res) => {
  const db = getDb();
  const { uti, repoId, reportType, principalAmount, currency } = req.body;
  if (!uti || !repoId || !reportType) {
    return res.status(400).json({ error: 'uti, repoId, reportType are required' });
  }
  const id = `SFTR-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
  db.prepare(`
    INSERT INTO sftr_submissions (id, uti, repo_id, submitted_by_user_id, report_type, principal_amount, currency)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, uti, repoId, req.user.id, reportType, principalAmount ?? 0, currency ?? 'RON');
  const row = db.prepare('SELECT * FROM sftr_submissions WHERE id = ?').get(id);
  res.status(201).json(row);
});

// ── CSV template download ──────────────────────────────────────────────────────
router.get('/csv-template', requireAuth, (req, res) => {
  const csv = [
    'Asset ID,ISIN,Name,Type,Currency,Market Value,Haircut %,Eligibility,Custody,Status',
    'AST-101,RO1827DBN011,Romania Gov Bond 2028,Government Bond,RON,12180000,3,Eligible for overnight repo,SaFIR / BNR,Available',
    'AST-102,RO1BVB2029A1,Romania Gov Bond 2029,Government Bond,RON,9190000,4,Eligible for overnight repo,SaFIR / BNR,Available',
    'AST-103,ROTBILL2026X,Romania T-Bill 2026,T-Bill,RON,4470000,2,Eligible for central bank use,SaFIR / BNR,Available',
  ].join('\n');
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="collateral_import_template.csv"');
  res.send(csv);
});

module.exports = router;
