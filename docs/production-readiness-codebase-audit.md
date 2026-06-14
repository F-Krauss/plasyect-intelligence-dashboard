# Production Readiness Codebase Audit

Date: 2026-06-14

Scope:

- Frontend React/Vite app.
- Backend Cloud Run API.
- Windows Server `sync-service`.
- OCR service surface where it affects production readiness.
- FDB mirror data path from Windows Server to Supabase/Postgres to Cloud Run to dashboard.

## Executive Summary

The app builds and the deployed backend can read FDB mirror data, but the system is not fully production-ready yet.

Main blockers:

1. The Windows sync data is stale. Last successful sync in deployed DB is `2026-06-10T10:01:15.563Z`, while today is `2026-06-14`.
2. Key operational KPIs still use `/api/bootstrap`, which is capped at 800 rows, so global pipeline/progress calculations can be wrong.
3. Backend auth exposes `/api/auth/auto`, which issues a director token without credentials.
4. Frontend production build depends on `VITE_API_BASE_URL` at build time. If Hostinger is not rebuilt/uploaded after backend changes, users see old code.
5. Some modules are still manual/local-state workflows, not real FDB dashboards.
6. Root production dependency audit reports high severity advisories through `vite`/`esbuild`.

## Verified Checks

Commands run:

```bash
npm run lint
npm run build
npm --prefix backend run build
npm --prefix backend run test
npm --prefix sync-service run build
npm --prefix sync-service run test:connection
npm audit --omit=dev
npm --prefix backend audit --omit=dev
npm --prefix sync-service audit --omit=dev
```

Results:

| Check | Result |
|---|---|
| Frontend TypeScript | Pass |
| Frontend production build | Pass |
| Backend TypeScript | Pass |
| Backend tests | Pass, 11 tests |
| Sync service TypeScript | Pass |
| Sync DB connection | Pass |
| Backend production dependency audit | Pass, 0 vulns |
| Sync service production dependency audit | Pass, 0 vulns |
| Root production dependency audit | Fail, 2 high findings via `vite`/`esbuild` |

Live backend checks:

```bash
GET /health
GET /api/erp/sync/status
GET /api/erp/operativo?fechaInicio=2025-06-14&fechaFin=2026-06-14
GET /api/erp/operativo?fechaInicio=2026-05-01&fechaFin=2026-05-25
```

Live API returned FDB data:

- `active.orders`: `43`
- `active.batches`: `1371`
- `active.pairs`: `80069`
- `productionHourly`: `733`
- `quality`: `9900`
- `models`: `453`
- `dailyProduction`: `70`

No-data May range returned correctly:

- `hasPeriodData`: `false`
- active KPIs: `null`
- row arrays: `0`

## Current Data Path

```mermaid
flowchart LR
  A["Windows Server / BigZap FDB"] --> B["sync-service"]
  B --> C["Supabase/Postgres bigzap_* tables"]
  C --> D["Cloud Run backend plasyect-api"]
  D --> E["Frontend dashboard"]
```

Important production invariant:

The frontend should never invent operational values when the FDB mirror has no rows for the selected period.

## Findings

## P0 - Windows Sync Is Stale

Evidence:

Live `/api/erp/sync/status` returned:

```json
{
  "status": "ok",
  "started_at": "2026-06-10 10:00:52.568+00",
  "finished_at": "2026-06-10 10:01:15.563752+00",
  "payload": {
    "mode": "completo"
  }
}
```

Live FDB mirror max dates:

| Source | Max date |
|---|---|
| `bigzap_avance.fecha` | `2026-04-21` |
| `bigzap_lotes.fecha_programacion` | `2026-04-21` |
| `bigzap_pedidos.fecha_pedido` | `2026-04-20` |
| `bigzap_pt_movimientos.fecha_movimiento` | `2026-04-21` |

Impact:

- Dashboard can show real data, but not current plant reality.
- Active KPIs may describe the last mirrored FDB snapshot, not today.
- If the Windows service is expected to publish each update, production is not healthy.

Current code:

- `sync-service/src/index.ts` loops every `SYNC_INTERVAL_SECONDS`.
- `FDB_WATCH_PATH` can trigger immediate sync on FDB file mtime.
- `/api/erp/sync/status` reports last run.

Fix:

1. Verify Windows service is installed and running:

```powershell
nssm status PlasyectBigzapSync
nssm restart PlasyectBigzapSync
```

2. Check logs:

