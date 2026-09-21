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
FIREBIRD_DATABASE="C:\\Empresas\\BigFire\\BIGZAP.FDB"
FIREBIRD_USER="SYSDBA"
FIREBIRD_PASSWORD="REAL_PASSWORD"

DATABASE_URL="postgresql://postgres.PROJECT_REF:PASSWORD@aws-...pooler.supabase.com:5432/postgres"
PGSSL="true"

FDB_WATCH_PATH="C:\\Empresas\\BigFire\\BIGZAP.FDB"
SYNC_INTERVAL_SECONDS="900"
SYNC_OVERLAP_DAYS="2"
FULL_RESYNC_HOUR="3"
PLANT_TZ="America/Mexico_City"
```

Use the real Firebird database path, Firebird password, and Supabase/PostgreSQL
connection string.

`SYNC_INTERVAL_SECONDS="900"` publica cada 15 minutos. El watcher solo detecta
actividad del archivo para aplicar debounce; no adelanta la publicacion.

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

### Modelo de sincronizacion (espejo + incremental)

- **Espejo completo cada ciclo** (`replaceJson` = truncate+insert transaccional): `LOTCAB`→
  `bigzap_lotes`, `LOTDET`→`bigzap_lotes_pedidos`, `RENGLON`→`bigzap_programacion_renglones`,
  `OBSLOT`→`bigzap_lote_observaciones`. Sin filtros de negocio y sin watermark: la tabla es
  un espejo 1:1 de la FDB en cada corrida, asi que los lotes que salen de `LOTCAB` (graduados
  a producto terminado o purgados) desaparecen solos. Esto **corrige el WIP por etapa**
  (antes inflado ~3x) y **Alta de Pedido / Pares X Prog** (`SUM(RE_PARAPRO)`, antes recortado
  por filtrar `RE_PARPRO>0`) en el primer ciclo, sin pasos de limpieza manuales.
- **Incremental por fecha** (watermark + `SYNC_OVERLAP_DAYS`): solo los logs append-only y
  voluminosos `AVANCE`, `PTMOV`, `PTLOTCAB`. El `--full` (y el diario `FULL_RESYNC_HOUR=3`)
  re-baselinea estos releyendo toda su historia.

`replaceJson` se niega a truncar una tabla poblada si la extraccion viene vacia (protege
contra una lectura fallida de Firebird). El primer `--once` ya deja Supabase consistente.

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
select payload->'counts' from erp_sync_runs order by started_at desc limit 1;
select count(*) from bigzap_lotes;
select count(*) from bigzap_programacion_renglones;
select * from tarjetas_viajeras order by ultimo_escaneo desc nulls last limit 10;

-- WIP por etapa: debe coincidir con "Planta Productiva" de BixApp.
select status_depto, count(*) as lotes, sum(coalesce(pares,0)) as pares
from bigzap_lotes
where coalesce(cancelado,false) = false
  and coalesce(status_depto,'') in ('15','20','25','30','35','39')
group by status_depto
order by status_depto;
```

If rows appear, the sync service is working. La consulta de WIP por etapa debe
coincidir con BixApp (inyeccion=15, aduana=20/25, banda=30/35/39).

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
