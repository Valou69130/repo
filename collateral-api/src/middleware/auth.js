const jwt = require('jsonwebtoken');

if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}
const JWT_SECRET = process.env.JWT_SECRET;

// Server-side permission map — mirrors client-side ROLE_PERMS but is authoritative
const ROLE_PERMS = {
  'Treasury Manager':   { canCreateRepo: true,  canCloseRepo: true,  canRolloverRepo: true,  canApproveTopUp: false, canSubstitute: true,  canAdvanceSettlement: false, canImportAssets: false, canReset: true,  readOnly: false },
  'Collateral Manager': { canCreateRepo: false, canCloseRepo: false, canRolloverRepo: false, canApproveTopUp: true,  canSubstitute: true,  canAdvanceSettlement: false, canImportAssets: true,  canReset: false, readOnly: false },
  'Operations Analyst': { canCreateRepo: false, canCloseRepo: false, canRolloverRepo: false, canApproveTopUp: false, canSubstitute: false, canAdvanceSettlement: true,  canImportAssets: false, canReset: false, readOnly: false },
  'Risk Reviewer':      { canCreateRepo: false, canCloseRepo: false, canRolloverRepo: false, canApproveTopUp: false, canSubstitute: false, canAdvanceSettlement: false, canImportAssets: false, canReset: false, readOnly: true  },
};

function requireAuth(req, res, next) {
  // Prefer httpOnly cookie; fall back to Authorization header for API clients
  const cookie = req.cookies?.co_token;
  const header = req.headers.authorization;
  const rawToken = cookie || (header?.startsWith('Bearer ') ? header.slice(7) : null);
  if (!rawToken) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(rawToken, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function requirePerm(perm) {
  return (req, res, next) => {
    const perms = ROLE_PERMS[req.user?.role];
    if (!perms || !perms[perm]) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

function requireWriteAccess(req, res, next) {
  const perms = ROLE_PERMS[req.user?.role];
  if (!perms || perms.readOnly) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

module.exports = { requireAuth, requirePerm, requireWriteAccess, JWT_SECRET };
