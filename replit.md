# Synthetic GTM Signal Engine

A demo GTM signal pipeline built entirely on synthetic/fictional data: it enriches
synthetic companies and people, generates realistic product-analytics event timelines,
builds human-readable behavioral trails, and scores and prioritizes prospects against an
editable growth hypothesis. The one real, live integration is Attio: marking an
outreach package "Sent" pushes a real Company/Person upsert + outreach Note to the
connected Attio workspace via `ATTIO_API_KEY`. See
`artifacts/gtm-signal-engine/README.md` for full architecture, data model, event
taxonomy, scoring, and Attio sync documentation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/gtm-signal-engine run dev` — run the frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Frontend: React + Vite, wouter routing, shadcn/ui, TanStack Query via generated hooks
- Synthetic data: `@faker-js/faker`

## Where things live

- `artifacts/gtm-signal-engine/` — frontend (Dashboard, Prospects, Prospect Detail, Growth Hypothesis, Outreach Queue, Demo Controls)
- `artifacts/api-server/src/routes/` — Express routers (dashboard, prospects, hypotheses, outreach, demo)
- `artifacts/api-server/src/lib/gtm/` — all product logic: event generation, trail building, scoring, hypothesis defaults, seed/demo orchestration, Attio export payload preview + real sync (`attio.ts`, `attioClient.ts`)
- `lib/db/src/schema/` — Drizzle schema (source of truth for the 7 tables)
- `lib/api-spec/openapi.yaml` — source of truth for the API contract
- `lib/api-zod/`, `lib/api-client-react/` — generated Zod schemas + React Query hooks (regenerate via codegen, never hand-edit `generated/`)

## Architecture decisions

- Substituted the original spec's SQLite for this workspace's standard PostgreSQL + Drizzle stack — same entities and logic, different storage engine.
- `archetype` was added to `people` (not in the original spec's field list) since both event generation and scoring need a stable ground-truth label per person.
- `research_assessments` and `behavioral_trails` hold one current row per person (upserted on recalculation), not a full history — only `growth_hypotheses` preserves version history, per spec.
- Scoring formulas (composite score, priority thresholds) were designed from scratch since the spec only gave qualitative rules — see the README's "Scoring model" section for the exact thresholds and reasoning.
- Demo Controls consolidated under `/api/demo/*`; saving a new hypothesis (`POST /hypotheses`) also triggers a full recalculation and returns a before/after diff.

## Product

Screens: Dashboard (pipeline overview), Prospects (filterable/sortable list), Prospect
Detail (scores, rationale, behavioral trail, raw events, queue-outreach action), Growth
Hypothesis (edit weights/guidance, version history, recalculate diff), Outreach Queue
(status workflow, payload preview, real Attio sync status/retry on Sent), Demo Controls
(generate/simulate/reset synthetic data). A persistent "Synthetic Demo Data" badge is
shown in the nav at all times.

## User preferences

_None recorded yet._

## Gotchas

- Deep imports into `@workspace/api-client-react/src/generated/...` are not exported by the package — import generated types/schemas from the package root (`@workspace/api-client-react`) instead.
- After changing scoring logic, existing seeded data has stale `outreachPriority` values until `/api/demo/recalculate` (or a reset/reseed) is run.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
