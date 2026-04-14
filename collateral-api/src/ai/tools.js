// Domain tools exposed to the AI agents. Each tool is a read-only query against
// the SQLite domain state — AI never mutates state. Human approval is required
// for any action derived from AI output.

const toolDefinitions = [
  {
    name: 'get_portfolio_state',
    description: 'Returns current portfolio summary: total repos, exposure by counterparty, coverage ratios, outstanding deficits.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_repo',
    description: 'Fetch a single repo by id with its allocated assets and coverage details.',
    input_schema: {
      type: 'object',
      properties: { id: { type: 'string', description: 'Repo id, e.g. "REPO-001"' } },
      required: ['id'],
    },
  },
  {
    name: 'list_repos_for_counterparty',
    description: 'List all active repos for a given counterparty.',
    input_schema: {
      type: 'object',
      properties: { counterparty: { type: 'string' } },
      required: ['counterparty'],
    },
  },
  {
    name: 'get_deficits',
    description: 'Returns all repos where posted collateral is below required collateral, sorted by severity.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_asset_inventory',
    description: 'Lists available (unallocated) eligible assets matching optional filters.',
    input_schema: {
      type: 'object',
      properties: {
        currency: { type: 'string' },
        minRating: { type: 'string', description: 'e.g. "AA-"' },
      },
      required: [],
    },
  },
  {
    name: 'get_counterparty_history',
    description: 'Returns historical margin call / settlement stats for a counterparty: call count last 90d, avg response time, disputes.',
    input_schema: {
      type: 'object',
      properties: { counterparty: { type: 'string' } },
      required: ['counterparty'],
    },
  },
  {
    name: 'get_recent_notifications',
    description: 'Returns unread notifications (exceptions, alerts) ordered newest first.',
    input_schema: {
      type: 'object',
      properties: { limit: { type: 'number', default: 20 } },
      required: [],
    },
  },
  {
    name: 'get_maturity_wall',
    description: 'Returns repos maturing within N days, with free inventory check. Identifies rollover risk — repos where no sufficient eligible inventory exists to replace the posted collateral.',
    input_schema: {
      type: 'object',
      properties: { days: { type: 'number', description: 'Look-ahead window in days (default 14)' } },
      required: [],
    },
  },
  {
    name: 'get_concentration_risk',
    description: 'Returns counterparty and ISIN concentration exposures. Flags any single counterparty above 20% of total book or any single ISIN above 15% of posted collateral.',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'get_coverage_trend',
    description: 'Returns historical coverage ratio changes for a repo by scanning audit events. Shows direction of travel — improving, stable, or deteriorating.',
    input_schema: {
      type: 'object',
      properties: {
        repoId: { type: 'string' },
        days: { type: 'number', description: 'How many days back to look (default 30)' },
      },
      required: ['repoId'],
    },
  },
];

