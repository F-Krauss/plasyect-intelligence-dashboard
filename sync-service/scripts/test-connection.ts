import 'dotenv/config';
import pg from 'pg';

/**
 * Prueba de conexion a PostgreSQL/Supabase.
 * Usa el mismo DATABASE_URL y PGSSL que el servicio de sincronizacion.
 * Ejecutar: npx tsx scripts/test-connection.ts
 */
async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Falta DATABASE_URL en el entorno (.env)');

  const ssl = (process.env.PGSSL ?? 'true') !== 'false';
  const redactedHost = connectionString.replace(/:[^:@/]+@/, ':****@');
  console.log(`Conectando a: ${redactedHost}`);
  console.log(`SSL: ${ssl ? 'activado' : 'desactivado'}`);

  const pool = new pg.Pool({
    connectionString,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    max: 1,
    connectionTimeoutMillis: 10_000
  });

  try {
    const started = Date.now();
    const { rows } = await pool.query(
      'select current_database() as db, current_user as usr, version() as version'
    );
    const ms = Date.now() - started;
    console.log(`\n✅ Conexion exitosa (${ms} ms)`);
    console.log(`   base:    ${rows[0].db}`);
    console.log(`   usuario: ${rows[0].usr}`);
    console.log(`   version: ${String(rows[0].version).split(' ').slice(0, 2).join(' ')}`);

    // Tablas que el sync-service espera escribir.
    const expected = ['bigzap_sync_state', 'erp_sync_runs'];
    const { rows: tables } = await pool.query(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_name = any($1)`,
      [expected]
    );
    const found = new Set(tables.map((t: { table_name: string }) => t.table_name));
    console.log('\nTablas requeridas por el sync-service:');
    for (const name of expected) {
      console.log(`   ${found.has(name) ? '✅' : '⚠️ '} public.${name}${found.has(name) ? '' : ' (falta — corre las migraciones)'}`);
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Fallo la conexion:');
  console.error(`   ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
