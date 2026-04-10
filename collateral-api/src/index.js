require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { rateLimit } = require('express-rate-limit');

function createApp() {
  const app = express();

  app.use(helmet());

  const allowedOrigins = process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(',')
    : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:4173'];
  app.use(cors({ origin: allowedOrigins, credentials: true }));
  app.use(express.json());

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many login attempts, please try again later' },
  });
  app.use('/auth/login', loginLimiter);

  app.use('/auth',          require('./routes/auth'));
  app.use('/assets',        require('./routes/assets'));
  app.use('/repos',         require('./routes/repos'));
  app.use('/audit',         require('./routes/audit'));
  app.use('/notifications', require('./routes/notifications'));
  app.use('/admin',         require('./routes/admin'));

  app.get('/health', (_req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

if (require.main === module) {
  const app = createApp();
  const PORT = process.env.PORT || 3001;
  app.listen(PORT, () => {
    console.log(`Collateral API → http://localhost:${PORT}`);
  });
}

module.exports = { createApp };
