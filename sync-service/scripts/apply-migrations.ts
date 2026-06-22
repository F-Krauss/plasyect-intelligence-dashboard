import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import pg from 'pg';


const MIGRATIONS = [
  '../../backend/migrations/001_initial_schema.sql',
  '../../backend/migrations/002_bigzap_tarjetas.sql',
  '../../backend/migrations/003_ocr_tables.sql',
  '../../backend/migrations/004_tarjetas_viajeras_oc.sql',
  '../../backend/migrations/005_facturacion_color_combinaciones.sql',
  '../../backend/migrations/006_erp_extended_data.sql'
];

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta DATABASE_URL en el entorno (.env)');
  const ssl = (process.env.PGSSL ?? 'true') !== 'false';

  const pool = new pg.Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    max: 1,
    connectionTimeoutMillis: 15_000
  });

  try {
    for (const rel of MIGRATIONS) {
      const path = resolve(import.meta.dirname, rel);
      const sql = readFileSync(path, 'utf8');
      process.stdout.write(`Aplicando ${rel} ... `);
      await pool.query(sql);
      console.log('✅');
    }

    const { rows } = await pool.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' order by table_name`
    );
    console.log(`\nTablas en public (${rows.length}):`);
    for (const r of rows as { table_name: string }[]) console.log(`   • ${r.table_name}`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Fallo al aplicar migraciones:');
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
