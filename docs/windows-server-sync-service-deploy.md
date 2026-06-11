# Windows Server Sync Service Deploy Guide

This guide deploys the `sync-service` on the Windows Server that has BixApp and
`BIGZAP.FDB`. The service reads Firebird in read-only mode and syncs data to
Supabase/PostgreSQL.

## 1. Connect To Server

1. Start Drytec VPN.
2. Connect to the Windows Server with Remote Desktop.
3. Open PowerShell as Administrator.

## 2. Install Requirements

Install:

- Node.js LTS: <https://nodejs.org>
- NSSM: <https://nssm.cc/download>

Put NSSM at:

```powershell
C:\nssm\nssm.exe
```

Check installs:

```powershell
node -v
npm -v
C:\nssm\nssm.exe version
```

## 3. Copy Project Files

Copy the project to:

```powershell
C:\plasyect
```

At minimum, the server needs:

```text
C:\plasyect\sync-service
C:\plasyect\backend\migrations
```

## 4. Configure Environment

```powershell
cd C:\plasyect\sync-service
copy .env.example .env
notepad .env
```

Set the real values:

```env
FIREBIRD_HOST="127.0.0.1"
FIREBIRD_PORT="3050"
FIREBIRD_DATABASE="C:\\BigZap\\BIGZAP.FDB"
FIREBIRD_USER="SYSDBA"
FIREBIRD_PASSWORD="REAL_PASSWORD"

DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-...pooler.supabase.com:5432/postgres"
PGSSL="true"

FDB_WATCH_PATH="C:\\BigZap\\BIGZAP.FDB"
SYNC_INTERVAL_SECONDS="15"
FULL_RESYNC_HOUR="3"
PLANT_TZ="America/Mexico_City"
```

Use the real Firebird database path, Firebird password, and Supabase/PostgreSQL
connection string.

## 5. Install And Build

```powershell
cd C:\plasyect\sync-service
npm ci
npm run build
```

## 6. Apply Database Migrations

Skip this if migrations were already applied.

```powershell
npm run migrate
```

## 7. Test One Sync

Run one normal sync:

```powershell
node dist\index.js --once
```

For first full backfill:

```powershell
node dist\index.js --once --full
```

If the command exits without crashing, continue.

## 8. Install Windows Service

```powershell
powershell -ExecutionPolicy Bypass -File scripts\install-service.ps1
```

Service name:

```text
PlasyectBigzapSync
```

## 9. Manage Service

Check status:

```powershell
nssm status PlasyectBigzapSync
```

Restart:

```powershell
nssm restart PlasyectBigzapSync
```

Stop:

```powershell
nssm stop PlasyectBigzapSync
```

View logs:

```powershell
notepad C:\plasyect\sync-service\logs\sync.out.log
notepad C:\plasyect\sync-service\logs\sync.err.log
```

## 10. Verify In Supabase

Run:

```sql
select * from erp_sync_runs order by started_at desc limit 5;
select count(*) from bigzap_lotes;
select * from tarjetas_viajeras order by ultimo_escaneo desc nulls last limit 10;
```

If rows appear, the sync service is working.

## Troubleshooting

If Firebird connection fails, confirm Firebird is accepting TCP on port `3050`.

If Firebird has:

```text
WireCrypt = Required
```

change it to:

```text
WireCrypt = Enabled
```

Then restart Firebird.

If Supabase connection fails, confirm:

- `DATABASE_URL` is correct.
- Server has internet access.
- `PGSSL="true"` is set.
- Supabase allows the connection.
