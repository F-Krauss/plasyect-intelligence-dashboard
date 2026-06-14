import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, hasDatabaseUrl, hasSupabaseConfig } from './config.js';
import { getPool } from './db.js';

/**
 * Acceso a los datos de BixApp (tarjetas viajeras) sincronizados por
 * sync-service/ hacia las tablas bigzap_* y la vista tarjetas_viajeras.
 * Via preferida: Postgres directo (DATABASE_URL). El backend nunca habla con
 * Firebird directamente.
 */

export type ErpRecord = Record<string, unknown>;

export interface TarjetaDetalle {
  tarjeta: ErpRecord;
  movimientos: ErpRecord[];
  pedidos: ErpRecord[];
}

export interface ListTarjetasOptions {
  limit: number;
  status?: string;
  stage?: string;
}

export interface HourlyProductionRow {
  id?: string;
  tarjetaViajera?: string;
  area: string;
  fecha: string;
  hora: string;
  turno: string;
  metaHora: number;
  produccionReal: number;
  eficiencia: number;
  modelo: string;
  color: string;
  responsable: string;
}

export interface CalidadRow {
  fecha: string;
  turno: string;
  area: string;
  lote: string;
  modelo: string;
  color: string;
  totalInspeccionado: number;
  primeras: number;
  segundas: number;
  reproceso: number;
  merma: number;
  defecto: string;
  cantidadDefecto: number;
  porcentajeDefectivo: number;
}

export interface EjecutivoData {
  produccion: HourlyProductionRow[];
  calidad: CalidadRow[];
}

export interface DailyProductionRow {
  fecha: string;
  pares: number;
  tarjetas: number;
}

export interface ModelPerformanceRow {
  id: string;
  tenantId: string;
  modeloId: string;
  modeloName: string;
  color: string;
  cliente: string;
  fecha: string;
  paresProducidos: number;
  paresDefectuosos: number;
  paresSegundas: number;
  paresReprocesos: number;
  leadTimeHours: number;
  tiempoInyeccionMins: number;
  tiempoEstabilizacionMins: number;
  tiempoBandaMins: number;
  entregaCumplida: boolean;
  etapaActiva: 'Inyección' | 'Estabilización' | 'Aduana' | 'Banda' | 'Embarque' | 'Almacén';
  estatus: 'Active' | 'Warning' | 'Critical';
}

export interface ErpCatalogs {
  clients: ErpRecord[];
  models: ErpRecord[];
  departments: ErpRecord[];
}

export type DeliveryRisk = 'VENCIDO' | 'ALTO' | 'MEDIO' | 'BAJO';
export type StageSaturation = 'OPTIMO' | 'SATURADO' | 'CRITICO';

export interface WipSummary {
  activeBatches: number;
  activePairs: number;
  globalProgress: number;
}

export interface StagePipelineRow {
  stageId: string;
  stageName: string;
  batches: number;
  pairs: number;
  avgMinutes: number | null;
  wipPct: number;
  saturation: StageSaturation;
}

export interface OrderPipelineRow {
  id: string;
  cliente: string;
  oc: string | null;
  modelo: string | null;
  color: string | null;
  fechaAlta: string | null;
  fechaCompromiso: string | null;
  totalPares: number;
  shippedPairs: number;
  inProcessPairs: number;
  progress: number;
  avgTimeMin: number | null;
  dominantStage: string;
  risk: DeliveryRisk;
  pairsByStage: Record<string, number>;
  batchesCount: number;
  daysLeft: number | null;
}

export interface OrderRiskSummary {
  totalOpen: number;
  totalRisk: number;
  vencido: number;
  alto: number;
  medio: number;
  bajo: number;
  rows: OrderPipelineRow[];
}

export interface ErpOperationalResponse {
  meta: {
    fechaInicio: string;
    fechaFin: string;
    hasPeriodData: boolean;
    dataMaxDate: string | null;
    lastSync: string | null;
    source: 'big_zap_fdb';
  };
  active: {
    orders: number | null;
    batches: number | null;
    pairs: number | null;
  };
  productionHourly: HourlyProductionRow[];
  quality: CalidadRow[];
  movements: MovimientoRow[];
  models: ModelPerformanceRow[];
  catalogs: ErpCatalogs;
  dailyProduction: DailyProductionRow[];
  wipSummary: WipSummary;
  stagePipeline: StagePipelineRow[];
  orderRisk: OrderRiskSummary;
  orderPipeline: OrderPipelineRow[];
}

/** Un movimiento = un escaneo de tarjeta viajera (AVANCE). La entrada es el
 * escaneo de esta etapa; la salida es el siguiente escaneo del mismo lote. */
export interface MovimientoRow {
  idMovimiento: string;
  idLote: string;
  etapa: string;
  fechaEntrada: string;
  fechaSalida: string | null;
  pares: number;
  usuarioEscaneo: string;
  duracionMinutos: number;
}

export interface ErpService {
  readonly enabled: boolean;
  listTarjetas(options: ListTarjetasOptions): Promise<ErpRecord[]>;
  getTarjeta(id: string): Promise<TarjetaDetalle | null>;
  getSyncStatus(): Promise<ErpRecord | null>;
  getEjecutivoDashboard(fechaInicio: string, fechaFin: string): Promise<EjecutivoData>;
  getMovimientos(fechaInicio: string, fechaFin: string, limit: number): Promise<MovimientoRow[]>;
  getOperational(fechaInicio: string, fechaFin: string): Promise<ErpOperationalResponse>;
}

export function getTarjetaViajeraStub(id: string) {
  return {
    id,
    source: 'big_zap_fdb',
    status: 'unavailable',
    configured: hasDatabaseUrl || hasSupabaseConfig,
    message: 'Sin conexion a Supabase: los datos de tarjetas viajeras llegan via sync-service a las tablas bigzap_*.'
  };
}

/** id de tarjeta = "PROGRAMA-LOTE", p. ej. "5498-40638" */
export function parseTarjetaId(id: string): { programa: number; lote: number } | null {
  const match = /^(\d{1,9})-(\d{1,9})$/.exec(id.trim());
  if (!match) return null;
  return { programa: Number(match[1]), lote: Number(match[2]) };
}

/** pg devuelve Date para timestamptz; Supabase devuelve string ISO. Normaliza a ISO. */
function toIsoOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const d = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function toDateString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function stageFromDepto(depto: unknown): ModelPerformanceRow['etapaActiva'] {
  switch (String(depto ?? '').trim()) {
    case '10': return 'Almacén';
    case '15': return 'Inyección';
    case '20':
    case '25': return 'Aduana';
    case '30':
    case '35':
    case '39': return 'Banda';
    case '40':
    case '50': return 'Embarque';
    default: return 'Estabilización';
  }
}

function statusFromModelRow(row: ErpRecord): ModelPerformanceRow['estatus'] {
  const defectRate = Number(row.pares_producidos ?? 0) > 0
    ? Number(row.pares_defectuosos ?? 0) / Number(row.pares_producidos ?? 0)
    : 0;
  if (defectRate > 0.05) return 'Critical';
  if (defectRate > 0.02 || Number(row.entregas_cumplidas ?? 0) < Number(row.lotes ?? 0)) return 'Warning';
  return 'Active';
}

const STAGE_WEIGHTS: Record<string, number> = {
  alta_pedido: 14,
  almacen: 29,
  inyeccion: 43,
  estabilizacion: 57,
  aduana: 71,
  banda: 86,
  embarque: 100
};

const STAGE_NAMES: Record<string, string> = {
  alta_pedido: 'Alta Pedido',
  almacen: 'Almacén',
  inyeccion: 'Inyección',
  estabilizacion: 'Estabilización',
  aduana: 'Aduana',
  banda: 'Banda',
  embarque: 'Embarque'
};

const EMPTY_STAGE_PAIRS: Record<string, number> = Object.fromEntries(
  Object.keys(STAGE_WEIGHTS).map((stage) => [stage, 0])
);

