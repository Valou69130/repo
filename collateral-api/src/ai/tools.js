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

module.exports = { toolDefinitions, execute };