// Tool executors — pure read-only queries against the DB.
function execute(name, input, db) {
  switch (name) {
    case 'get_portfolio_state':
      return portfolioState(db);
    case 'get_repo':
      return getRepo(db, input.id);
    case 'list_repos_for_counterparty':
      return reposForCounterparty(db, input.counterparty);
    case 'get_deficits':
      return deficits(db);
    case 'get_asset_inventory':
      return assetInventory(db, input);
    case 'get_counterparty_history':
      return counterpartyHistory(db, input.counterparty);
    case 'get_recent_notifications':
      return recentNotifications(db, input.limit || 20);
    case 'get_maturity_wall':
      return maturityWall(db, input.days || 14);
    case 'get_concentration_risk':
      return concentrationRisk(db);
    case 'get_coverage_trend':
      return coverageTrend(db, input.repoId, input.days || 30);
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function portfolioState(db) {
  const repos = db.prepare('SELECT * FROM repos').all();
  const byCp = {};
  let totalRequired = 0, totalPosted = 0, deficitCount = 0;
  for (const r of repos) {
    byCp[r.counterparty] = (byCp[r.counterparty] || 0) + r.amount;
    totalRequired += r.required_collateral;
    totalPosted  += r.posted_collateral;
    if (r.posted_collateral < r.required_collateral) deficitCount += 1;
  }
  return {
    totalRepos: repos.length,
    exposureByCounterparty: byCp,
    totalRequiredCollateral: totalRequired,
    totalPostedCollateral: totalPosted,
    coverageRatio: totalRequired ? +(totalPosted / totalRequired * 100).toFixed(2) : 0,
    deficitCount,
  };
}

function getRepo(db, id) {
  const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(id);
  if (!repo) return { error: `Repo ${id} not found` };
  const assets = db.prepare(
    'SELECT a.* FROM repo_assets ra JOIN assets a ON a.id = ra.asset_id WHERE ra.repo_id = ?'
  ).all(id);
  const deficit = repo.required_collateral - repo.posted_collateral;
  return {
    id: repo.id, counterparty: repo.counterparty, amount: repo.amount, currency: repo.currency,
    rate: repo.rate, startDate: repo.start_date, maturityDate: repo.maturity_date,
    state: repo.state, settlement: repo.settlement,
    requiredCollateral: repo.required_collateral, postedCollateral: repo.posted_collateral,
    buffer: repo.buffer, deficit: deficit > 0 ? deficit : 0,
    coverageRatio: repo.required_collateral ? +(repo.posted_collateral / repo.required_collateral * 100).toFixed(2) : 0,
    assets: assets.map(a => ({ id: a.id, isin: a.isin, issuer: a.issuer, rating: a.rating, marketValue: a.market_value, haircut: a.haircut })),
  };
}

function reposForCounterparty(db, counterparty) {
  return db.prepare('SELECT id, amount, currency, state, required_collateral, posted_collateral FROM repos WHERE counterparty = ?')
    .all(counterparty);
}

function deficits(db) {
  const rows = db.prepare(`
    SELECT id, counterparty, currency, required_collateral, posted_collateral,
           (required_collateral - posted_collateral) AS deficit
    FROM repos
    WHERE posted_collateral < required_collateral
    ORDER BY deficit DESC
  `).all();
  return rows.map(r => ({
    id: r.id, counterparty: r.counterparty, currency: r.currency,
    deficit: r.deficit,
    coverageRatio: r.required_collateral ? +(r.posted_collateral / r.required_collateral * 100).toFixed(2) : 0,
  }));
}

function assetInventory(db, { currency, minRating } = {}) {
  const allocated = new Set(db.prepare('SELECT asset_id FROM repo_assets').all().map(r => r.asset_id));
  let rows = db.prepare('SELECT * FROM assets').all();
  rows = rows.filter(a => !allocated.has(a.id));
  if (currency) rows = rows.filter(a => a.currency === currency);
  if (minRating) {
    const ranks = { 'AAA': 1, 'AA+': 2, 'AA': 3, 'AA-': 4, 'A+': 5, 'A': 6, 'A-': 7, 'BBB+': 8, 'BBB': 9 };
    const cutoff = ranks[minRating] ?? 99;
    rows = rows.filter(a => (ranks[a.rating] ?? 99) <= cutoff);
  }
  return rows.slice(0, 50).map(a => ({
    id: a.id, isin: a.isin, issuer: a.issuer, rating: a.rating,
    currency: a.currency, marketValue: a.market_value, haircut: a.haircut,
  }));
}

function counterpartyHistory(db, counterparty) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 86400 * 1000).toISOString();
  const events = db.prepare(`
    SELECT action, ts FROM audit_events
    WHERE object IN (SELECT id FROM repos WHERE counterparty = ?)
      AND ts > ?
  `).all(counterparty, ninetyDaysAgo);
  const calls = events.filter(e => /margin/i.test(e.action)).length;
  const settles = events.filter(e => /settle/i.test(e.action)).length;
  return { counterparty, marginEvents90d: calls, settlementEvents90d: settles, totalAuditedEvents: events.length };
}

function recentNotifications(db, limit) {
  return db.prepare('SELECT id, severity, text, target, created_at, read FROM notifications WHERE read = 0 ORDER BY id DESC LIMIT ?')
    .all(limit);
}

