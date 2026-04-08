# Collateral Orchestrator Demo

This workspace contains a small full-stack collateral management demo:

- [`/Users/vali/Desktop/1/collateral-app`](/Users/vali/Desktop/1/collateral-app): React frontend for treasury, collateral, operations, and reporting workflows
- [`/Users/vali/Desktop/1/collateral-api`](/Users/vali/Desktop/1/collateral-api): Express + SQLite API with seeded demo data

## What The Product Demonstrates

- Repo trade booking with collateral basket recommendation
- Margin deficit detection and top-up workflow handling
- Collateral substitution analysis and approval flows
- Audit trail and notification surfaces
- Mock integration channels for settlement, confirmation, reconciliation, and position sync

## Run Locally

Frontend:

```bash
cd collateral-app
npm install
npm run dev
```

API:

```bash
cd collateral-api
npm install
npm run seed
npm run dev
```

## Demo Credentials

- `treasury@banca-demo.ro`
- `collateral@banca-demo.ro`
- `operations@banca-demo.ro`
- `risk@banca-demo.ro`

Password for all demo users: `demo1234`

## Verification Commands

Frontend:

```bash
cd collateral-app
npm run lint
npm test
npm run build
```

API:

```bash
cd collateral-api
npm test
```

## Architecture Notes

- The workflow layer in [`/Users/vali/Desktop/1/collateral-app/src/workflows`](/Users/vali/Desktop/1/collateral-app/src/workflows) is intentionally pure and returns typed audit artifacts.
- The agent layer in [`/Users/vali/Desktop/1/collateral-app/src/agents`](/Users/vali/Desktop/1/collateral-app/src/agents) acts as the domain decision engine.
- The API now exports an app factory in [`/Users/vali/Desktop/1/collateral-api/src/index.js`](/Users/vali/Desktop/1/collateral-api/src/index.js), which makes the route layer testable without starting the server.
- Seed/reset data is centralized in [`/Users/vali/Desktop/1/collateral-api/src/db/demoData.js`](/Users/vali/Desktop/1/collateral-api/src/db/demoData.js).

## Recent Improvements

- Consolidated duplicate frontend agent trees
- Added workflow unit tests
- Added API route tests and request validation
- Replaced the placeholder frontend README
- Added lazy-loaded frontend pages to reduce the initial bundle footprint
