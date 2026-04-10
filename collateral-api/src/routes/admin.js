const router = require('express').Router();
const { getDb } = require('../db/schema');
const { requireAuth, requirePerm } = require('../middleware/auth');
const { seedDemoData } = require('../db/demoData');

// Full demo reset — wipes all transactional data and reseeds
router.post('/reset', requireAuth, requirePerm('canReset'), (req, res) => {
  const db = getDb();

  try {
    seedDemoData(db, { includeUsers: false });
    res.json({ ok: true, message: 'Demo data reset successfully' });
  } catch (err) {
    console.error('Admin reset error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CSV template download
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
