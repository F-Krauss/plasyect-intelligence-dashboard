import 'dotenv/config';
import pg from 'pg';

const ssl = process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 2 });

async function q(label: string, sql: string) {
  const { rows } = await pool.query(sql);
  console.log(`\n### ${label}`);
  console.table(rows);
}

async function main() {
  await q('PTMOV por movto/tipo/calidad', `
    select movto, tipo, calidad, count(*)::int as n, sum(pares)::int as pares
    from public.bigzap_pt_movimientos group by 1,2,3 order by n desc limit 20`);
  await q('PTMOV muestra reciente', `
    select movto, tipo, calidad, distingue, left(coalesce(observa,''), 40) as observa, pares
    from public.bigzap_pt_movimientos order by fecha_movimiento desc limit 10`);
  await q('Avance depto vacio - subdepto', `
    select coalesce(subdepto,'(null)') as subdepto, count(*)::int as n
    from public.bigzap_avance where depto = '' group by 1 order by 2 desc`);
  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
