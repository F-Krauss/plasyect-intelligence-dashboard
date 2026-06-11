/**
 * Verificacion de calidad de datos sincronizados desde BIGZAP.FDB.
 * Uso: npx tsx scripts/verify-data.ts
 */
import 'dotenv/config';
import pg from 'pg';

const ssl = process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined;
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 2 });

async function q(label: string, sql: string) {
  try {
    const { rows } = await pool.query(sql);
    console.log(`\n### ${label}`);
    console.table(rows);
  } catch (error) {
    console.log(`\n### ${label} -> ERROR: ${(error as Error).message}`);
  }
}

async function main() {
  await q('Conteos por tabla', `
    select 'bigzap_lotes' as tabla, count(*)::int as filas from public.bigzap_lotes
    union all select 'bigzap_avance', count(*)::int from public.bigzap_avance
    union all select 'bigzap_pedidos', count(*)::int from public.bigzap_pedidos
    union all select 'bigzap_lotes_pedidos', count(*)::int from public.bigzap_lotes_pedidos
    union all select 'bigzap_pt_movimientos', count(*)::int from public.bigzap_pt_movimientos
    union all select 'bigzap_estilos', count(*)::int from public.bigzap_estilos
    union all select 'bigzap_clientes', count(*)::int from public.bigzap_clientes
    union all select 'bigzap_departamentos', count(*)::int from public.bigzap_departamentos
    union all select 'bigzap_subdeptos', count(*)::int from public.bigzap_subdeptos`);

  await q('Rangos de fechas', `
    select 'avance.fecha' as campo, min(fecha)::text as minimo, max(fecha)::text as maximo from public.bigzap_avance
    union all select 'lotes.fecha_programacion', min(fecha_programacion)::text, max(fecha_programacion)::text from public.bigzap_lotes
    union all select 'pedidos.fecha_pedido', min(fecha_pedido)::text, max(fecha_pedido)::text from public.bigzap_pedidos
    union all select 'ptmov.fecha_movimiento', min(fecha_movimiento)::text, max(fecha_movimiento)::text from public.bigzap_pt_movimientos`);

  await q('Vista tarjetas_viajeras (muestra + total)', `
    select count(*)::int as total_tarjetas,
           count(*) filter (where stage_id is not null)::int as con_stage,
           count(*) filter (where pedido_folio is not null)::int as con_pedido,
           count(*) filter (where cliente_nombre is not null)::int as con_cliente,
           count(*) filter (where ultimo_escaneo is not null)::int as con_escaneo,
           count(*) filter (where cancelado)::int as canceladas
    from public.tarjetas_viajeras`);

  await q('Tarjetas por etapa (stage_id)', `
    select coalesce(stage_id, '(sin etapa)') as etapa, count(*)::int as tarjetas, sum(pares)::int as pares
    from public.tarjetas_viajeras group by 1 order by 2 desc`);

  await q('Avance por depto (produccion horaria - fuente del dashboard)', `
    select depto, count(*)::int as escaneos,
           count(*) filter (where escaneado_at is not null)::int as con_timestamp,
           min(fecha)::text as desde, max(fecha)::text as hasta
    from public.bigzap_avance group by depto order by depto`);

  await q('PTMOV calidades (fuente de KPIs de calidad)', `
    select calidad, count(*)::int as movimientos, sum(pares)::int as pares,
           min(fecha_movimiento)::text as desde, max(fecha_movimiento)::text as hasta
    from public.bigzap_pt_movimientos group by calidad order by calidad`);

  await q('Pedidos: cobertura de campos', `
    select count(*)::int as total,
           count(*) filter (where fecha_pedido is not null)::int as con_fecha,
           count(*) filter (where fecha_salida is not null)::int as con_salida,
           count(*) filter (where pares_pedidos > 0)::int as con_pares_header,
           count(cliente)::int as con_cliente
    from public.bigzap_pedidos`);

  await q('Ultima corrida del sync', `
    select status, started_at::text, payload->>'mode' as modo, payload->'counts' as counts
    from public.erp_sync_runs order by started_at desc limit 3`);

  await pool.end();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
