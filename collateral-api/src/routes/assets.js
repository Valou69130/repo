const router = require('express').Router();
const multer = require('multer');
const { getDb } = require('../db/schema');
const { requireAuth, requirePerm, requireWriteAccess } = require('../middleware/auth');
const { badRequest, isFiniteNumber, isNonEmptyString } = require('../validation');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024 } });

function toAsset(row) {
  return {
    id: row.id, isin: row.isin, name: row.name, issuer: row.issuer,
    type: row.type, currency: row.currency, quantity: row.quantity,
    marketValue: row.market_value, haircut: row.haircut,
    eligibility: row.eligibility, custody: row.custody, status: row.status,
    integration: row.integration_json ? JSON.parse(row.integration_json) : null,
  };
}

router.get('/', requireAuth, (req, res) => {
  const rows = getDb().prepare('SELECT * FROM assets ORDER BY id').all();
  res.json(rows.map(toAsset));
});

router.put('/:id', requireAuth, requireWriteAccess, (req, res) => {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Asset not found' });
  const { status, marketValue, quantity } = req.body;
  const allowedStatuses = new Set(['Available', 'Reserved', 'Locked', 'Pledged']);
  if (status !== undefined && !allowedStatuses.has(status)) {
    return badRequest(res, 'Invalid asset status');
  }
  if (marketValue !== undefined && !isFiniteNumber(marketValue)) {
    return badRequest(res, 'marketValue must be a finite number');
  }
  if (quantity !== undefined && (!Number.isInteger(quantity) || quantity < 0)) {
    return badRequest(res, 'quantity must be a non-negative integer');
  }
  db.prepare('UPDATE assets SET status=?, market_value=?, quantity=? WHERE id=?')
    .run(status ?? existing.status, marketValue ?? existing.market_value, quantity ?? existing.quantity, req.params.id);
  res.json(toAsset(db.prepare('SELECT * FROM assets WHERE id = ?').get(req.params.id)));
});

// CSV import — expected columns: Asset ID, ISIN, Name, Type, Currency, Market Value, Haircut %, Eligibility, Custody, Status
router.post('/import', requireAuth, requirePerm('canImportAssets'), upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const db = getDb();
  const lines = req.file.buffer.toString('utf-8').trim().split('\n').filter(Boolean);
  const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, '_').replace(/%/g, ''));
  const upsert = db.prepare(`
    INSERT INTO assets (id,isin,name,issuer,type,currency,quantity,market_value,haircut,eligibility,custody,status)
    VALUES (@id,@isin,@name,@issuer,@type,@currency,@quantity,@market_value,@haircut,@eligibility,@custody,@status)
    ON CONFLICT(id) DO UPDATE SET
      isin=excluded.isin, name=excluded.name, market_value=excluded.market_value,
      haircut=excluded.haircut, eligibility=excluded.eligibility,
      custody=excluded.custody, status=excluded.status, quantity=excluded.quantity
  `);
  let imported = 0;
  const errors = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(',').map(v => v.trim());
    const row = Object.fromEntries(headers.map((h, idx) => [h, vals[idx] ?? '']));
    try {
      if (!isNonEmptyString(row.isin) && !isNonEmptyString(row.asset_id)) {
        throw new Error('Asset ID or ISIN is required');
      }
      upsert.run({
        id:          row.asset_id || `IMP-${Date.now()}-${i}`,
        isin:        row.isin || '',
        name:        row.name || row.asset_name || '',
        issuer:      row.issuer || 'Imported',
        type:        row.type || 'Government Bond',
        currency:    row.currency || 'RON',
        quantity:    parseInt(row.quantity) || 0,
        market_value: parseFloat(row.market_value) || 0,
        haircut:     parseFloat(row.haircut) || 0,
        eligibility: row.eligibility || 'Eligible for overnight repo',
        custody:     row.custody || 'SaFIR / BNR',
        status:      row.status || 'Available',
      });
      imported++;
    } catch (e) {
      errors.push({ line: i + 1, error: e.message });
    }
  }
  res.json({ imported, errors });
});

module.exports = router;