function stageIdFromDepto(depto: unknown, stageId?: unknown): string {
  const explicit = String(stageId ?? '').trim();
  if (explicit && STAGE_WEIGHTS[explicit] !== undefined) return explicit;
  switch (String(depto ?? '').trim()) {
    case '01': return 'alta_pedido';
    case '10': return 'almacen';
    case '15': return 'inyeccion';
    case '20':
    case '25': return 'aduana';
    case '30':
    case '35':
    case '39': return 'banda';
    case '40':
    case '50': return 'embarque';
    default: return 'alta_pedido';
  }
}

function deliveryRiskFromDays(daysLeft: number | null, delivered: boolean): DeliveryRisk {
  if (delivered || daysLeft === null) return 'BAJO';
  if (daysLeft < 0) return 'VENCIDO';
  if (daysLeft <= 3) return 'ALTO';
  if (daysLeft <= 7) return 'MEDIO';
  return 'BAJO';
}

function saturationFor(batches: number, avgMinutes: number | null): StageSaturation {
  const minutes = avgMinutes ?? 0;
  if (batches >= 8 || minutes > 2500) return 'CRITICO';
  if (batches >= 4 || minutes > 1000) return 'SATURADO';
  return 'OPTIMO';
}

function normalizeStagePairs(value: unknown): Record<string, number> {
  const out = { ...EMPTY_STAGE_PAIRS };
  if (value && typeof value === 'object') {
    for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
      if (out[key] !== undefined) out[key] = Number(raw ?? 0);
    }
  }
  return out;
}

function summarizeOrderRisk(rows: OrderPipelineRow[]): OrderRiskSummary {
  const totalOpen = rows.filter((row) => row.progress < 100).length;
  const vencido = rows.filter((row) => row.progress < 100 && row.risk === 'VENCIDO').length;
  const alto = rows.filter((row) => row.progress < 100 && row.risk === 'ALTO').length;
  const medio = rows.filter((row) => row.progress < 100 && row.risk === 'MEDIO').length;
  const bajo = rows.filter((row) => row.progress < 100 && row.risk === 'BAJO').length;
  return { totalOpen, totalRisk: vencido + alto, vencido, alto, medio, bajo, rows };
}

function daysLeftFromDate(value: unknown, today = new Date()): number | null {
  if (!value) return null;
  const due = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
  if (Number.isNaN(due.getTime())) return null;
  const base = new Date(today.toISOString().slice(0, 10) + 'T12:00:00Z');
  return Math.ceil((due.getTime() - base.getTime()) / 86_400_000);
}

function buildOperationalSummariesFromTarjetas(tarjetas: ErpRecord[]): {
  wipSummary: WipSummary;
  stagePipeline: StagePipelineRow[];
  orderPipeline: OrderPipelineRow[];
  orderRisk: OrderRiskSummary;
} {
  const active = tarjetas.filter((row) =>
    row.cancelado !== true && !['40', '50'].includes(String(row.status_depto ?? ''))
  );
  const stageMap = new Map<string, { batches: number; pairs: number; minutesTotal: number; minutesCount: number }>();
  for (const row of active) {
    const stageId = stageIdFromDepto(row.status_depto, row.stage_id);
    const current = stageMap.get(stageId) ?? { batches: 0, pairs: 0, minutesTotal: 0, minutesCount: 0 };
    current.batches += 1;
    current.pairs += Number(row.pares ?? 0);
    const lastScan = toIsoOrNull(row.ultimo_escaneo);
    if (lastScan) {
      current.minutesTotal += Math.max(0, Math.round((Date.now() - new Date(lastScan).getTime()) / 60000));
      current.minutesCount += 1;
    }
    stageMap.set(stageId, current);
  }

  const activePairs = active.reduce((sum, row) => sum + Number(row.pares ?? 0), 0);
  const stagePipeline = Object.entries(STAGE_WEIGHTS)
    .map(([stageId]) => {
      const row = stageMap.get(stageId) ?? { batches: 0, pairs: 0, minutesTotal: 0, minutesCount: 0 };
      const avgMinutes = row.minutesCount > 0 ? Math.round(row.minutesTotal / row.minutesCount) : null;
      return {
        stageId,
        stageName: STAGE_NAMES[stageId] ?? stageId,
        batches: row.batches,
        pairs: row.pairs,
        avgMinutes,
        wipPct: activePairs > 0 ? Number(((row.pairs / activePairs) * 100).toFixed(1)) : 0,
        saturation: saturationFor(row.batches, avgMinutes)
      };
    })
    .filter((row) => row.batches > 0 || row.pairs > 0);

  const weightedProgressSum = stagePipeline.reduce((sum, row) => sum + row.pairs * (STAGE_WEIGHTS[row.stageId] ?? 14), 0);
  const wipSummary = {
    activeBatches: active.length,
    activePairs,
    globalProgress: activePairs > 0 ? Math.round(weightedProgressSum / activePairs) : 0
  };

  const orderMap = new Map<string, OrderPipelineRow & { weighted: number; timeTotal: number; timeCount: number }>();
  for (const row of tarjetas) {
    if (row.cancelado === true || row.pedido_folio == null) continue;
    const id = `PED-${String(row.pedido_folio)}`;
    const stageId = stageIdFromDepto(row.status_depto, row.stage_id);
    const pairs = Number(row.pares ?? 0);
    const delivered = ['40', '50'].includes(String(row.status_depto ?? '')) || stageId === 'embarque';
    const current = orderMap.get(id) ?? {
      id,
      cliente: String(row.cliente_nombre ?? row.cliente_codigo ?? 'S/Cliente'),
      oc: row.pedido_oc == null ? null : String(row.pedido_oc),
      modelo: row.estilo_nombre == null && row.estilo == null ? null : String(row.estilo_nombre ?? row.estilo),
      color: row.piecol == null && row.combina == null ? null : String(row.piecol ?? row.combina),
      fechaAlta: row.fecha_programacion == null ? null : toDateString(row.fecha_programacion),
      fechaCompromiso: row.pedido_fecha_salida == null ? null : toDateString(row.pedido_fecha_salida),
      totalPares: 0,
      shippedPairs: 0,
      inProcessPairs: 0,
      progress: 0,
      avgTimeMin: null,
      dominantStage: 'alta_pedido',
      risk: 'BAJO',
      pairsByStage: { ...EMPTY_STAGE_PAIRS },
      batchesCount: 0,
      daysLeft: null,
      weighted: 0,
      timeTotal: 0,
      timeCount: 0
    };

    current.totalPares += pairs;
    current.shippedPairs += delivered ? pairs : 0;
    current.inProcessPairs += delivered ? 0 : pairs;
    current.weighted += pairs * (STAGE_WEIGHTS[stageId] ?? 14);
    current.pairsByStage[stageId] = (current.pairsByStage[stageId] ?? 0) + pairs;
    current.batchesCount += 1;
    const lastScan = toIsoOrNull(row.ultimo_escaneo);
    if (lastScan) {
      current.timeTotal += Math.max(0, Math.round((Date.now() - new Date(lastScan).getTime()) / 60000));
      current.timeCount += 1;
    }
    orderMap.set(id, current);
  }

  const orderPipeline = Array.from(orderMap.values()).map((row) => {
    const progress = row.totalPares > 0 ? Math.min(100, Math.round(row.weighted / row.totalPares)) : 0;
    const dominantStage = Object.entries(row.pairsByStage).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'alta_pedido';
    const daysLeft = daysLeftFromDate(row.fechaCompromiso);
    const delivered = row.totalPares > 0 && row.shippedPairs >= row.totalPares;
    const { weighted, timeTotal, timeCount, ...clean } = row;
    void weighted;
    void timeTotal;
    void timeCount;
    return {
      ...clean,
      progress,
      avgTimeMin: row.timeCount > 0 ? Math.round(row.timeTotal / row.timeCount) : null,
      dominantStage,
      daysLeft,
      risk: deliveryRiskFromDays(daysLeft, delivered)
    };
  }).sort((a, b) => {
    if (a.fechaCompromiso && b.fechaCompromiso) return a.fechaCompromiso.localeCompare(b.fechaCompromiso);
    if (a.fechaCompromiso) return -1;
    if (b.fechaCompromiso) return 1;
    return a.id.localeCompare(b.id);
  });

  return { wipSummary, stagePipeline, orderPipeline, orderRisk: summarizeOrderRisk(orderPipeline) };
}

