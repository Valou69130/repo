const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'collateral-demo-secret-2026';

function requireAuth(req, res, next) {
  // Support token in Authorization header OR ?token= query param (for file downloads)
  const header = req.headers.authorization;
  const rawToken = header?.startsWith('Bearer ') ? header.slice(7) : req.query.token;
  if (!rawToken) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(rawToken, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

module.exports = { requireAuth, JWT_SECRET };
