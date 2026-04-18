require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');

function createApp() {
  const app = express();

  // Trust the first proxy hop (Vercel's load balancer) so req.ip is the client IP
  // and express-rate-limit's trustProxy validation passes.
  app.set('trust proxy', 1);

  app.use(helmet());

  // HTTP access log — 'combined' for prod, 'dev' for local readability
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'];
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(cookieParser());
  app.use(express.json());

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    message: { error: 'Too many login attempts, please try again later' },
  });
  app.use('/account/login', loginLimiter);

  // Broad write limiter for all mutating endpoints
  const writeLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    validate: { trustProxy: false },
    message: { error: 'Rate limit exceeded, please slow down' },
    skip: (req) => req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS',
  });
  app.use(writeLimiter);

  app.use('/account',          require('./routes/auth'));
  app.use('/assets',        require('./routes/assets'));
  app.use('/repos',         require('./routes/repos'));
  app.use('/audit',         require('./routes/audit'));
  app.use('/notifications', require('./routes/notifications'));
  app.use('/admin',         require('./routes/admin'));
  app.use('/ai',            require('./routes/ai'));
  app.use('/agreements',    require('./routes/agreements'));
  app.use('/',              require('./routes/eligibilitySchedules'));
  app.use('/',              require('./routes/haircutSchedules'));
  app.use('/margin-calls',  require('./routes/marginCalls'));
  app.use('/approvals',     require('./routes/approvals'));
  app.use('/',              require('./routes/disputes'));

  app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

function purgeOldAuditLogs(db) {
  const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { changes } = db.prepare("DELETE FROM audit_events WHERE ts < ?").run(cutoff.slice(0, 16).replace('T', ' '));
  if (changes > 0) console.log(`Audit retention: purged ${changes} entries older than 90 days`);
}

if (require.main === module) {
  const app = createApp();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Collateral API → http://localhost:${PORT}`);
    const { getDb } = require('./db/schema');
    purgeOldAuditLogs(getDb());
    setInterval(() => purgeOldAuditLogs(getDb()), 24 * 60 * 60 * 1000);
    // Start AI proactive scheduler (no-ops if AI_ENABLED=false)
    require('./ai/scheduler').start(getDb());
  });
}

module.exports = { createApp };