/** Lee tarjetas viajeras por Postgres directo (DATABASE_URL). Via preferida. */
class PgErpService implements ErpService {
  readonly enabled = true;

  private get pool() {
    return getPool();
  }

  async listTarjetas(options: ListTarjetasOptions): Promise<ErpRecord[]> {
    const where: string[] = [];
    const params: unknown[] = [];
    if (options.status) {
      params.push(options.status);
      where.push(`status_depto = $${params.length}`);
    }
    if (options.stage) {
      params.push(options.stage);
      where.push(`stage_id = $${params.length}`);
    }
    params.push(options.limit);
    const sql = `select * from public.tarjetas_viajeras
      ${where.length ? 'where ' + where.join(' and ') : ''}
      order by ultimo_escaneo desc nulls last
      limit $${params.length}`;
    const { rows } = await this.pool.query<ErpRecord>(sql, params);
    return rows;
  }

  async getTarjeta(id: string): Promise<TarjetaDetalle | null> {
    const parsed = parseTarjetaId(id);
    if (!parsed) return null;
    const tarjeta = await this.pool.query<ErpRecord>(
      'select * from public.tarjetas_viajeras where programa = $1 and lote = $2 limit 1',
      [parsed.programa, parsed.lote]
    );
    if (tarjeta.rows.length === 0) return null;

    const [movimientos, pedidos] = await Promise.all([
      this.pool.query<ErpRecord>(
        `select programa, lote, depto, fecha, hora_cs, escaneado_at, gen_por, subdepto
         from public.bigzap_avance where programa = $1 and lote = $2 order by escaneado_at asc`,
        [parsed.programa, parsed.lote]
      ),
      this.pool.query<ErpRecord>(
        `select pedido, renglon, cliente, corrida, pares
         from public.bigzap_lotes_pedidos where programa = $1 and lote = $2`,
        [parsed.programa, parsed.lote]
      )
    ]);

    return { tarjeta: tarjeta.rows[0], movimientos: movimientos.rows, pedidos: pedidos.rows };
  }

  async getSyncStatus(): Promise<ErpRecord | null> {
    const { rows } = await this.pool.query<ErpRecord>(
      'select * from public.erp_sync_runs order by started_at desc limit 1'
    );
    return rows[0] ?? null;
  }

  async getEjecutivoDashboard(fechaInicio: string, fechaFin: string): Promise<EjecutivoData> {
    const [prodRows, calidadRows] = await Promise.all([
      this.pool.query<ErpRecord>(
        `with stage_def as (
           select * from (values
             ('10', 'ALMACEN', 1::numeric, 500),
             ('15', 'INYECCION', 2::numeric, 550),
             ('20', 'ADUANA', 3::numeric, 500),
             ('25', 'ADUANA', 3::numeric, 500),
             ('30', 'BANDA', 4::numeric, 620),
             ('35', 'BANDA', 4::numeric, 620),
             ('39', 'SALIDAS DE TERCERA', 4.5::numeric, 500),
             ('40', 'EMBARQUE', 5::numeric, 500),
             ('50', 'ENTREGAS', 6::numeric, 500)
           ) as s(depto, area, orden, meta_hora)
         ),
         area_def as (
           select distinct area, orden, meta_hora from stage_def
         ),
         scans as (
           select
             a.programa,
             a.lote,
             a.depto,
             sd.area,
             sd.orden,
             sd.meta_hora,
             a.escaneado_at,
             lead(sd.orden) over (partition by a.programa, a.lote order by a.escaneado_at) as next_orden,
             lead(a.escaneado_at) over (partition by a.programa, a.lote order by a.escaneado_at) as next_scan_at
           from public.bigzap_avance a
           join stage_def sd on sd.depto = a.depto
           where a.escaneado_at is not null
         ),
         exact_completed as (
           select
             s.programa,
             s.lote,
             s.area,
             s.orden,
             s.meta_hora,
             case when s.depto = '50' then s.escaneado_at else s.next_scan_at end as event_at
           from scans s
           where (s.next_scan_at is not null and s.next_orden > s.orden)
              or s.depto = '50'
         ),
         current_lotes as (
           select
             l.programa,
             l.lote,
             l.pares,
             l.estilo,
             l.piecol,
             l.combina,
             l.fecha_programacion,
             l.status_depto,
             sd.orden as current_orden,
             tv.ultimo_escaneo
           from public.bigzap_lotes l
           left join stage_def sd on sd.depto = l.status_depto
           left join public.tarjetas_viajeras tv on tv.programa = l.programa and tv.lote = l.lote
           where l.cancelado = false
         ),
         inferred_completed as (
           select
             cl.programa,
             cl.lote,
             ad.area,
             ad.orden,
             ad.meta_hora,
             coalesce(cl.ultimo_escaneo, cl.fecha_programacion::timestamp at time zone 'UTC') as event_at
           from current_lotes cl
           join area_def ad on cl.current_orden > ad.orden and ad.area <> 'SALIDAS DE TERCERA'
           where not exists (
             select 1
             from exact_completed ec
             where ec.programa = cl.programa
               and ec.lote = cl.lote
               and ec.area = ad.area
           )
         ),
         completed as (
           select * from exact_completed
           union all
           select * from inferred_completed
         )
         SELECT
           c.area,
           c.event_at::date::text AS fecha,
           lpad(extract(hour from c.event_at)::int::text, 2, '0') || ':00' AS hora,
           CASE
             WHEN extract(hour from c.event_at) >= 7 AND extract(hour from c.event_at) < 15 THEN '1'
             WHEN extract(hour from c.event_at) >= 15 AND extract(hour from c.event_at) < 23 THEN '2'
             ELSE '3'
           END AS turno,
           c.meta_hora,
           COALESCE(SUM(l.pares), 0)::int AS produccion_real,
           COALESCE(e.nombre, l.estilo, 'Varios') AS modelo,
           COALESCE(l.piecol, l.combina, 'N/D') AS color
         FROM completed c
         JOIN public.bigzap_lotes l ON l.programa = c.programa AND l.lote = c.lote
         LEFT JOIN public.bigzap_estilos e ON e.codigo = l.estilo
         WHERE c.event_at::date BETWEEN $1::date AND $2::date
         GROUP BY c.area, c.event_at::date, extract(hour from c.event_at), c.meta_hora, e.nombre, l.estilo, l.piecol, l.combina
         ORDER BY fecha, area, hora`,
        [fechaInicio, fechaFin]
      ),
      this.pool.query<ErpRecord>(
        `SELECT
           m.fecha_movimiento::text AS fecha,
           '1' AS turno,
           CASE
             WHEN l.status_depto IN ('15') THEN 'INYECCION'
             WHEN l.status_depto IN ('30','35','39') THEN 'BANDA'
             ELSE 'INYECCION'
           END AS area,
           m.programa::text || '-' || m.lote::text AS lote,
           COALESCE(e.nombre, l.estilo, 'S/Modelo') AS modelo,
           COALESCE(l.piecol, l.combina, 'N/D') AS color,
           SUM(m.pares)::int AS total_inspeccionado,
           SUM(CASE WHEN m.calidad = 1 THEN m.pares ELSE 0 END)::int AS primeras,
           SUM(CASE WHEN m.calidad = 2 THEN m.pares ELSE 0 END)::int AS segundas,
           SUM(CASE WHEN m.calidad = 3 THEN m.pares ELSE 0 END)::int AS merma,
           SUM(CASE WHEN m.calidad IN (2,3) THEN m.pares ELSE 0 END)::int AS reproceso,
           'Defecto Calidad' AS defecto,
           SUM(CASE WHEN m.calidad IN (2,3) THEN m.pares ELSE 0 END)::int AS cantidad_defecto,
           ROUND(
             SUM(CASE WHEN m.calidad IN (2,3) THEN m.pares ELSE 0 END)::numeric
             / NULLIF(SUM(m.pares), 0) * 100, 2
           )::float AS porcentaje_defectivo
         FROM public.bigzap_pt_movimientos m
         LEFT JOIN public.bigzap_lotes l ON l.programa = m.programa AND l.lote = m.lote
         LEFT JOIN public.bigzap_estilos e ON e.codigo = l.estilo
         WHERE m.fecha_movimiento BETWEEN $1::date AND $2::date
           AND m.pares > 0
           AND m.calidad IN (1,2,3)
         GROUP BY m.fecha_movimiento, m.programa, m.lote, e.nombre, l.estilo, l.piecol, l.combina, l.status_depto
         ORDER BY m.fecha_movimiento`,
        [fechaInicio, fechaFin]
      )
    ]);

    const produccion: HourlyProductionRow[] = prodRows.rows.map(r => ({
      area: String(r.area ?? ''),
      fecha: String(r.fecha ?? ''),
      hora: String(r.hora ?? '00:00'),
      turno: String(r.turno ?? '1'),
      metaHora: Number(r.meta_hora ?? 500),
      produccionReal: Number(r.produccion_real ?? 0),
      eficiencia: r.produccion_real && r.meta_hora
        ? Number(((Number(r.produccion_real) / Number(r.meta_hora)) * 100).toFixed(1))
        : 0,
      modelo: String(r.modelo ?? 'Varios'),
      color: String(r.color ?? 'N/D'),
      responsable: 'N/D'
    }));

    const calidad: CalidadRow[] = calidadRows.rows.map(r => ({
      fecha: String(r.fecha ?? ''),
      turno: String(r.turno ?? '1'),
      area: String(r.area ?? 'INYECCION'),
      lote: String(r.lote ?? ''),
      modelo: String(r.modelo ?? 'S/Modelo'),
      color: String(r.color ?? 'N/D'),
      totalInspeccionado: Number(r.total_inspeccionado ?? 0),
      primeras: Number(r.primeras ?? 0),
      segundas: Number(r.segundas ?? 0),
      reproceso: Number(r.reproceso ?? 0),
      merma: Number(r.merma ?? 0),
      defecto: String(r.defecto ?? 'Defecto Calidad'),
      cantidadDefecto: Number(r.cantidad_defecto ?? 0),
      porcentajeDefectivo: Number(r.porcentaje_defectivo ?? 0)
    }));

    return { produccion, calidad };
  }

