# Collateral App

Frontend for a collateral operations demo focused on repo booking, margin monitoring, substitution workflows, digital positions, and integration visibility.

## Stack

- React 19 + Vite
- Tailwind CSS 4
- Radix UI primitives
- Domain workflows and agent-style orchestration in `src/workflows` and `src/agents`

## Run

```bash
npm install
npm run dev
```

The app expects the API at `http://localhost:3001` unless `VITE_API_URL` is set.

## Quality Checks

```bash
npm run lint
npm test
npm run build
```

## Project Shape

- `src/agents` contains the allocation and margin engines.
- `src/workflows` contains pure orchestration functions with audit output.
- `src/domain` contains canonical types, store state, and event helpers.
- `src/pages` contains the lazy-loaded application views.
- `src/integrations` contains the mock adapter and integration bus layer.

## Recent Hardening

- Duplicate agent trees were consolidated onto `src/agents`.
- The app shell now lazy-loads page modules, which materially reduces the initial bundle.
- Workflow tests cover allocation, margin, and substitution behavior.
- ESLint now parses the TypeScript workflow/domain files correctly.
