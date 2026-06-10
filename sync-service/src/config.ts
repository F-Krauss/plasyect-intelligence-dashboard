import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function optionalNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (Number.isNaN(value)) throw new Error(`${name} debe ser numerico, recibido: ${raw}`);
  return value;
}

const argv = new Set(process.argv.slice(2));

export const config = {
  firebird: {
    host: process.env.FIREBIRD_HOST ?? '127.0.0.1',
    port: optionalNumber('FIREBIRD_PORT', 3050),
    database: required('FIREBIRD_DATABASE'),
    user: process.env.FIREBIRD_USER ?? 'SYSDBA',
    password: required('FIREBIRD_PASSWORD')
  },
  pg: {
    connectionString: required('DATABASE_URL'),
    ssl: (process.env.PGSSL ?? 'true') !== 'false'
  },
  plantTz: process.env.PLANT_TZ ?? 'America/Mexico_City',
  pollSeconds: optionalNumber('SYNC_INTERVAL_SECONDS', 15),
  overlapDays: optionalNumber('SYNC_OVERLAP_DAYS', 2),
  fullResyncHour: process.env.FULL_RESYNC_HOUR === '' ? null : optionalNumber('FULL_RESYNC_HOUR', 3),
  watchPath: process.env.FDB_WATCH_PATH || null,
  runOnce: argv.has('--once'),
  forceFull: argv.has('--full')
};

export type Config = typeof config;
