const path = require('path');
// Load env from collateral-api/.env — dotenv in index.js looks for .env relative
// to CWD which on Vercel is the repo root, not the collateral-api sub-directory.
require('dotenv').config({ path: path.join(__dirname, '../collateral-api/.env') });

const { createApp } = require('../collateral-api/src/index');

const app = createApp();

module.exports = (req, res) => {
  req.url = req.url.replace(/^\/api/, '') || '/';
  return app(req, res);
};
