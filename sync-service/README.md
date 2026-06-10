# plasyect-bigzap-sync

Servicio que **publica las tarjetas viajeras de BixApp** (base Firebird `BIGZAP.FDB`) hacia la
base PostgreSQL/Supabase del dashboard, **sin modificar la base original**: solo ejecuta
`SELECT` dentro de transacciones de solo lectura, igual que los reportes del propio ERP.

Esquema y semántica de las tablas Firebird: ver [`docs/bigzap-fdb-schema.md`](../docs/bigzap-fdb-schema.md).

## Cómo funciona

```
BixApp ──▶ BIGZAP.FDB (Firebird 3, puerto 3050)
                 │  SELECT read-only (LOTCAB, AVANCE, LOTDET, PEDIDOS, PTMOV, catálogos)
                 ▼
        plasyect-bigzap-sync  ──▶  upsert ──▶  PostgreSQL/Supabase (tablas bigzap_*)
        · cada SYNC_INTERVAL_SECONDS (15 s)            │
        · + watcher de mtime del FDB (al instante)     ▼
        · + refresco completo diario (3 am)      vista tarjetas_viajeras → API → dashboard
```

- **Incremental**: usa watermarks por fecha (`AVANCE.AV_FECHA`, `PTMOV.PT_FECMOV`,
  `LOTCAB.LC_FECPRO/LC_FECCAN`) guardados en `bigzap_sync_state`, con 2 días de traslape.
  Los upserts son idempotentes (`ON CONFLICT ... DO UPDATE`), así que releer no duplica.
- **"Publicar en cada actualización"**: si `FDB_WATCH_PATH` apunta al archivo FDB local, el
  servicio observa su `mtime` (sin abrirlo) y dispara un ciclo en cuanto BixApp escribe.
- **Detección de lotes movidos**: cada escaneo nuevo en `AVANCE` re-sincroniza también su fila
  de `LOTCAB` (status/cancelación), aunque el lote sea viejo.
- Cada corrida queda registrada en `erp_sync_runs` (status, duración, conteos).

## Requisitos previos

1. **PostgreSQL destino** con las migraciones aplicadas. Con el `.env` configurado:
   ```bash
   npm ci
   npm run migrate    # aplica backend/migrations/001 y 002 a DATABASE_URL
   ```
   (alternativa manual en Supabase: SQL Editor → pegar y ejecutar ambos archivos).
2. **Acceso a Firebird**: el servidor BixApp expone el puerto 3050 (local). Usuario `SYSDBA`
   o el usuario de reportes de BixApp. *No se requiere ningún cambio en la base.*
3. **Node.js LTS** (≥ 18) en el Windows Server.
4. Salida a internet desde el servidor hacia Supabase (puerto 5432 del pooler o 443).

## Instalación en el Windows Server 2022

```powershell
# 1. Copiar la carpeta sync-service al servidor, p. ej. C:\plasyect\sync-service
cd C:\plasyect\sync-service

# 2. Dependencias y build
npm ci
npm run build

# 3. Configuración
copy .env.example .env
notepad .env        # FIREBIRD_*, DATABASE_URL, FDB_WATCH_PATH

# 4. Esquema en Supabase (idempotente; omitir si ya se aplicó)
npm run migrate

# 5. Prueba manual (una sola corrida; la primera hace el backfill completo)
node dist\index.js --once

# 6. Instalar como servicio de Windows (requiere NSSM, https://nssm.cc)
powershell -ExecutionPolicy Bypass -File scripts\install-service.ps1
```

Comandos útiles del servicio: `nssm restart PlasyectBigzapSync`, `nssm stop ...`,
logs en `sync-service\logs\`.

### Alternativa sin NSSM
Programador de tareas de Windows: tarea "Al iniciar el sistema", acción
`node C:\plasyect\sync-service\dist\index.js`, con reinicio en caso de falla.

## Modos de ejecución

| Comando | Efecto |
|---|---|
| `node dist/index.js` | Loop continuo (servicio) |
| `node dist/index.js --once` | Una corrida y termina (para pruebas/cron) |
| `node dist/index.js --once --full` | Fuerza refresco completo |

## Verificación

```sql
-- En Postgres/Supabase
select * from erp_sync_runs order by started_at desc limit 5;
select count(*) from bigzap_lotes;
select * from tarjetas_viajeras order by ultimo_escaneo desc nulls last limit 10;
```

## Solución de problemas

- **Error de autenticación Firebird**: el servidor BixApp puede tener `AuthServer = Srp` o
  `Legacy_Auth`. `node-firebird` soporta ambos; si fallara, verificar usuario/contraseña con
  `isql` local: `isql -user SYSDBA -password *** localhost:C:\BigZap\BIGZAP.FDB`.
- **`Use of database ... is not allowed`**: en `firebird.conf` del servidor,
  `DatabaseAccess` restringe rutas; usar la misma ruta/alias que usa BixApp.
- **TLS a Supabase**: si la red corporativa intercepta TLS, dejar `PGSSL=true` (el servicio
  acepta el certificado del pooler). Para pruebas con Postgres local: `PGSSL=false`.
- **Primera corrida lenta**: el backfill inicial mueve ~200k escaneos + 37k lotes; las
  siguientes corridas solo traen lo nuevo (segundos).
