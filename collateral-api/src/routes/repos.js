const router = require('express').Router();
const { getDb } = require('../db/schema');
const { requireAuth } = require('../middleware/auth');
const { badRequest, isArrayOfStrings, isFiniteNumber, isNonEmptyString, isOptionalString } = require('../validation');

function getRepoWithAssets(db, id) {
  const repo = db.prepare('SELECT * FROM repos WHERE id = ?').get(id);
  if (!repo) return null;
  const assetRows = db.prepare('SELECT asset_id FROM repo_assets WHERE repo_id = ?').all(id);
  return {
    id: repo.id, counterparty: repo.counterparty, amount: repo.amount,
    currency: repo.currency, rate: repo.rate,
    startDate: repo.start_date, maturityDate: repo.maturity_date,
    state: repo.state, requiredCollateral: repo.required_collateral,
    postedCollateral: repo.posted_collateral, buffer: repo.buffer,
    settlement: repo.settlement, notes: repo.notes,
    assets: assetRows.map(r => r.asset_id),
    integration: repo.integration_json ? JSON.parse(repo.integration_json) : null,
  };
}

router.get('/', requireAuth, (req, res) => {
  const db = getDb();
  const ids = db.prepare('SELECT id FROM repos ORDER BY created_at DESC').all();
  res.json(ids.map(r => getRepoWithAssets(db, r.id)));
});

router.post('/', requireAuth, (req, res) => {
  const db = getDb();
  const { id, counterparty, amount, currency, rate, startDate, maturityDate, state, requiredCollateral, postedCollateral, buffer, settlement, notes, assets } = req.body;
  if (!isNonEmptyString(id) || !isNonEmptyString(counterparty) || !isNonEmptyString(currency) || !isNonEmptyString(startDate) || !isNonEmptyString(maturityDate) || !isNonEmptyString(state) || !isNonEmptyString(settlement)) {
    return badRequest(res, 'Missing required repo fields');
  }
  if (![amount, rate, requiredCollateral, postedCollateral, buffer].every(isFiniteNumber)) {
    return badRequest(res, 'Repo numeric fields must be finite numbers');
  }
  if (notes !== undefined && !isOptionalString(notes)) {
    return badRequest(res, 'notes must be a string');
  }
  if (assets !== undefined && !isArrayOfStrings(assets)) {
    return badRequest(res, 'assets must be an array of asset IDs');
  }
  db.prepare(`INSERT INTO repos (id,counterparty,amount,currency,rate,start_date,maturity_date,state,required_collateral,posted_collateral,buffer,settlement,notes) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, counterparty, amount, currency, rate, startDate, maturityDate, state, requiredCollateral, postedCollateral, buffer, settlement, notes || '');
  const insertRA = db.prepare('INSERT OR IGNORE INTO repo_assets (repo_id, asset_id) VALUES (?, ?)');
  for (const aid of (assets || [])) insertRA.run(id, aid);
  res.status(201).json(getRepoWithAssets(db, id));
});

router.put('/:id', requireAuth, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM repos WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Repo not found' });
  const { state, settlement, postedCollateral, buffer, notes, assets } = req.body;
  if (state !== undefined && !isNonEmptyString(state)) return badRequest(res, 'state must be a non-empty string');
  if (settlement !== undefined && !isNonEmptyString(settlement)) return badRequest(res, 'settlement must be a non-empty string');
  if (postedCollateral !== undefined && !isFiniteNumber(postedCollateral)) return badRequest(res, 'postedCollateral must be a finite number');
  if (buffer !== undefined && !isFiniteNumber(buffer)) return badRequest(res, 'buffer must be a finite number');
  if (notes !== undefined && !isOptionalString(notes)) return badRequest(res, 'notes must be a string');
  if (assets !== undefined && !isArrayOfStrings(assets)) return badRequest(res, 'assets must be an array of asset IDs');
  db.prepare(`UPDATE repos SET state=?, settlement=?, posted_collateral=?, buffer=?, notes=? WHERE id=?`)
    .run(
      state ?? existing.state, settlement ?? existing.settlement,
      postedCollateral ?? existing.posted_collateral, buffer ?? existing.buffer,
      notes ?? existing.notes, req.params.id
    );
  if (assets) {
    db.prepare('DELETE FROM repo_assets WHERE repo_id = ?').run(req.params.id);
    const insertRA = db.prepare('INSERT OR IGNORE INTO repo_assets (repo_id, asset_id) VALUES (?, ?)');
    for (const aid of assets) insertRA.run(req.params.id, aid);
  }
  res.json(getRepoWithAssets(db, req.params.id));
});

module.exports = router;