```powershell
notepad C:\plasyect\sync-service\logs\sync.out.log
notepad C:\plasyect\sync-service\logs\sync.err.log
```

3. Run one forced sync on Windows:

```powershell
cd C:\plasyect\sync-service
node dist\index.js --once --full
```

4. Add backend health flag:

```ts
syncFresh: lastSync >= now - 30 minutes
```

5. Display stale warning in frontend when sync is old.

## P0 - Auto Auth Issues Director Token Without Credentials

Evidence:

Backend route:

```ts
router.post('/api/auth/auto', (_req, res) => {
  res.json({ token: issueToken(defaultUser), user: defaultUser });
});
```

Impact:

- Anyone who can reach the API can get a `DIRECTOR_GENERAL` session.
- Production data is effectively public if the Cloud Run service is public.
- This is not acceptable for production.

Fix:

1. Disable `/api/auth/auto` in production.
2. Add real login endpoint.
3. Require password/OIDC/Google Identity.
4. Add role claims from backend-side user store.
5. Rotate `JWT_SECRET` after replacing auth.

Suggested guard:

```ts
if (config.NODE_ENV === 'production') {
  return res.status(404).json({ error: 'not_found' });
}
```

## P1 - Pipeline Global KPIs Use Truncated Bootstrap

Evidence:

`/api/bootstrap` loads FDB lots with:

```ts
limit config.BIGZAP_BATCH_LIMIT
```

Default:

```ts
BIGZAP_BATCH_LIMIT=800
```

FDB active reality:

- active batches: `1371`
- active pairs: `80069`

Dashboard logic currently calculates some global KPIs from `filteredBatches`, which comes from bootstrap.

Impact:

- `Avance Global` can be wrong.
- Pipeline stage totals can be wrong.
- Dominant stage per order can be wrong.
- Backlog/risk tables can be wrong if lots are missing.

Measured example:

- UI was showing `52%` global progress.
- SQL over complete FDB mirror calculated `27%`.

Fix:

Move global operational calculations into `/api/erp/operativo`:

- `wipSummary`
- `stagePipeline`
- `orderRisk`
- `orderPipeline`

Frontend must render these backend aggregates instead of calculating global KPIs from bootstrap.

Keep bootstrap only for detail/search/edit workflows.

## P1 - `bigzap_avance` Primary Key Can Lose Multiple Scans

Evidence:

Migration:

```sql
primary key (programa, lote, depto)
```

Sync upsert:

```ts
upsertJson(
  'public.bigzap_avance',
  ...,
  'programa, lote, depto',
  data.avance
)
```

Impact:

If Firebird `AVANCE` contains multiple scans for the same `programa/lote/depto`, the mirror keeps only one row.

This affects:

- scan history
- exact movement timeline
- repeated readings
- entry/exit timing
- audit trail per tarjeta viajera

The dashboard currently uses `bigzap_avance` as movement source, so this is high risk for traceability.

Fix:

1. Change `bigzap_avance` key to preserve every scan.
2. If Firebird has no natural ID, use a hash similar to PTMOV:

```ts
id = md5(programa|lote|depto|fecha|hora_cs|gen_por|subdepto)
```

3. Migration:

```sql
alter table public.bigzap_avance drop constraint bigzap_avance_pkey;
alter table public.bigzap_avance add column id text;
update public.bigzap_avance set id = md5(...);
alter table public.bigzap_avance add primary key (id);
```

4. Update sync service conflict target to `id`.
5. Re-run full sync.

## P1 - Production Frontend Deploy Is Manual/Unverified

Evidence:

Docs say frontend is Hostinger static upload:

```md
subir el contenido de dist/ a Hostinger
```

No deploy script exists for frontend.

Impact:

- Backend may be updated while live frontend still runs old bundle.
- Fixes can pass locally but not reach `t-efficiency.com`.
- Production verification can be false if testing local only.

Fix:

1. Add frontend deploy script or documented exact command.
2. Add checksum/version display in frontend footer.
3. Add a `/version.json` artifact in `dist`.
4. After deploy, verify live bundle hash or build timestamp.

## P1 - Root Dependency Audit Has High Severity Findings

Evidence:

`npm audit --omit=dev --json` reports:

- `vite`: high via `esbuild`
- `esbuild`: high

Impact:

Risk depends on production exposure. Vite is build/dev tooling, but it is listed in root dependencies, not devDependencies.

Fix:

1. Move build-only packages to `devDependencies` where possible:
   - `vite`
   - `@vitejs/plugin-react`
   - `@tailwindcss/vite`
   - `esbuild`
   - `tsx`
   - `typescript`
2. Upgrade Vite/esbuild after compatibility check.
3. Re-run:

```bash
npm audit --omit=dev
npm run build
```

## P1 - CORS and Public API Are Too Open

Evidence:

Deploy script default:

```bash
CORS_ORIGINS=${CORS_ORIGINS:-*}
```

Cloud Run deploy:

```bash
--allow-unauthenticated
```

Combined with `/api/auth/auto`, this makes production data broadly accessible.

Fix:

1. Set explicit CORS origins:

```bash
CORS_ORIGINS=https://t-efficiency.com,https://www.t-efficiency.com
```

2. Remove auto auth in production.
3. Consider Cloud Run IAM or Identity-Aware Proxy if dashboard should be private.

## P2 - Date Inputs Are Fragile In Browser Automation

Evidence:

During browser QA, Playwright fill attempts on date inputs did not reliably propagate state in Safari/in-app browser.

Impact:

- Manual users may be fine, but automated QA is weaker.
- Date range testing can be flaky.

Fix:

1. Add explicit "Aplicar filtros" button.
2. Keep local draft dates separate from applied query dates.
3. Fetch only on Apply, not every date input mutation.

## P2 - `Reportes Historicos` Restores Batches From Bootstrap

Evidence:

`ReportesHistoricosView` uses:

```ts
const { audits, batches, restoreBatch, currentTenant } = useDashboard();
```

Bootstrap `batches` is capped.

Impact:

- Historical restore/audit views may miss records.
- Not suitable for complete production history.

Fix:

Add backend endpoints for archived/history queries with pagination and filters.

## P2 - Manual/Local-State Modules Are Not FDB Dashboards

Modules with local/manual state:

- Inyeccion form records
- Aduana liberation records
- Config/RBAC
- Production goals
- Users/turns
- Some audit interactions

Impact:

- They can be useful workflows, but they are not authoritative FDB data.
- UI should label them as manual/configuration unless wired to real backend persistence.

Fix:

1. Add clear source labels per module:
   - `FDB`
   - `OCR`
   - `Manual`
   - `Config`
2. Persist manual records in backend tables if production needs them.
3. Avoid mixing manual records into FDB KPIs.

## P2 - OCR Service Has Separate Production Readiness Needs

Evidence:

Frontend OCR does not simulate data if service URL is missing. Good.

OCR service uses:

```py
DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_DIRECT")
```

Production risks:

- OCR auth is separate from main API auth.
- Need confirm CORS, IAM, and DB permissions.
- Need verify OCR tables migrations are applied.

Fix:

1. Add auth or signed upload token between dashboard and OCR service.
2. Add `/health` and `/version`.
3. Add deployment smoke test:

```bash
curl https://plasyect-ocr-service.../health
```

## P2 - README Is Still Generic AI Studio Text

Evidence:

README still says:

```md
# Run and deploy your AI Studio app
```

Impact:

- New production operator will not know real deploy path.
- Risk of wrong build/deploy.

Fix:

Replace README with project-specific:

- architecture
- local dev
- backend deploy
- frontend deploy
- sync-service deploy
- production smoke tests
- known data caveats

## P3 - Large Frontend Bundle

Evidence:

Build warning:

```txt
dist/assets/index-*.js 1,714.82 kB
Some chunks are larger than 500 kB
```

Impact:

- Slower first load.
- Harder browser QA.

Fix:

1. Lazy-load heavy views.
2. Split `ViewRegistry.tsx`.
3. Lazy-load PDF/export/OCR dependencies.
4. Configure manual chunks.

## P3 - `ViewRegistry.tsx` Is Too Large

Evidence:

Vite/Babel emits:

```txt
ViewRegistry.tsx exceeds max of 500KB
```

Impact:

- High regression risk.
- Hard to review.
- Hard to test.

Fix:

Split into modules:

- `DashboardEjecutivoView.tsx`
- `PipelineLoteView.tsx`
- `PipelinePedidoView.tsx`
- `ProduccionAreaView.tsx`
- `ModelosProductosView.tsx`
- `ReportesHistoricosView.tsx`
- `CatalogosView.tsx`

## Data Quality Findings

## FDB Mirror Coverage

Current mirror counts:

