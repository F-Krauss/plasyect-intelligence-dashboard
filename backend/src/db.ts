import pg from 'pg';
import { config } from './config.js';

// Devolver DATE (1082) y TIMESTAMPTZ (1184) como string para que el mapeo de
// tarjetas viajeras reciba 'YYYY-MM-DD' / ISO y no objetos Date con desfase TZ.
pg.types.setTypeParser(1082, (value) => value);
pg.types.setTypeParser(1184, (value) => value);

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: config.DATABASE_URL,
      ssl: config.PGSSL !== 'false' ? { rejectUnauthorized: false } : undefined,
      max: 5,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000
    });
    pool.on('error', (error) => console.error('pg pool error', error));
  }
  return pool;
}
