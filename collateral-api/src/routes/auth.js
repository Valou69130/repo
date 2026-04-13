const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/schema');
const { JWT_SECRET } = require('../middleware/auth');

const COOKIE_OPTS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 8 * 60 * 60 * 1000, // 8 hours in ms
  path: '/',
};

router.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: '8h' }
  );
  res.cookie('co_token', token, COOKIE_OPTS);
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

router.post('/logout', (req, res) => {
  res.clearCookie('co_token', { path: '/' });
  res.json({ ok: true });
});

router.get('/me', require('../middleware/auth').requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