  async getMovimientos(fechaInicio: string, fechaFin: string, limit: number): Promise<MovimientoRow[]> {
    const { rows } = await this.pool.query<ErpRecord>(
      `WITH mov AS (
         SELECT a.programa, a.lote, a.depto,
                a.escaneado_at AS entrada,
                lead(a.escaneado_at) OVER (PARTITION BY a.programa, a.lote ORDER BY a.escaneado_at) AS salida,
                a.gen_por AS usuario
         FROM public.bigzap_avance a
         WHERE a.escaneado_at IS NOT NULL AND a.depto <> ''
       )
       SELECT
         'MOV-' || m.programa || '-' || m.lote || '-' || m.depto AS id_movimiento,
         m.programa || '-' || m.lote AS id_lote,
         COALESCE(d.nombre, 'DEPTO-' || m.depto) AS etapa,
         m.entrada AS fecha_entrada,
         -- Etapa terminal (40 EMBARQUE / 50 FACTURACION) sin siguiente escaneo = lote
         -- cerrado: cierra en la propia entrada (no "EN PROCESO" ni falso cuello de botella).
         CASE WHEN m.salida IS NOT NULL THEN m.salida
              WHEN m.depto IN ('40', '50') THEN m.entrada
              ELSE NULL END AS fecha_salida,
         COALESCE(l.pares, 0)::int AS pares,
         COALESCE(NULLIF(btrim(m.usuario), ''), 'N/D') AS usuario,
         GREATEST(0, round(extract(epoch FROM (
           COALESCE(m.salida, CASE WHEN m.depto IN ('40', '50') THEN m.entrada ELSE now() END) - m.entrada
         )) / 60.0))::int AS duracion_min
       FROM mov m
       LEFT JOIN public.bigzap_lotes l ON l.programa = m.programa AND l.lote = m.lote
       LEFT JOIN public.bigzap_departamentos d ON d.codigo = m.depto
       WHERE m.entrada::date BETWEEN $1::date AND $2::date
       ORDER BY m.entrada DESC
       LIMIT $3`,
      [fechaInicio, fechaFin, limit]
    );
    return rows.map(r => ({
      idMovimiento: String(r.id_movimiento ?? ''),
      idLote: String(r.id_lote ?? ''),
      etapa: String(r.etapa ?? ''),
      fechaEntrada: toIsoOrNull(r.fecha_entrada) ?? '',
      fechaSalida: toIsoOrNull(r.fecha_salida),
      pares: Number(r.pares ?? 0),
      usuarioEscaneo: String(r.usuario ?? 'N/D'),
      duracionMinutos: Number(r.duracion_min ?? 0)
    }));
  }

