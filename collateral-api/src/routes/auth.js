const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');
const { JWT_SECRET } = require('../middleware/auth');

if (!process.env.JWT_REFRESH_SECRET) {
  throw new Error('JWT_REFRESH_SECRET environment variable is required');
}
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const ACCESS_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 2 * 60 * 60 * 1000, // 2 hours
  path: '/',
};

const REFRESH_COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/auth/refresh',             // scoped — only sent to the refresh endpoint
};

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
  const accessToken  = jwt.sign(payload, JWT_SECRET,         { expiresIn: '2h' });
  const refreshToken = jwt.sign(payload, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  res.cookie('co_token',   accessToken,  ACCESS_COOKIE_OPTS);
  res.cookie('co_refresh', refreshToken, REFRESH_COOKIE_OPTS);
  res.json({
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
    mustChangePassword: user.must_change_password === 1,
  });
});

router.put('/password', require('../middleware/auth').requireAuth, (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current and new password are required' });
  }
  if (typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }
  if (newPassword.length > 128) {
    return res.status(400).json({ error: 'Password too long' });
  }
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user || !bcrypt.compareSync(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }
  const newHash = bcrypt.hashSync(newPassword, 12);
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(newHash, req.user.id);
  res.json({ ok: true });
});

// Refresh — swap a valid refresh token for a new access token
router.post('/refresh', (req, res) => {
  const raw = req.cookies?.co_refresh;
  if (!raw) return res.status(401).json({ error: 'No refresh token' });
  try {
    const payload = jwt.verify(raw, JWT_REFRESH_SECRET);
    const { id, name, email, role } = payload;
    const accessToken = jwt.sign({ id, name, email, role }, JWT_SECRET, { expiresIn: '2h' });
    res.cookie('co_token', accessToken, ACCESS_COOKIE_OPTS);
    res.json({ ok: true });
  } catch {
    res.clearCookie('co_token',   { path: '/' });
    res.clearCookie('co_refresh', { path: '/auth/refresh' });
    res.status(401).json({ error: 'Refresh token invalid or expired' });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('co_token',   { path: '/' });
  res.clearCookie('co_refresh', { path: '/auth/refresh' });
  res.json({ ok: true });
});

router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
