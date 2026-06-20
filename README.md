# Sentinel TPRM — Demo

AI-assisted Third-Party Risk Management portal for a bank (DBS). Vendors answer a
security questionnaire once; the platform **adjudicates their evidence** (claim vs proof)
and **auto-maps each verdict to MAS / RBI / SEBI CSCRF** clauses live.

> Demo scaffold (Phase 1–2). Seeded with 10 representative controls extracted faithfully
> from the real `NIPL-SMICC InfoSec TPRM` sample, plus a hand-authored regulatory crosswalk.

## Run it

**Locally (fastest):**
```bash
cd web
npm install
npm run dev          # http://localhost:3000
```
The demo works **with no API key** — the AI endpoint falls back to the real assessor
verdicts from the sample. To see live Claude adjudication:
```bash
export ANTHROPIC_API_KEY=sk-ant-...
npm run dev
```

**Full stack (portable, one command):**
```bash
cp .env.example .env   # optionally add ANTHROPIC_API_KEY
docker compose up --build   # web on :3000, postgres+pgvector on :5432
```

## What's built
- **Landing** (`/`) — animated hero, light/dark, framework chips.
- **Assessor console** (`/console`) — vendor header, posture dial, per-framework coverage,
  control list, per-control AI adjudication (evidence checks + citations + recommendations),
  and the **tracer auto-mapping graph** (the signature visual).
- **AI endpoint** (`/api/adjudicate`) — Claude call with deterministic offline fallback.

## Stack (chosen for host portability)
Next.js 15 (standalone) · TypeScript · Tailwind (light/dark tokens) · Framer Motion ·
Postgres + pgvector · Anthropic SDK · fully Dockerised. No host lock-in — lift-and-shift
to any cloud / region (incl. India / Singapore for data-residency requirements).

## Roadmap
- **Phase 3:** Python FastAPI pipeline (multimodal evidence ingest, RAG, cross-control critic), eval-vs-sample harness.
- **Phase 4:** per-vendor portal logins (MFA, portal-only roles, audit log), persistence, full 52-control + API checklist set.

See `web/src/data/seed.ts` for the controls + MAS/RBI/SEBI crosswalk.