| Table | Rows |
|---|---:|
| `bigzap_lotes` | 37,023 |
| `bigzap_avance` | 198,820 |
| `bigzap_pedidos` | 548 |
| `bigzap_lotes_pedidos` | 37,023 |
| `bigzap_pt_movimientos` | 24,888 |
| `bigzap_estilos` | 24 |
| `bigzap_clientes` | 13 |
| `bigzap_departamentos` | 10 |
| `bigzap_subdeptos` | 6 |

## Important Data Caveats

1. `bigzap_pedidos.pares_pedidos` is `0` for all current rows.
   - Correct workaround exists: derive pairs from `bigzap_lotes_pedidos`.
2. `bigzap_pt_movimientos.calidad` only has value `1` currently.
   - Dashboard defect KPIs show zero because FDB mirror has no non-1 quality rows.
3. `stage_id` missing for 97 tarjetas.
   - Need fallback mapping by `status_depto`.
4. `sync-service` latest run is old.
   - Need Windows service health monitoring.

## Production Fix Plan

## Phase 1 - Data Correctness Blockers

1. Add complete backend aggregates to `/api/erp/operativo`:
   - `wipSummary`
   - `stagePipeline`
   - `orderRisk`
   - `orderPipeline`
2. Stop using bootstrap for global KPIs.
3. Fix `bigzap_avance` primary key to preserve every scan.
4. Re-run full Windows sync.
5. Add tests for:
   - active WIP totals
   - stage totals
   - global progress
   - risk totals
   - no-data active null behavior

## Phase 2 - Production Security

1. Disable `/api/auth/auto` in production.
2. Add real auth.
3. Restrict CORS.
4. Rotate JWT secret.
5. Audit Cloud Run IAM exposure.

## Phase 3 - Windows Server Operational Health

1. Confirm Windows service installed and auto-starting.
2. Add sync freshness warning to API and UI.
3. Add sync run alerting if last success > 30 minutes.
4. Document exact restart and log inspection commands.

## Phase 4 - Frontend Production Deploy

1. Add a real frontend deploy script.
2. Add build version artifact.
3. Verify live `t-efficiency.com` bundle after deploy.
4. Run browser QA on production domain.

## Phase 5 - Maintainability

1. Split `ViewRegistry.tsx`.
2. Add code-splitting.
3. Replace generic README.
4. Add CI workflow:
   - frontend lint/build
   - backend build/test
   - sync build
   - dependency audit

## Recommended Production Gates

Before calling this production-ready:

- [ ] Windows service sync success within last 30 minutes.
- [ ] `/api/erp/operativo` returns complete WIP aggregates.
- [ ] Dashboard no longer calculates global WIP KPIs from bootstrap.
- [ ] `/api/auth/auto` disabled in production.
- [ ] CORS restricted to real domains.
- [ ] Frontend live domain rebuilt and uploaded.
- [ ] Browser QA passes on production domain.
- [ ] `npm audit --omit=dev` resolved or build tools moved to devDependencies.
- [ ] `bigzap_avance` stores every scan, not one row per lot/dept.
- [ ] README updated for real production operations.

## Evidence Commands

Use these to re-check the production state:

```bash
npm run lint
npm run build
npm --prefix backend run build
npm --prefix backend run test
npm --prefix sync-service run build
npm --prefix sync-service run test:connection
```

Live API:

```bash
URL="https://plasyect-api-wjttlfxvua-uc.a.run.app"
TOKEN="$(curl -fsS -X POST "$URL/api/auth/auto" | jq -r .token)"

curl -fsS "$URL/health"
curl -fsS -H "Authorization: Bearer $TOKEN" "$URL/api/erp/sync/status" | jq .
curl -fsS -H "Authorization: Bearer $TOKEN" "$URL/api/erp/operativo?fechaInicio=2025-06-14&fechaFin=2026-06-14" | jq '{meta:.meta, active:.active}'
curl -fsS -H "Authorization: Bearer $TOKEN" "$URL/api/erp/operativo?fechaInicio=2026-05-01&fechaFin=2026-05-25" | jq '{meta:.meta, active:.active}'
```

Windows Server:

```powershell
nssm status PlasyectBigzapSync
nssm restart PlasyectBigzapSync
cd C:\plasyect\sync-service
node dist\index.js --once --full
notepad C:\plasyect\sync-service\logs\sync.out.log
notepad C:\plasyect\sync-service\logs\sync.err.log
```

