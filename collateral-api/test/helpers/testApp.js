process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const express = require('express');
const cookieParser = require('cookie-parser');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const { initSchema } = require('../../src/db/schema');

function buildApp({ mount }) {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initSchema(db);

  const roles = ['Treasury Manager', 'Collateral Manager', 'Risk Reviewer', 'Credit Approver', 'Operations Analyst'];
  roles.forEach((role, i) => {
    db.prepare(
      `INSERT INTO users (id, name, email, password_hash, role) VALUES (?, ?, ?, 'h', ?)`
    ).run(i + 1, role, `${role.toLowerCase().replace(/\s+/g, '.')}@x`, role);
  });

  const app = express();
  app.use(cookieParser());
  app.use(express.json());

  app.use((req, _res, next) => { req.testDb = db; next(); });

  mount(app);

  return { app, db };
}

function tokenFor(role, userId = 1) {
  return jwt.sign({ id: userId, role }, process.env.JWT_SECRET);
}

module.exports = { buildApp, tokenFor };
