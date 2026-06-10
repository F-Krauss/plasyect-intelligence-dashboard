# Despliegue Plasyect — Runbook end-to-end

Este documento deja el sistema listo de modo que **el único paso que se ejecuta en el
Windows Server es instalar el servicio de sincronización**. El resto (Supabase, backend y
frontend) se prepara una sola vez desde cualquier equipo con acceso a internet.

## Arquitectura

```
                 Windows Server 2022 (planta)
   ┌───────────────────────────────────────────────┐
   │  BixApp  ──▶  BIGZAP.FDB (Firebird 3, :3050)    │
   │                     │ SELECT read-only          │
   │            sync-service (servicio Windows)      │
   └─────────────────────┼─────────────────────────-┘
                         │ upsert (tablas bigzap_*)
                         ▼
                  Supabase (PostgreSQL)
                         ▲ REST (service_role)
                         │
              backend plasyect-api (Cloud Run)
                         ▲ HTTPS (JWT)
                         │
              frontend (Vite build, Hostinger)
```

- **Tarjetas viajeras = lotes.** El detalle del esquema Firebird está en
  [`docs/bigzap-fdb-schema.md`](docs/bigzap-fdb-schema.md).
- El backend mapea las tarjetas viajeras reales al shape que ya consume el dashboard
  (`/api/bootstrap` → `batches`/`orders`), así que **el frontend funciona con datos reales
  sin cambios de UI**. Si el sync aún no ha corrido, cae a datos de ejemplo automáticamente.

---

## Paso 1 — Supabase (una vez)

1. Crear el proyecto (o usar el existente). Obtener:
   - **Project URL** y **service_role key** (Settings → API) → para el backend.
   - **Connection string** (Settings → Database → Connection string / pooler) → para migrar y
     para el sync-service.
2. Aplicar el esquema del dashboard (idempotente):
   ```bash
   cd sync-service
   cp .env.example .env          # editar DATABASE_URL (+ PGSSL=true)
   npm ci
   npm run migrate               # aplica backend/migrations/001 y 002
   ```
   Crea las tablas `public.*` del dashboard y las `bigzap_*` + la vista `tarjetas_viajeras`.

> Las migraciones viven en [`backend/migrations`](backend/migrations); `npm run migrate` las
> aplica en orden. Se puede correr desde tu Mac o desde el propio servidor.

## Paso 2 — Backend API (Cloud Run, una vez)

El backend se conecta a Supabase por **Postgres directo (`DATABASE_URL`)** — el mismo
credential que el sync-service, sin service_role key. El script guarda `DATABASE_URL` como
secreto de Google y reutiliza el `JWT_SECRET` existente si ya está creado.

```bash
cd backend
export DATABASE_URL="postgresql://postgres.REF:PASS@aws-1-REGION.pooler.supabase.com:6543/postgres"
export GCP_PROJECT_ID="dashboard-plasyect"
export GCP_REGION="us-central1"
export CORS_ORIGINS="*"   # o tu dominio Hostinger
# Primera vez (si no existe el secreto): export JWT_SECRET="$(openssl rand -hex 32)"
# Opcionales (default): DEFAULT_TENANT_ID, BIGZAP_BATCH_LIMIT, BIGZAP_ACTIVE_DAYS, PGSSL
npm ci && npm run build
npm run deploy   # = bash scripts/deploy-gcloud.sh
```

Al terminar, Cloud Run entrega/actualiza la URL `https://plasyect-api-xxxxx.run.app`. Verificar:

```bash
curl https://plasyect-api-xxxxx.run.app/health
```

> El backend degrada con elegancia: mientras las tablas `bigzap_*` estén vacías (antes de
> correr el sync en el server), sirve datos demo; en cuanto el sync llena Supabase, el mismo
> backend empieza a servir tarjetas viajeras reales **sin redeploy**.

## Paso 3 — Frontend (Hostinger, una vez)

`VITE_API_BASE_URL` debe estar presente **en build time** (si falta, el dashboard usa datos
mock y no llama al backend). Ya quedó en `.env.local`:

```bash
# en la raíz del repo
cat .env.local   # VITE_API_BASE_URL="https://plasyect-api-wjttlfxvua-uc.a.run.app"
npm ci && npm run build
# subir el contenido de dist/ a Hostinger (o el hosting estático que uses)
```

El dashboard ya consume `/api/bootstrap`; en cuanto el sync llene Supabase, el pipeline por
lote mostrará tarjetas viajeras reales (modelo, pares, etapa, zona previa/actual, último
escaneo, cliente).

---

## Paso 4 — ⭐ Servicio en el Windows Server (lo único que queda)

En el servidor que tiene BixApp / `BIGZAP.FDB`:

1. **Requisitos**: Node.js LTS, [NSSM](https://nssm.cc/download), y que Firebird acepte
   conexiones TCP en `:3050`. Importante: en `firebird.conf` debe estar
   `WireCrypt = Enabled` (no `Required`) — el cliente Node no soporta cifrado de cable.
2. Copiar el repo (o al menos `sync-service/` + `backend/migrations/`) al servidor, p. ej.
   `C:\plasyect`.
3. Configurar y arrancar:
   ```powershell
   cd C:\plasyect\sync-service
   copy .env.example .env
   notepad .env      # FIREBIRD_* (ruta local del FDB), DATABASE_URL, FDB_WATCH_PATH
   npm ci
   npm run build
   node dist\index.js --once        # primera corrida: backfill completo a Supabase
   powershell -ExecutionPolicy Bypass -File scripts\install-service.ps1
   ```

Detalles, troubleshooting y modos de ejecución: [`sync-service/README.md`](sync-service/README.md).

---

## Verificación final

```sql
-- En Supabase (SQL editor)
select * from erp_sync_runs order by started_at desc limit 3;     -- corridas del sync
select count(*) from bigzap_lotes;                                -- lotes sincronizados
select tarjeta, estilo_nombre, stage_id, zona_previa_nombre,
       zona_actual_nombre, cliente_nombre, ultimo_escaneo
from tarjetas_viajeras order by ultimo_escaneo desc nulls last limit 10;
```

```bash
# Backend ya sirviendo datos reales
curl -s -X POST https://plasyect-api-xxxxx.run.app/api/auth/auto | jq -r .token   # TOKEN
curl -s https://plasyect-api-xxxxx.run.app/api/erp/sync/status -H "Authorization: Bearer TOKEN"
```

Abrir el dashboard en Hostinger → **Pipeline por lote**: deben verse las tarjetas viajeras
reales. Listo.

## Operación continua

- El servicio reenvía novedades cada `SYNC_INTERVAL_SECONDS` (15 s) y de inmediato cuando
  BixApp escribe el `.FDB` (watcher de `mtime`). Refresco completo diario a las 3 am.
- Logs del servicio: `sync-service\logs\`. Reinicio: `nssm restart PlasyectBigzapSync`.
- Nunca se modifica `BIGZAP.FDB`: el sync solo hace `SELECT` en transacciones de solo lectura.
