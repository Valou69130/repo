# CollateralOS

CollateralOS is a repo and collateral management demo focused on treasury, collateral, operations, risk, and reporting workflows.

## Project Layout

- [`collateral-app`](/Users/vali/Desktop/repo/collateral-app): React + Vite frontend
- [`collateral-api`](/Users/vali/Desktop/repo/collateral-api): Express + SQLite backend for local development and API tests
- [`api`](/Users/vali/Desktop/repo/api): Vercel function experiments kept in the repo, but the live demo currently relies on frontend demo storage

## Current Deployment State

- Production frontend is deployed on Vercel
- The live demo currently uses browser-based seeded demo data when `VITE_API_URL` is not configured
- Local development can still use the Express API on `http://localhost:3001`

This means the app is currently optimized for a reliable demo experience first, with the backend still available for local work and future production hardening.

## What The Demo Covers

- Repo trade booking with collateral basket recommendation
- Margin deficit detection and top-up handling
- Collateral substitution analysis and approval flows
- Audit trail and notifications
- Regulatory and reporting surfaces including SFTR
- Mock integration context for settlement, confirmation, reconciliation, and position sync

## Run Locally

Frontend only:

```bash
cd collateral-app
npm install
npm run dev
```

Frontend + local API:

```bash
cd collateral-api
npm install
npm run seed
npm run dev
```

In a second terminal:

```bash
cd collateral-app
npm install
npm run dev
```

## Demo Credentials

- `treasury@banca-demo.ro`
- `collateral@banca-demo.ro`
- `operations@banca-demo.ro`
- `risk@banca-demo.ro`

Password for all demo users: `demo1234`

## Verification

Frontend:

```bash
cd collateral-app
npm test
npm run build
```

Backend:

```bash
cd collateral-api
npm test
```

## Architecture Notes

- The workflow layer in [`collateral-app/src/workflows`](/Users/vali/Desktop/repo/collateral-app/src/workflows) contains the core workflow logic
- The agent layer in [`collateral-app/src/agents`](/Users/vali/Desktop/repo/collateral-app/src/agents) acts as the domain decision engine
- The frontend API abstraction lives in [`collateral-app/src/integrations/api.js`](/Users/vali/Desktop/repo/collateral-app/src/integrations/api.js)
- The production demo fallback lives in [`collateral-app/src/integrations/mockApi.js`](/Users/vali/Desktop/repo/collateral-app/src/integrations/mockApi.js)
- The Express app factory lives in [`collateral-api/src/index.js`](/Users/vali/Desktop/repo/collateral-api/src/index.js)
- Seed/reset data is centralized in [`collateral-api/src/db/demoData.js`](/Users/vali/Desktop/repo/collateral-api/src/db/demoData.js)

## Near-Term Priorities

- Clean up repo noise and generated files
- Polish the demo UX and storytelling
- Decide whether to stay demo-first or finish production backend deployment
- Simplify deployment configuration once the long-term hosting model is chosen
