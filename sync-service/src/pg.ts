import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.pg.connectionString,
  ssl: config.pg.ssl ? { rejectUnauthorized: false } : undefined,
  max: 3
});

export type JsonRow = Record<string, unknown>;

const CHUNK = 2000;

export async function upsertJson(
  table: string,
  columns: Array<{ name: string; type: string }>,
  conflictTarget: string,
  rows: JsonRow[],
  options: { updateColumns?: string[]; extraInsert?: { column: string; expression: string } } = {}
): Promise<number> {
  if (rows.length === 0) return 0;

  const colNames = columns.map((c) => c.name);
  const recordDef = columns.map((c) => `${c.name} ${c.type}`).join(', ');
  const insertCols = [...colNames, ...(options.extraInsert ? [options.extraInsert.column] : []), 'synced_at'];
  const selectCols = [...colNames.map((c) => `r.${c}`), ...(options.extraInsert ? [options.extraInsert.expression] : []), 'now()'];
  const updateCols = options.updateColumns ?? colNames;
  const updates = [...updateCols.map((c) => `${c} = excluded.${c}`),
    ...(options.extraInsert ? [`${options.extraInsert.column} = excluded.${options.extraInsert.column}`] : []),
    'synced_at = now()'];

  const sql = `
    insert into ${table} (${insertCols.join(', ')})
    select ${selectCols.join(', ')}
    from jsonb_to_recordset($1::jsonb) as r(${recordDef})
    on conflict (${conflictTarget}) do update set ${updates.join(', ')}
  `;

  let total = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const result = await pool.query(sql, [JSON.stringify(chunk)]);
    total += result.rowCount ?? 0;
  }
  return total;
}

export async function getSyncState(): Promise<Map<string, string>> {
  const result = await pool.query('select tabla, watermark from public.bigzap_sync_state');
  return new Map(result.rows.map((r: { tabla: string; watermark: string }) => [r.tabla, r.watermark]));
}

export async function setSyncState(tabla: string, watermark: string): Promise<void> {
  await pool.query(
    `insert into public.bigzap_sync_state (tabla, watermark, updated_at) values ($1, $2, now())
     on conflict (tabla) do update set watermark = excluded.watermark, updated_at = now()`,
    [tabla, watermark]
  );
}

export async function recordSyncRun(run: {
  status: 'ok' | 'error';
  startedAt: Date;
  error?: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  await pool.query(
    `insert into public.erp_sync_runs (source, status, started_at, finished_at, error, payload)
     values ('big_zap_fdb', $1, $2, now(), $3, $4::jsonb)`,
    [run.status, run.startedAt.toISOString(), run.error ?? null, JSON.stringify(run.payload)]
  );
}