function maturityWall(db, days) {
  const cutoff = new Date(Date.now() + days * 86400 * 1000).toISOString().slice(0, 10);
  const today  = new Date().toISOString().slice(0, 10);
  const maturing = db.prepare(`
    SELECT id, counterparty, amount, currency, maturity_date,
           required_collateral, posted_collateral, state
    FROM repos
    WHERE maturity_date BETWEEN ? AND ? AND state != 'Closed'
    ORDER BY maturity_date ASC
  `).all(today, cutoff);

  const allocated = new Set(db.prepare('SELECT asset_id FROM repo_assets').all().map(r => r.asset_id));
  const freeAssets = db.prepare('SELECT id, market_value, haircut, currency, rating FROM assets').all()
    .filter(a => !allocated.has(a.id));
  const freeInventory = freeAssets.reduce((s, a) => s + a.market_value * (1 - (a.haircut || 0) / 100), 0);

  return {
    lookAheadDays: days,
    maturingRepos: maturing.map(r => {
      const daysUntil = Math.round((new Date(r.maturity_date) - Date.now()) / 86400000);
      return {
        id: r.id, counterparty: r.counterparty, maturityDate: r.maturity_date,
        daysUntil, currency: r.currency,
        postedCollateral: r.posted_collateral,
        rolloverRisk: freeInventory < r.posted_collateral ? 'HIGH' : 'LOW',
      };
    }),
    totalPostedAtRisk: maturing.reduce((s, r) => s + r.posted_collateral, 0),
    freeInventoryValue: +freeInventory.toFixed(0),
  };
}

function concentrationRisk(db) {
  const repos = db.prepare('SELECT counterparty, amount, required_collateral FROM repos WHERE state != \'Closed\'').all();
  const totalExposure = repos.reduce((s, r) => s + r.amount, 0);
  const byCp = {};
  for (const r of repos) {
    byCp[r.counterparty] = (byCp[r.counterparty] || 0) + r.amount;
  }
  const cpRisk = Object.entries(byCp).map(([cp, exposure]) => ({
    counterparty: cp, exposure,
    sharePct: totalExposure ? +(exposure / totalExposure * 100).toFixed(1) : 0,
    breached: totalExposure ? exposure / totalExposure > 0.20 : false,
  })).sort((a, b) => b.exposure - a.exposure);

  const repoAssets = db.prepare(`
    SELECT ra.repo_id, a.isin, a.issuer, a.market_value
    FROM repo_assets ra JOIN assets a ON a.id = ra.asset_id
  `).all();
  const totalPosted = repoAssets.reduce((s, a) => s + a.market_value, 0);
  const byIsin = {};
  for (const a of repoAssets) {
    if (!byIsin[a.isin]) byIsin[a.isin] = { isin: a.isin, issuer: a.issuer, value: 0 };
    byIsin[a.isin].value += a.market_value;
  }
  const isinRisk = Object.values(byIsin).map(i => ({
    ...i,
    sharePct: totalPosted ? +(i.value / totalPosted * 100).toFixed(1) : 0,
    breached: totalPosted ? i.value / totalPosted > 0.15 : false,
  })).sort((a, b) => b.value - a.value).slice(0, 10);

  return {
    totalExposure,
    counterpartyConcentration: cpRisk,
    isinConcentration: isinRisk,
    hasBreaches: cpRisk.some(c => c.breached) || isinRisk.some(i => i.breached),
  };
}

function coverageTrend(db, repoId, days) {
  const since = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const events = db.prepare(`
    SELECT ts, action, prev_state, next_state
    FROM audit_events
    WHERE object = ? AND ts > ?
    ORDER BY ts ASC
  `).all(repoId, since);

  // Extract posted collateral values from audit next_state strings like "Active · posted=1234567"
  const postedPattern = /posted=(\d+(?:\.\d+)?)/;
  const dataPoints = events
    .filter(e => postedPattern.test(e.next_state || ''))
    .map(e => {
      const match = (e.next_state || '').match(postedPattern);
      return { ts: e.ts, posted: parseFloat(match[1]), action: e.action };
    });

  const current = db.prepare('SELECT required_collateral, posted_collateral FROM repos WHERE id = ?').get(repoId);
  const direction = dataPoints.length < 2 ? 'stable'
    : dataPoints[dataPoints.length - 1].posted > dataPoints[0].posted ? 'improving'
    : dataPoints[dataPoints.length - 1].posted < dataPoints[0].posted ? 'deteriorating'
    : 'stable';

  return {
    repoId, lookBackDays: days,
    currentPosted: current?.posted_collateral ?? null,
    currentRequired: current?.required_collateral ?? null,
    direction,
    auditDataPoints: dataPoints,
    note: dataPoints.length === 0 ? 'No collateral update events in this window' : null,
  };
}

module.exports = { toolDefinitions, execute };
