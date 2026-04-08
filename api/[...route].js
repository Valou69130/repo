const { createApp } = require('../collateral-api/src/index');

const app = createApp();

module.exports = (req, res) => {
  req.url = req.url.replace(/^\/api/, '') || '/';
  return app(req, res);
};