  async getOperational(fechaInicio: string, fechaFin: string): Promise<ErpOperationalResponse> {
    const [ejecutivo, movements, sync, metaRows, activeRows, dailyRows, modelRows, clientsRows, catalogModelsRows, deptRows, stageRows, orderRows] = await Promise.all([
      this.getEjecutivoDashboard(fechaInicio, fechaFin),
      this.getMovimientos(fechaInicio, fechaFin, 500),
      this.getSyncStatus(),
      this.pool.query<ErpRecord>(
        `select
           (
             exists(select 1 from public.bigzap_avance where fecha between $1::date and $2::date)
             or exists(select 1 from public.bigzap_lotes where fecha_programacion between $1::date and $2::date)
             or exists(select 1 from public.bigzap_pt_movimientos where fecha_movimiento between $1::date and $2::date)
           ) as has_period_data,
           greatest(
             coalesce((select max(fecha) from public.bigzap_avance), date '1900-01-01'),
             coalesce((select max(fecha_programacion) from public.bigzap_lotes), date '1900-01-01'),
             coalesce((select max(fecha_movimiento) from public.bigzap_pt_movimientos), date '1900-01-01'),
             coalesce((select max(fecha_pedido) from public.bigzap_pedidos), date '1900-01-01')
           )::text as data_max_date`,
        [fechaInicio, fechaFin]
      ),
      this.pool.query<ErpRecord>(
        `select
           (count(distinct pedido_folio) filter (where pedido_folio is not null))::int as orders,
           count(*)::int as batches,
           coalesce(sum(coalesce(pares, 0)), 0)::int as pairs
         from public.tarjetas_viajeras
         where cancelado = false and coalesce(status_depto, '') not in ('40','50')`
      ),
      this.pool.query<ErpRecord>(
        `select a.fecha::text as fecha,
                coalesce(sum(l.pares), 0)::int as pares,
                count(*)::int as tarjetas
         from public.bigzap_avance a
         left join public.bigzap_lotes l on l.programa = a.programa and l.lote = a.lote
         where a.fecha between $1::date and $2::date
           and a.depto = '15'
           and a.escaneado_at is not null
         group by a.fecha
         order by a.fecha`,
        [fechaInicio, fechaFin]
      ),
      this.pool.query<ErpRecord>(
        `with lot_base as (
           select l.programa, l.lote, l.estilo, coalesce(e.nombre, l.estilo, 'S/Modelo') as modelo,
                  coalesce(l.piecol, l.combina, 'N/D') as color,
                  l.fecha_programacion, l.pares, l.status_depto,
                  coalesce(c.nombre, lp.cliente, 'S/Cliente') as cliente,
                  pe.fecha_salida
           from public.bigzap_lotes l
           left join public.bigzap_estilos e on e.codigo = l.estilo
           left join lateral (
             select pedido, cliente from public.bigzap_lotes_pedidos lp
             where lp.programa = l.programa and lp.lote = l.lote
             order by lp.pedido, lp.renglon
             limit 1
           ) lp on true
           left join public.bigzap_pedidos pe on pe.folio = lp.pedido
           left join public.bigzap_clientes c on c.codigo = lp.cliente
           where l.fecha_programacion between $1::date and $2::date
         ),
         defects as (
           select programa, lote,
                  sum(case when calidad <> 1 then coalesce(pares, 0) else 0 end)::int as defectuosos,
                  sum(case when calidad = 2 then coalesce(pares, 0) else 0 end)::int as segundas,
                  sum(case when calidad = 3 then coalesce(pares, 0) else 0 end)::int as reprocesos
           from public.bigzap_pt_movimientos
           group by programa, lote
         ),
         scans as (
           select programa, lote,
                  min(escaneado_at) as first_scan,
                  max(escaneado_at) as last_scan,
                  min(escaneado_at) filter (where depto = '15') as inyeccion_at,
                  min(escaneado_at) filter (where depto in ('20','25')) as calidad_at,
                  min(escaneado_at) filter (where depto in ('30','35','39')) as banda_at,
                  min(escaneado_at) filter (where depto in ('40','50')) as embarque_at
           from public.bigzap_avance
           where escaneado_at is not null
           group by programa, lote
         )
         select
           coalesce(lb.estilo, lb.modelo) as modelo_id,
           lb.modelo as modelo_name,
           lb.color,
           lb.cliente,
           lb.fecha_programacion::text as fecha,
           lb.status_depto,
           count(*)::int as lotes,
           coalesce(sum(lb.pares), 0)::int as pares_producidos,
           coalesce(sum(d.defectuosos), 0)::int as pares_defectuosos,
           coalesce(sum(d.segundas), 0)::int as pares_segundas,
           coalesce(sum(d.reprocesos), 0)::int as pares_reprocesos,
           coalesce(avg(extract(epoch from (s.last_scan - s.first_scan)) / 3600.0), 0)::float as lead_time_hours,
           coalesce(avg(extract(epoch from (coalesce(s.calidad_at, s.banda_at) - s.inyeccion_at)) / 60.0) filter (where s.inyeccion_at is not null and coalesce(s.calidad_at, s.banda_at) is not null), 0)::float as tiempo_inyeccion_mins,
           coalesce(avg(extract(epoch from (s.banda_at - s.calidad_at)) / 60.0) filter (where s.banda_at is not null and s.calidad_at is not null), 0)::float as tiempo_estabilizacion_mins,
           coalesce(avg(extract(epoch from (s.embarque_at - s.banda_at)) / 60.0) filter (where s.embarque_at is not null and s.banda_at is not null), 0)::float as tiempo_banda_mins,
           count(*) filter (where s.embarque_at is not null and (lb.fecha_salida is null or s.embarque_at::date <= lb.fecha_salida))::int as entregas_cumplidas
         from lot_base lb
         left join defects d on d.programa = lb.programa and d.lote = lb.lote
         left join scans s on s.programa = lb.programa and s.lote = lb.lote
         group by lb.estilo, lb.modelo, lb.color, lb.cliente, lb.fecha_programacion, lb.status_depto
         order by lb.fecha_programacion, pares_producidos desc`,
        [fechaInicio, fechaFin]
      ),
      this.pool.query<ErpRecord>(
        `select codigo as id, codigo, nombre as name, rfc, clasif
         from public.bigzap_clientes
         order by nombre nulls last, codigo`
      ),
      this.pool.query<ErpRecord>(
        `select codigo as id, codigo, nombre as name, linea, vigente
         from public.bigzap_estilos
         order by nombre nulls last, codigo`
      ),
      this.pool.query<ErpRecord>(
        `select codigo as id, codigo, nombre as name, stage_id, orden
         from public.bigzap_departamentos
         order by orden nulls last, codigo`
      ),
      this.pool.query<ErpRecord>(
        `with active as (
           select
             coalesce(
               nullif(stage_id, ''),
               case coalesce(status_depto, '')
                 when '01' then 'alta_pedido'
                 when '10' then 'almacen'
                 when '15' then 'inyeccion'
                 when '20' then 'aduana'
                 when '25' then 'aduana'
                 when '30' then 'banda'
                 when '35' then 'banda'
                 when '39' then 'banda'
                 when '40' then 'embarque'
                 when '50' then 'embarque'
                 else 'alta_pedido'
               end
             ) as stage_id,
             coalesce(pares, 0)::numeric as pares,
             ultimo_escaneo
           from public.tarjetas_viajeras
           where cancelado = false
             and coalesce(status_depto, '') not in ('40','50')
         ),
         grouped as (
           select
             stage_id,
             count(*)::int as batches,
             coalesce(sum(pares), 0)::int as pairs,
             round(avg(greatest(0, extract(epoch from (now() - ultimo_escaneo)) / 60.0)) filter (where ultimo_escaneo is not null))::int as avg_minutes
           from active
           group by stage_id
         ),
         total as (
           select coalesce(sum(pares), 0)::numeric as total_pairs from active
         )
         select
           stage_id,
           batches,
           pairs,
           avg_minutes,
           case when total.total_pairs > 0 then round((pairs::numeric / total.total_pairs) * 100, 1)::float else 0 end as wip_pct
         from grouped, total
         order by case stage_id
           when 'alta_pedido' then 1
           when 'almacen' then 2
           when 'inyeccion' then 3
           when 'estabilizacion' then 4
           when 'aduana' then 5
           when 'banda' then 6
           when 'embarque' then 7
           else 99
         end`
      ),
      this.pool.query<ErpRecord>(
        `with lotes as (
           select
             'PED-' || pedido_folio::text as id,
             coalesce(cliente_nombre, cliente_codigo, 'S/Cliente') as cliente,
             pedido_oc as oc,
             coalesce(estilo_nombre, estilo, 'S/Modelo') as modelo,
             coalesce(piecol, combina, 'N/D') as color,
             fecha_programacion,
             pedido_fecha_salida,
             coalesce(
               nullif(stage_id, ''),
               case coalesce(status_depto, '')
                 when '01' then 'alta_pedido'
                 when '10' then 'almacen'
                 when '15' then 'inyeccion'
                 when '20' then 'aduana'
                 when '25' then 'aduana'
                 when '30' then 'banda'
                 when '35' then 'banda'
                 when '39' then 'banda'
                 when '40' then 'embarque'
                 when '50' then 'embarque'
                 else 'alta_pedido'
               end
             ) as stage_id,
             coalesce(pares, 0)::numeric as pares,
             ultimo_escaneo,
             coalesce(status_depto, '') in ('40','50') as delivered
           from public.tarjetas_viajeras
           where cancelado = false
             and pedido_folio is not null
         ),
         stage_pairs as (
           select id, stage_id, sum(pares)::int as pairs
           from lotes
           group by id, stage_id
         ),
         dominant as (
           select id, stage_id
           from (
             select id, stage_id, pairs,
                    row_number() over (partition by id order by pairs desc, stage_id asc) as rn
             from stage_pairs
           ) ranked
           where rn = 1
         ),
         rollup as (
           select
             id,
             max(cliente) as cliente,
             max(oc) as oc,
             max(modelo) as modelo,
             max(color) as color,
             min(fecha_programacion)::text as fecha_alta,
             max(pedido_fecha_salida)::text as fecha_compromiso,
             count(*)::int as batches_count,
             coalesce(sum(pares), 0)::int as total_pares,
             coalesce(sum(pares) filter (where delivered), 0)::int as shipped_pairs,
             coalesce(sum(pares) filter (where not delivered), 0)::int as in_process_pairs,
             coalesce(sum(pares * case stage_id
               when 'alta_pedido' then 14
               when 'almacen' then 29
               when 'inyeccion' then 43
               when 'estabilizacion' then 57
               when 'aduana' then 71
               when 'banda' then 86
               when 'embarque' then 100
               else 14
             end), 0)::numeric as weighted_progress,
             round(avg(greatest(0, extract(epoch from (now() - ultimo_escaneo)) / 60.0)) filter (where ultimo_escaneo is not null))::int as avg_time_min
           from lotes
           group by id
         )
         select
           r.*,
           case when r.total_pares > 0 then least(100, round(r.weighted_progress / r.total_pares)::int) else 0 end as progress,
           d.stage_id as dominant_stage,
           jsonb_object_agg(sp.stage_id, sp.pairs) as pairs_by_stage,
           case when r.fecha_compromiso is null then null else (r.fecha_compromiso::date - current_date)::int end as days_left
         from rollup r
         left join dominant d on d.id = r.id
         left join stage_pairs sp on sp.id = r.id
         group by r.id, r.cliente, r.oc, r.modelo, r.color, r.fecha_alta, r.fecha_compromiso, r.batches_count,
                  r.total_pares, r.shipped_pairs, r.in_process_pairs, r.weighted_progress, r.avg_time_min, d.stage_id
         order by r.fecha_compromiso nulls last, r.id`
      )
    ]);

    const meta = metaRows.rows[0] ?? {};
    const hasPeriodData = meta.has_period_data === true;
    const active = activeRows.rows[0] ?? {};
    const activeBatches = Number(active.batches ?? 0);
    const activePairs = Number(active.pairs ?? 0);
    const stagePipeline: StagePipelineRow[] = stageRows.rows.map((row) => {
      const batches = Number(row.batches ?? 0);
      const avgMinutes = row.avg_minutes == null ? null : Number(row.avg_minutes);
      return {
        stageId: String(row.stage_id ?? 'alta_pedido'),
        stageName: STAGE_NAMES[String(row.stage_id ?? 'alta_pedido')] ?? String(row.stage_id ?? 'Alta Pedido'),
        batches,
        pairs: Number(row.pairs ?? 0),
        avgMinutes,
        wipPct: Number(row.wip_pct ?? 0),
        saturation: saturationFor(batches, avgMinutes)
      };
    });
    const weightedProgressSum = stagePipeline.reduce((sum, row) => sum + row.pairs * (STAGE_WEIGHTS[row.stageId] ?? 14), 0);
    const wipSummary: WipSummary = {
      activeBatches,
      activePairs,
      globalProgress: activePairs > 0 ? Math.round(weightedProgressSum / activePairs) : 0
    };
    const orderPipeline: OrderPipelineRow[] = orderRows.rows.map((row) => {
      const totalPares = Number(row.total_pares ?? 0);
      const shippedPairs = Number(row.shipped_pairs ?? 0);
      const progress = Number(row.progress ?? 0);
      const daysLeft = row.days_left == null ? null : Number(row.days_left);
      const delivered = totalPares > 0 && shippedPairs >= totalPares;
      return {
        id: String(row.id ?? ''),
        cliente: String(row.cliente ?? 'S/Cliente'),
        oc: row.oc == null ? null : String(row.oc),
        modelo: row.modelo == null ? null : String(row.modelo),
        color: row.color == null ? null : String(row.color),
        fechaAlta: row.fecha_alta == null ? null : String(row.fecha_alta),
        fechaCompromiso: row.fecha_compromiso == null ? null : String(row.fecha_compromiso),
        totalPares,
        shippedPairs,
        inProcessPairs: Number(row.in_process_pairs ?? 0),
        progress,
        avgTimeMin: row.avg_time_min == null ? null : Number(row.avg_time_min),
        dominantStage: String(row.dominant_stage ?? 'alta_pedido'),
        risk: deliveryRiskFromDays(daysLeft, delivered),
        pairsByStage: normalizeStagePairs(row.pairs_by_stage),
        batchesCount: Number(row.batches_count ?? 0),
        daysLeft
      };
    });
    const models: ModelPerformanceRow[] = modelRows.rows.map((row) => ({
      id: `${String(row.modelo_id ?? 'modelo')}-${String(row.fecha ?? '')}-${String(row.color ?? '')}-${String(row.cliente ?? '')}`,
      tenantId: config.DEFAULT_TENANT_ID,
      modeloId: String(row.modelo_id ?? 'modelo_desconocido'),
      modeloName: String(row.modelo_name ?? 'S/Modelo'),
      color: String(row.color ?? 'N/D'),
      cliente: String(row.cliente ?? 'S/Cliente'),
      fecha: String(row.fecha ?? ''),
      paresProducidos: Number(row.pares_producidos ?? 0),
      paresDefectuosos: Number(row.pares_defectuosos ?? 0),
      paresSegundas: Number(row.pares_segundas ?? 0),
      paresReprocesos: Number(row.pares_reprocesos ?? 0),
      leadTimeHours: Number(Number(row.lead_time_hours ?? 0).toFixed(1)),
      tiempoInyeccionMins: Math.round(Number(row.tiempo_inyeccion_mins ?? 0)),
      tiempoEstabilizacionMins: Math.round(Number(row.tiempo_estabilizacion_mins ?? 0)),
      tiempoBandaMins: Math.round(Number(row.tiempo_banda_mins ?? 0)),
      entregaCumplida: Number(row.entregas_cumplidas ?? 0) >= Number(row.lotes ?? 0),
      etapaActiva: stageFromDepto(row.status_depto),
      estatus: statusFromModelRow(row)
    }));

    return {
      meta: {
        fechaInicio,
        fechaFin,
        hasPeriodData,
        dataMaxDate: meta.data_max_date && meta.data_max_date !== '1900-01-01' ? String(meta.data_max_date) : null,
        lastSync: toIsoOrNull(sync?.finished_at ?? sync?.started_at),
        source: 'big_zap_fdb'
      },
      active: {
        orders: hasPeriodData ? Number(active.orders ?? 0) : null,
        batches: hasPeriodData ? Number(active.batches ?? 0) : null,
        pairs: hasPeriodData ? Number(active.pairs ?? 0) : null
      },
      productionHourly: ejecutivo.produccion,
      quality: ejecutivo.calidad,
      movements,
      models,
      catalogs: {
        clients: clientsRows.rows,
        models: catalogModelsRows.rows,
        departments: deptRows.rows
      },
      dailyProduction: dailyRows.rows.map((row) => ({
        fecha: String(row.fecha ?? ''),
        pares: Number(row.pares ?? 0),
        tarjetas: Number(row.tarjetas ?? 0)
      })),
      wipSummary,
      stagePipeline,
      orderRisk: summarizeOrderRisk(orderPipeline),
      orderPipeline
    };
  }
}

class SupabaseErpService implements ErpService {
  readonly enabled = true;

  constructor(private readonly supabase: SupabaseClient) {}

  async listTarjetas(options: ListTarjetasOptions): Promise<ErpRecord[]> {
    let query = this.supabase
      .from('tarjetas_viajeras')
      .select('*')
      .order('ultimo_escaneo', { ascending: false, nullsFirst: false })
      .limit(options.limit);
    if (options.status) query = query.eq('status_depto', options.status);
    if (options.stage) query = query.eq('stage_id', options.stage);
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  async getTarjeta(id: string): Promise<TarjetaDetalle | null> {
    const parsed = parseTarjetaId(id);
    if (!parsed) return null;
    const { data: tarjeta, error } = await this.supabase
      .from('tarjetas_viajeras')
      .select('*')
      .eq('programa', parsed.programa)
      .eq('lote', parsed.lote)
      .maybeSingle();
    if (error) throw error;
    if (!tarjeta) return null;

    const [movimientos, pedidos] = await Promise.all([
      this.supabase
        .from('bigzap_avance')
        .select('programa, lote, depto, fecha, hora_cs, escaneado_at, gen_por, subdepto')
        .eq('programa', parsed.programa)
        .eq('lote', parsed.lote)
        .order('escaneado_at', { ascending: true }),
      this.supabase
        .from('bigzap_lotes_pedidos')
        .select('pedido, renglon, cliente, corrida, pares')
        .eq('programa', parsed.programa)
        .eq('lote', parsed.lote)
    ]);
    if (movimientos.error) throw movimientos.error;
    if (pedidos.error) throw pedidos.error;

    return {
      tarjeta,
      movimientos: movimientos.data ?? [],
      pedidos: pedidos.data ?? []
    };
  }

  async getSyncStatus(): Promise<ErpRecord | null> {
    const { data, error } = await this.supabase
      .from('erp_sync_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  }

  async getEjecutivoDashboard(fechaInicio: string, fechaFin: string): Promise<EjecutivoData> {
    const [avanceRes, ptmovRes, lotesRes, estilosRes] = await Promise.all([
      this.supabase
        .from('bigzap_avance')
        .select('programa, lote, depto, fecha, escaneado_at')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin)
        .in('depto', ['15', '30', '35', '39'])
        .not('escaneado_at', 'is', null),
      this.supabase
        .from('bigzap_pt_movimientos')
        .select('programa, lote, fecha_movimiento, calidad, pares')
        .gte('fecha_movimiento', fechaInicio)
        .lte('fecha_movimiento', fechaFin)
        .in('calidad', [1, 2, 3])
        .gt('pares', 0),
      this.supabase.from('bigzap_lotes').select('programa, lote, pares, estilo, piecol, combina, status_depto'),
      this.supabase.from('bigzap_estilos').select('codigo, nombre')
    ]);

    const loteMap = new Map<string, ErpRecord>();
    for (const l of lotesRes.data ?? []) loteMap.set(`${l.programa}-${l.lote}`, l);
    const estiloMap = new Map<string, string>();
    for (const e of estilosRes.data ?? []) estiloMap.set(String(e.codigo), String(e.nombre ?? ''));

    const AREA_MAP: Record<string, string> = { '15': 'INYECCION', '30': 'BANDA', '35': 'BANDA', '39': 'BANDA' };
    const META_MAP: Record<string, number> = { '15': 550, '30': 620, '35': 620, '39': 620 };

    // Group avance by fecha+depto+hour
    const prodMap = new Map<string, { area: string; fecha: string; hora: string; turno: string; metaHora: number; pares: number; modelo: string; color: string }>();
    for (const a of avanceRes.data ?? []) {
      const hora = new Date(a.escaneado_at).getHours();
      const lot = loteMap.get(`${a.programa}-${a.lote}`);
      const modelo = lot ? (estiloMap.get(String(lot.estilo)) || String(lot.estilo || 'Varios')) : 'Varios';
      const color = lot ? String(lot.piecol || lot.combina || 'N/D') : 'N/D';
      const key = `${a.fecha}|${a.depto}|${hora}|${modelo}|${color}`;
      const horaStr = String(hora).padStart(2, '0') + ':00';
      const turno = hora >= 7 && hora < 15 ? '1' : hora >= 15 && hora < 23 ? '2' : '3';
      const existing = prodMap.get(key);
      if (existing) {
        existing.pares += Number(lot?.pares ?? 0);
      } else {
        prodMap.set(key, {
          area: AREA_MAP[a.depto] ?? `DEPTO-${a.depto}`,
          fecha: String(a.fecha),
          hora: horaStr,
          turno,
          metaHora: META_MAP[a.depto] ?? 500,
          pares: Number(lot?.pares ?? 0),
          modelo,
          color
        });
      }
    }
    const produccion: HourlyProductionRow[] = Array.from(prodMap.values()).map(p => ({
      area: p.area, fecha: p.fecha, hora: p.hora, turno: p.turno,
      metaHora: p.metaHora, produccionReal: p.pares,
      eficiencia: p.metaHora > 0 ? Number(((p.pares / p.metaHora) * 100).toFixed(1)) : 0,
      modelo: p.modelo, color: p.color, responsable: 'N/D'
    }));

    // Group ptmov by fecha+programa+lote
    const calidadMap = new Map<string, { fecha: string; programa: number; lote: number; primeras: number; segundas: number; merma: number }>();
    for (const m of ptmovRes.data ?? []) {
      const key = `${m.fecha_movimiento}|${m.programa}|${m.lote}`;
      const existing = calidadMap.get(key) ?? { fecha: String(m.fecha_movimiento), programa: m.programa, lote: m.lote, primeras: 0, segundas: 0, merma: 0 };
      if (m.calidad === 1) existing.primeras += Number(m.pares);
      else if (m.calidad === 2) existing.segundas += Number(m.pares);
      else if (m.calidad === 3) existing.merma += Number(m.pares);
      calidadMap.set(key, existing);
    }
    const calidad: CalidadRow[] = Array.from(calidadMap.values()).map(c => {
      const lot = loteMap.get(`${c.programa}-${c.lote}`);
      const total = c.primeras + c.segundas + c.merma;
      const defects = c.segundas + c.merma;
      return {
        fecha: c.fecha, turno: '1',
        area: lot && AREA_MAP[String(lot.status_depto)] ? AREA_MAP[String(lot.status_depto)] : 'INYECCION',
        lote: `${c.programa}-${c.lote}`,
        modelo: lot ? (estiloMap.get(String(lot.estilo)) || String(lot.estilo || 'S/Modelo')) : 'S/Modelo',
        color: lot ? String(lot.piecol || lot.combina || 'N/D') : 'N/D',
        totalInspeccionado: total, primeras: c.primeras, segundas: c.segundas, merma: c.merma, reproceso: defects,
        defecto: 'Defecto Calidad', cantidadDefecto: defects,
        porcentajeDefectivo: total > 0 ? Number(((defects / total) * 100).toFixed(2)) : 0
      };
    });

    return { produccion, calidad };
  }

  async getMovimientos(fechaInicio: string, fechaFin: string, limit: number): Promise<MovimientoRow[]> {
    const [avanceRes, lotesRes, deptosRes] = await Promise.all([
      this.supabase
        .from('bigzap_avance')
        .select('programa, lote, depto, escaneado_at, gen_por')
        .gte('fecha', fechaInicio)
        .not('escaneado_at', 'is', null)
        .order('escaneado_at', { ascending: true }),
      this.supabase.from('bigzap_lotes').select('programa, lote, pares'),
      this.supabase.from('bigzap_departamentos').select('codigo, nombre')
    ]);

    const paresMap = new Map<string, number>();
    for (const l of lotesRes.data ?? []) paresMap.set(`${l.programa}-${l.lote}`, Number(l.pares ?? 0));
    const deptoMap = new Map<string, string>();
    for (const d of deptosRes.data ?? []) deptoMap.set(String(d.codigo), String(d.nombre ?? ''));

    // Agrupa escaneos por lote para calcular la salida = siguiente escaneo.
    const byLot = new Map<string, ErpRecord[]>();
    for (const a of avanceRes.data ?? []) {
      if (!a.depto || String(a.depto).trim() === '') continue;
      const key = `${a.programa}-${a.lote}`;
      let arr = byLot.get(key);
      if (!arr) { arr = []; byLot.set(key, arr); }
      arr.push(a);
    }

    const out: MovimientoRow[] = [];
    for (const [lotKey, scans] of byLot) {
      scans.sort((x, y) => String(x.escaneado_at).localeCompare(String(y.escaneado_at)));
      for (let i = 0; i < scans.length; i++) {
        const s = scans[i];
        const entrada = String(s.escaneado_at);
        const day = entrada.slice(0, 10);
        if (day < fechaInicio || day > fechaFin) continue;
        const nextScan = i + 1 < scans.length ? String(scans[i + 1].escaneado_at) : null;
        // Etapa terminal (40/50) sin siguiente escaneo = lote cerrado: cierra en su entrada.
        const terminal = s.depto === '40' || s.depto === '50';
        const salida = nextScan ?? (terminal ? entrada : null);
        const end = nextScan ? new Date(nextScan).getTime() : terminal ? new Date(entrada).getTime() : Date.now();
        out.push({
          idMovimiento: `MOV-${s.programa}-${s.lote}-${s.depto}`,
          idLote: lotKey,
          etapa: deptoMap.get(String(s.depto)) || `DEPTO-${s.depto}`,
          fechaEntrada: toIsoOrNull(entrada) ?? '',
          fechaSalida: salida ? toIsoOrNull(salida) : null,
          pares: paresMap.get(lotKey) ?? 0,
          usuarioEscaneo: (s.gen_por != null ? String(s.gen_por).trim() : '') || 'N/D',
          duracionMinutos: Math.max(0, Math.round((end - new Date(entrada).getTime()) / 60000))
        });
      }
    }
    out.sort((a, b) => b.fechaEntrada.localeCompare(a.fechaEntrada));
    return out.slice(0, limit);
  }

  async getOperational(fechaInicio: string, fechaFin: string): Promise<ErpOperationalResponse> {
    const [ejecutivo, movements, sync, tarjetasRes, lotesRes, clientesRes, estilosRes, deptosRes] = await Promise.all([
      this.getEjecutivoDashboard(fechaInicio, fechaFin),
      this.getMovimientos(fechaInicio, fechaFin, 500),
      this.getSyncStatus(),
      this.supabase.from('tarjetas_viajeras').select('*'),
      this.supabase.from('bigzap_lotes').select('programa, lote, pares, estilo, piecol, combina, fecha_programacion, status_depto').gte('fecha_programacion', fechaInicio).lte('fecha_programacion', fechaFin),
      this.supabase.from('bigzap_clientes').select('codigo, nombre, rfc, clasif'),
      this.supabase.from('bigzap_estilos').select('codigo, nombre, linea, vigente'),
      this.supabase.from('bigzap_departamentos').select('codigo, nombre, stage_id, orden')
    ]);
    if (tarjetasRes.error) throw tarjetasRes.error;
    if (lotesRes.error) throw lotesRes.error;
    if (clientesRes.error) throw clientesRes.error;
    if (estilosRes.error) throw estilosRes.error;
    if (deptosRes.error) throw deptosRes.error;

    const estiloMap = new Map<string, string>();
    for (const e of estilosRes.data ?? []) estiloMap.set(String(e.codigo), String(e.nombre ?? ''));
    const hasPeriodData = ejecutivo.produccion.length > 0 || ejecutivo.calidad.length > 0 || (lotesRes.data ?? []).length > 0;
    const dataMaxDate = (tarjetasRes.data ?? [])
      .map((row) => String(row.ultimo_escaneo ?? row.fecha_programacion ?? '').slice(0, 10))
      .filter(Boolean)
      .sort()
      .pop() ?? null;
    const activeTarjetas = (tarjetasRes.data ?? []).filter((row) =>
      row.cancelado !== true && !['40', '50'].includes(String(row.status_depto ?? ''))
    );
    const operationalSummaries = buildOperationalSummariesFromTarjetas((tarjetasRes.data ?? []) as ErpRecord[]);
    const modelRows = new Map<string, ModelPerformanceRow>();
    for (const lot of lotesRes.data ?? []) {
      const modeloName = estiloMap.get(String(lot.estilo)) || String(lot.estilo || 'S/Modelo');
      const color = String(lot.piecol || lot.combina || 'N/D');
      const fecha = String(lot.fecha_programacion ?? '');
      const key = `${modeloName}|${color}|${fecha}`;
      const existing = modelRows.get(key) ?? {
        id: key,
        tenantId: config.DEFAULT_TENANT_ID,
        modeloId: String(lot.estilo ?? 'modelo_desconocido'),
        modeloName,
        color,
        cliente: 'S/Cliente',
        fecha,
        paresProducidos: 0,
        paresDefectuosos: 0,
        paresSegundas: 0,
        paresReprocesos: 0,
        leadTimeHours: 0,
        tiempoInyeccionMins: 0,
        tiempoEstabilizacionMins: 0,
        tiempoBandaMins: 0,
        entregaCumplida: false,
        etapaActiva: stageFromDepto(lot.status_depto),
        estatus: 'Active'
      };
      existing.paresProducidos += Number(lot.pares ?? 0);
      modelRows.set(key, existing);
    }
    const dailyMap = new Map<string, { pares: number; tarjetas: number }>();
    for (const p of ejecutivo.produccion.filter((row) => row.area === 'INYECCION')) {
      const current = dailyMap.get(p.fecha) ?? { pares: 0, tarjetas: 0 };
      current.pares += p.produccionReal;
      current.tarjetas += 1;
      dailyMap.set(p.fecha, current);
    }

    return {
      meta: {
        fechaInicio,
        fechaFin,
        hasPeriodData,
        dataMaxDate,
        lastSync: toIsoOrNull(sync?.finished_at ?? sync?.started_at),
        source: 'big_zap_fdb'
      },
      active: {
        orders: hasPeriodData ? new Set(activeTarjetas.map((row) => row.pedido_folio).filter(Boolean)).size : null,
        batches: hasPeriodData ? activeTarjetas.length : null,
        pairs: hasPeriodData ? activeTarjetas.reduce((sum, row) => sum + Number(row.pares ?? 0), 0) : null
      },
      productionHourly: ejecutivo.produccion,
      quality: ejecutivo.calidad,
      movements,
      models: Array.from(modelRows.values()),
      catalogs: {
        clients: (clientesRes.data ?? []).map((row) => ({ id: row.codigo, codigo: row.codigo, name: row.nombre, rfc: row.rfc, clasif: row.clasif })),
        models: (estilosRes.data ?? []).map((row) => ({ id: row.codigo, codigo: row.codigo, name: row.nombre, linea: row.linea, vigente: row.vigente })),
        departments: (deptosRes.data ?? []).map((row) => ({ id: row.codigo, codigo: row.codigo, name: row.nombre, stage_id: row.stage_id, orden: row.orden }))
      },
      dailyProduction: Array.from(dailyMap.entries()).map(([fecha, data]) => ({ fecha, ...data })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      wipSummary: operationalSummaries.wipSummary,
      stagePipeline: operationalSummaries.stagePipeline,
      orderRisk: operationalSummaries.orderRisk,
      orderPipeline: operationalSummaries.orderPipeline
    };
  }
}

export class DisabledErpService implements ErpService {
  readonly enabled = false;

  async listTarjetas(): Promise<ErpRecord[]> {
    return [];
  }

  async getTarjeta(): Promise<TarjetaDetalle | null> {
    return null;
  }

  async getSyncStatus(): Promise<ErpRecord | null> {
    return null;
  }

  async getEjecutivoDashboard(): Promise<EjecutivoData> {
    return { produccion: [], calidad: [] };
  }

  async getMovimientos(): Promise<MovimientoRow[]> {
    return [];
  }

  async getOperational(fechaInicio = '', fechaFin = ''): Promise<ErpOperationalResponse> {
    return {
      meta: { fechaInicio, fechaFin, hasPeriodData: false, dataMaxDate: null, lastSync: null, source: 'big_zap_fdb' },
      active: { orders: null, batches: null, pairs: null },
      productionHourly: [],
      quality: [],
      movements: [],
      models: [],
      catalogs: { clients: [], models: [], departments: [] },
      dailyProduction: [],
      wipSummary: { activeBatches: 0, activePairs: 0, globalProgress: 0 },
      stagePipeline: [],
      orderRisk: { totalOpen: 0, totalRisk: 0, vencido: 0, alto: 0, medio: 0, bajo: 0, rows: [] },
      orderPipeline: []
    };
  }
}

export function createErpService(): ErpService {
  if (hasDatabaseUrl) return new PgErpService();
  if (hasSupabaseConfig)
    return new SupabaseErpService(
      createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
        auth: { persistSession: false, autoRefreshToken: false }
      })
    );
  return new DisabledErpService();
}
