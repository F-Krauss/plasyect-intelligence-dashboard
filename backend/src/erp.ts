import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, hasDatabaseUrl, hasSupabaseConfig } from './config.js';
import { getPool } from './db.js';
import { mapTarjetaToBatch, type TarjetaViajeraRow } from './bigzap-map.js';
import type { Batch } from './domain.js';

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
  pedido?: string;
  lote?: string;
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
  lotes: number;
  pedidos?: number;
  paresPorTalla?: Record<string, number>;
  paresProducidos: number;
  paresDefectuosos: number;
  paresSegundas: number;
  paresReprocesos: number;
  leadTimeHours: number;
  tiempoInyeccionMins: number;
  tiempoEstabilizacionMins: number;
  tiempoBandaMins: number;
  entregasCumplidas: number;
  entregasTotal: number;
  entregaCumplida: boolean;
  etapaActiva: 'Inyección' | 'Estabilización' | 'Aduana' | 'Banda' | 'Embarque' | 'Facturación' | 'Almacén';
  estatus: 'Active' | 'Warning' | 'Critical';
}

export interface ErpCatalogs {
  clients: ErpRecord[];
  models: ErpRecord[];
  departments: ErpRecord[];
  lines: ErpRecord[];
  combinations: ErpRecord[];
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
  producedPairs: number;
  shippedPairs: number;
  inProcessPairs: number;
  progress: number;
  avgTimeMin: number | null;
  dominantStage: string;
  risk: DeliveryRisk;
  pairsByStage: Record<string, number>;
  batchesCount: number;
  daysLeft: number | null;
  origin: string | null;
  discountPercentage: number | null;
  creditDays: number | null;
  notes: string | null;
  plannedPairsBySize: Record<string, number>;
  shippedPairsBySize: Record<string, number>;
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
    qualityAvailable: boolean;
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
  // Lotes activos + vencidos + embarcados hoy, universo completo de tarjetas_viajeras
  // (sin el cap del bootstrap), mapeados con la misma logica canonica. Fuente unica
  // para que Pipeline por Lote coincida con Pipeline por Pedido.
  lotePipeline: Batch[];
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

function dateInTz(value: unknown, timeZone: string): string {
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
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
    case '40': return 'Embarque';
    case '50': return 'Facturación';
    default: return 'Estabilización';
  }
}

function statusFromModelRow(row: ErpRecord): ModelPerformanceRow['estatus'] {
  const defectRate = Number(row.pares_producidos ?? 0) > 0
    ? Number(row.pares_defectuosos ?? 0) / Number(row.pares_producidos ?? 0)
    : 0;
  const entregasTotal = Number(row.entregas_total ?? 0);
  const entregasCumplidas = Number(row.entregas_cumplidas ?? 0);
  if (defectRate > 0.05) return 'Critical';
  if (defectRate > 0.02 || (entregasTotal > 0 && entregasCumplidas < entregasTotal)) return 'Warning';
  return 'Active';
}

const STAGE_WEIGHTS: Record<string, number> = {
  alta_pedido: 14,
  almacen: 29,
  inyeccion: 43,
  estabilizacion: 57,
  aduana: 71,
  banda: 86,
  embarque: 88,
  facturacion: 100
};

const STAGE_NAMES: Record<string, string> = {
  alta_pedido: 'Alta Pedido',
  almacen: 'Almacén',
  inyeccion: 'Inyección',
  estabilizacion: 'Estabilización',
  aduana: 'Aduana',
  banda: 'Banda',
  embarque: 'Embarque',
  facturacion: 'Facturación'
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
    case '40': return 'embarque';
    case '50': return 'facturacion';
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

function normalizeSizePairs(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, pairs]) => [key, Number(pairs ?? 0)] as const)
      .filter(([, pairs]) => Number.isFinite(pairs) && pairs > 0)
  );
}

function addSizePairs(target: Record<string, number>, value: unknown): void {
  for (const [size, pairs] of Object.entries(normalizeSizePairs(value))) {
    target[size] = (target[size] ?? 0) + pairs;
  }
}

function summarizeOrderRisk(rows: OrderPipelineRow[]): OrderRiskSummary {
  const totalOpen = rows.filter((row) => row.progress < 100).length;
  const vencido = rows.filter((row) => row.progress < 100 && row.risk === 'VENCIDO').length;
  const alto = rows.filter((row) => row.progress < 100 && row.risk === 'ALTO').length;
  const medio = rows.filter((row) => row.progress < 100 && row.risk === 'MEDIO').length;
  const bajo = rows.filter((row) => row.progress < 100 && row.risk === 'BAJO').length;
  return { totalOpen, totalRisk: vencido + alto, vencido, alto, medio, bajo, rows };
}

/**
 * Hora del dia (0-23) de un timestamptz/ISO en la zona horaria de la planta.
 * new Date(iso).getHours() usa la TZ del proceso Node (UTC en Cloud Run), lo que
 * corre la hora ~6 h. Intl con timeZone fija la hora de pared real de la planta.
 */
function hourInTz(value: unknown, tz: string): number {
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return 0;
  const hour = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(date);
  return Number.parseInt(hour, 10) % 24;
}

function daysLeftFromDate(value: unknown, today = new Date()): number | null {
  if (!value) return null;
  const due = new Date(String(value).slice(0, 10) + 'T12:00:00Z');
  if (Number.isNaN(due.getTime())) return null;
  const base = new Date(today.toISOString().slice(0, 10) + 'T12:00:00Z');
  return Math.ceil((due.getTime() - base.getTime()) / 86_400_000);
}

function isCurrentPlantWipRow(row: ErpRecord, now = new Date()): boolean {
  const status = String(row.status_depto ?? '');
  if (status === '50') return false;
  const lastScan = toIsoOrNull(row.ultimo_escaneo);
  if (!lastScan) return false;
  return now.getTime() - new Date(lastScan).getTime() <= config.BIGZAP_PLANT_ACTIVE_DAYS * 86_400_000;
}

function buildOperationalSummariesFromTarjetas(tarjetas: ErpRecord[]): {
  wipSummary: WipSummary;
  stagePipeline: StagePipelineRow[];
  orderPipeline: OrderPipelineRow[];
  orderRisk: OrderRiskSummary;
} {
  const active = tarjetas.filter((row) => row.cancelado !== true && isCurrentPlantWipRow(row));
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

  const orderMap = new Map<string, OrderPipelineRow & { weighted: number; timeTotal: number; timeCount: number }>();
  for (const row of active) {
    if (row.cancelado === true || row.pedido_folio == null) continue;
    const id = `PED-${String(row.pedido_folio)}`;
    const stageId = stageIdFromDepto(row.status_depto, row.stage_id);
    const pairs = Number(row.pares ?? 0);
    const delivered = String(row.status_depto ?? '') === '50' || stageId === 'facturacion';
    const current = orderMap.get(id) ?? {
      id,
      cliente: String(row.cliente_nombre ?? row.cliente_codigo ?? 'S/Cliente'),
      oc: row.pedido_oc == null ? null : String(row.pedido_oc),
      modelo: row.estilo_nombre == null && row.estilo == null ? null : String(row.estilo_nombre ?? row.estilo),
      color: row.color_nombre == null && row.piecol == null && row.combina == null ? null : String(row.color_nombre ?? row.piecol ?? row.combina),
      fechaAlta: row.fecha_programacion == null ? null : toDateString(row.fecha_programacion),
      fechaCompromiso: row.pedido_fecha_salida == null ? null : toDateString(row.pedido_fecha_salida),
      totalPares: 0,
      producedPairs: 0,
      shippedPairs: 0,
      inProcessPairs: 0,
      progress: 0,
      avgTimeMin: null,
      dominantStage: 'alta_pedido',
      risk: 'BAJO',
      pairsByStage: { ...EMPTY_STAGE_PAIRS },
      batchesCount: 0,
      daysLeft: null,
      origin: null,
      discountPercentage: null,
      creditDays: null,
      notes: null,
      plannedPairsBySize: {},
      shippedPairsBySize: {},
      weighted: 0,
      timeTotal: 0,
      timeCount: 0
    };

    current.totalPares += pairs;
    current.producedPairs += delivered ? pairs : 0;
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
    const progress = row.totalPares > 0 ? Math.min(100, Math.round((row.producedPairs / row.totalPares) * 100)) : 0;
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
  const activeOrderTotals = orderPipeline
    .filter((row) => row.progress < 100)
    .reduce((acc, row) => {
      acc.total += row.totalPares;
      acc.shipped += row.shippedPairs;
      return acc;
    }, { total: 0, shipped: 0 });
  const wipSummary = {
    activeBatches: active.length,
    activePairs,
    globalProgress: activeOrderTotals.total > 0
      ? Math.round((activeOrderTotals.shipped / activeOrderTotals.total) * 100)
      : 0
  };

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
             ('50', 'FACTURACION', 6::numeric, 500)
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
             coalesce(cl.ultimo_escaneo, cl.fecha_programacion::timestamp at time zone $3) as event_at
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
         ),
         completed_local as (
           -- event_at es timestamptz (UTC). Lo bajamos a hora de pared de la
           -- planta ($3) antes de derivar fecha / hora / turno; si no, extract(hour)
           -- corre en UTC y corre todo ~6 h (la produccion aparece en la tarde/noche
           -- y los turnos quedan mal etiquetados).
           select c.*, (c.event_at at time zone $3) as event_local
           from completed c
         )
         SELECT
           c.programa::text || '-' || c.lote::text AS lote,
           COALESCE(pe.pedido_cliente, lp.pedido::text, 'S/Pedido') AS pedido,
           c.area,
           c.event_local::date::text AS fecha,
           lpad(extract(hour from c.event_local)::int::text, 2, '0') || ':00' AS hora,
           CASE
             WHEN extract(hour from c.event_local) >= 7 AND extract(hour from c.event_local) < 15 THEN '1'
             WHEN extract(hour from c.event_local) >= 15 AND extract(hour from c.event_local) < 23 THEN '2'
             ELSE '3'
           END AS turno,
           c.meta_hora,
           COALESCE(SUM(l.pares), 0)::int AS produccion_real,
           COALESCE(e.nombre, l.estilo, 'Varios') AS modelo,
           COALESCE(cb.nombre, l.piecol, l.combina, 'N/D') AS color
         FROM completed_local c
         JOIN public.bigzap_lotes l ON l.programa = c.programa AND l.lote = c.lote
         LEFT JOIN public.bigzap_estilos e ON e.codigo = l.estilo
         LEFT JOIN public.bigzap_combinaciones cb ON cb.codigo = coalesce(l.combina, l.piecol)
         LEFT JOIN LATERAL (
           SELECT pedido
           FROM public.bigzap_lotes_pedidos lp
           WHERE lp.programa = l.programa AND lp.lote = l.lote
           ORDER BY lp.pedido, lp.renglon
           LIMIT 1
         ) lp ON true
         LEFT JOIN public.bigzap_pedidos pe ON pe.folio = lp.pedido
         WHERE c.event_local::date BETWEEN $1::date AND $2::date
         GROUP BY c.programa, c.lote, lp.pedido, pe.pedido_cliente, c.area, c.event_local::date, extract(hour from c.event_local), c.meta_hora, e.nombre, l.estilo, cb.nombre, l.piecol, l.combina
         ORDER BY fecha, area, hora`,
        [fechaInicio, fechaFin, config.PLANT_TZ]
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
           COALESCE(cb.nombre, l.piecol, l.combina, 'N/D') AS color,
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
         LEFT JOIN public.bigzap_combinaciones cb ON cb.codigo = coalesce(l.combina, l.piecol)
         WHERE m.fecha_movimiento BETWEEN $1::date AND $2::date
           AND m.pares > 0
           AND m.calidad IN (1,2,3)
         GROUP BY m.fecha_movimiento, m.programa, m.lote, e.nombre, l.estilo, cb.nombre, l.piecol, l.combina, l.status_depto
         ORDER BY m.fecha_movimiento`,
        [fechaInicio, fechaFin]
      )
    ]);

    const produccion: HourlyProductionRow[] = prodRows.rows.map(r => ({
      id: `${String(r.lote ?? '')}_${String(r.fecha ?? '')}_${String(r.hora ?? '00:00')}_${String(r.area ?? '')}`,
      tarjetaViajera: String(r.lote ?? ''),
      pedido: String(r.pedido ?? 'S/Pedido'),
      lote: String(r.lote ?? ''),
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
       WHERE (m.entrada at time zone $4)::date BETWEEN $1::date AND $2::date
       ORDER BY m.entrada DESC
       LIMIT $3`,
      [fechaInicio, fechaFin, limit, config.PLANT_TZ]
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
    const [ejecutivo, movements, sync, metaRows, activeRows, dailyRows, modelRows, clientsRows, catalogModelsRows, deptRows, lineRows, combinationRows, stageRows, orderRows, loteRows] = await Promise.all([
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
           )::text as data_max_date,
           exists(
             select 1 from public.bigzap_pt_movimientos
             where fecha_movimiento between $1::date and $2::date and calidad <> 1
           ) as quality_available`,
        [fechaInicio, fechaFin]
      ),
      this.pool.query<ErpRecord>(
        `with current_plant as (
           select *
           from public.tarjetas_viajeras
           where cancelado = false
             and coalesce(status_depto, '') <> '50'
             and ultimo_escaneo is not null
             and (ultimo_escaneo at time zone $1)::date >= (now() at time zone $1)::date - ($2::int * interval '1 day')
         )
         select
           (count(distinct pedido_folio) filter (where pedido_folio is not null))::int as orders,
           count(*)::int as batches,
           coalesce(sum(coalesce(pares, 0)), 0)::int as pairs
         from current_plant`,
        [config.PLANT_TZ, config.BIGZAP_PLANT_ACTIVE_DAYS]
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
        `with lot_dim as (
           select l.programa, l.lote, l.estilo, coalesce(e.nombre, l.estilo, 'S/Modelo') as modelo,
                  coalesce(cb.nombre, l.piecol, l.combina, 'N/D') as color,
                  coalesce(l.pares, 0)::numeric as pares,
                  l.pares_por_talla,
                  l.status_depto,
                  lp.pedido,
                  coalesce(c.nombre, lp.cliente, 'S/Cliente') as cliente,
                  pe.fecha_salida
           from public.bigzap_lotes l
           left join public.bigzap_estilos e on e.codigo = l.estilo
           left join public.bigzap_combinaciones cb on cb.codigo = coalesce(l.combina, l.piecol)
           left join lateral (
             select pedido, cliente from public.bigzap_lotes_pedidos lp
             where lp.programa = l.programa and lp.lote = l.lote
             order by lp.pedido, lp.renglon
             limit 1
           ) lp on true
           left join public.bigzap_pedidos pe on pe.folio = lp.pedido
           left join public.bigzap_clientes c on c.codigo = lp.cliente
           where l.cancelado = false
         ),
         production as (
           select
             (a.escaneado_at at time zone $3)::date::text as fecha,
             coalesce(d.estilo, d.modelo) as modelo_id,
             d.modelo as modelo_name,
             d.color,
             d.cliente,
             max(d.status_depto) as status_depto,
             count(*)::int as lotes,
             count(distinct d.pedido) filter (where d.pedido is not null)::int as pedidos,
             coalesce(sum(d.pares), 0)::int as pares_producidos
           from public.bigzap_avance a
           join lot_dim d on d.programa = a.programa and d.lote = a.lote
           where a.depto = '50'
             and a.escaneado_at is not null
             and (a.escaneado_at at time zone $3)::date between $1::date and $2::date
           group by (a.escaneado_at at time zone $3)::date, d.estilo, d.modelo, d.color, d.cliente
         ),
         production_sizes_raw as (
           select
             (a.escaneado_at at time zone $3)::date::text as fecha,
             coalesce(d.estilo, d.modelo) as modelo_id,
             d.modelo as modelo_name,
             d.color,
             d.cliente,
             sizes.key as talla,
             sum(sizes.value::int)::int as pares
           from public.bigzap_avance a
           join lot_dim d on d.programa = a.programa and d.lote = a.lote
           cross join lateral jsonb_each_text(coalesce(d.pares_por_talla, '{}'::jsonb)) sizes
           where a.depto = '50'
             and a.escaneado_at is not null
             and (a.escaneado_at at time zone $3)::date between $1::date and $2::date
           group by (a.escaneado_at at time zone $3)::date, d.estilo, d.modelo, d.color, d.cliente, sizes.key
         ),
         production_sizes as (
           select fecha, modelo_id, modelo_name, color, cliente,
                  jsonb_object_agg(talla, pares order by talla) as pares_por_talla
           from production_sizes_raw
           group by fecha, modelo_id, modelo_name, color, cliente
         ),
         scan_lots as (
           select distinct programa, lote
           from public.bigzap_avance
           where escaneado_at is not null
             and (escaneado_at at time zone $3)::date between $1::date and $2::date
         ),
         scan_events as (
           select
             a.programa,
             a.lote,
             a.depto,
             a.escaneado_at,
             case
               when a.depto = '10' then 'almacen'
               when a.depto = '15' then 'inyeccion'
               when a.depto in ('20','25') then 'aduana'
               when a.depto in ('30','35','39') then 'banda'
               when a.depto = '40' then 'embarque'
               when a.depto = '50' then 'facturacion'
               else null
             end as area,
             case
               when a.depto = '10' then 1
               when a.depto = '15' then 2
               when a.depto in ('20','25') then 3
               when a.depto in ('30','35','39') then 4
               when a.depto = '40' then 5
               when a.depto = '50' then 6
               else null
             end as orden
           from public.bigzap_avance a
           join scan_lots sl on sl.programa = a.programa and sl.lote = a.lote
           where a.escaneado_at is not null
         ),
         ordered_scans as (
           select
             s.*,
             lead(s.escaneado_at) over (partition by s.programa, s.lote order by s.escaneado_at) as next_at,
             lead(s.orden) over (partition by s.programa, s.lote order by s.escaneado_at) as next_orden
           from scan_events s
         ),
         durations as (
           select
             (s.next_at at time zone $3)::date::text as fecha,
             coalesce(d.estilo, d.modelo) as modelo_id,
             d.modelo as modelo_name,
             d.color,
             d.cliente,
             s.area,
             extract(epoch from (s.next_at - s.escaneado_at)) / 60.0 as duration_mins
           from ordered_scans s
           join lot_dim d on d.programa = s.programa and d.lote = s.lote
           where s.area in ('inyeccion', 'aduana', 'banda')
             and s.next_at is not null
             and s.next_orden > s.orden
             and (s.next_at at time zone $3)::date between $1::date and $2::date
             and extract(epoch from (s.next_at - s.escaneado_at)) / 60.0 between 0 and 14400
         ),
         duration_rollup as (
           select
             fecha,
             modelo_id,
             modelo_name,
             color,
             cliente,
             coalesce(avg(duration_mins) filter (where area = 'inyeccion'), 0)::float as tiempo_inyeccion_mins,
             coalesce(avg(duration_mins) filter (where area = 'aduana'), 0)::float as tiempo_estabilizacion_mins,
             coalesce(avg(duration_mins) filter (where area = 'banda'), 0)::float as tiempo_banda_mins
           from durations
           group by fecha, modelo_id, modelo_name, color, cliente
         ),
         defects as (
           select
             m.fecha_movimiento::text as fecha,
             coalesce(d.estilo, d.modelo) as modelo_id,
             d.modelo as modelo_name,
             d.color,
             d.cliente,
             sum(case when m.calidad <> 1 then coalesce(m.pares, 0) else 0 end)::int as pares_defectuosos,
             sum(case when m.calidad = 2 then coalesce(m.pares, 0) else 0 end)::int as pares_segundas,
             sum(case when m.calidad = 3 then coalesce(m.pares, 0) else 0 end)::int as pares_reprocesos
           from public.bigzap_pt_movimientos m
           join lot_dim d on d.programa = m.programa and d.lote = m.lote
           where m.fecha_movimiento between $1::date and $2::date
           group by m.fecha_movimiento, d.estilo, d.modelo, d.color, d.cliente
         ),
         compliance as (
           select
             (a.escaneado_at at time zone $3)::date::text as fecha,
             coalesce(d.estilo, d.modelo) as modelo_id,
             d.modelo as modelo_name,
             d.color,
             d.cliente,
             count(*) filter (
               where d.fecha_salida is null
                  or (a.escaneado_at at time zone $3)::date <= d.fecha_salida
             )::int as entregas_cumplidas,
             count(*)::int as entregas_total
           from public.bigzap_avance a
           join lot_dim d on d.programa = a.programa and d.lote = a.lote
           where a.depto = '50'
             and a.escaneado_at is not null
             and (a.escaneado_at at time zone $3)::date between $1::date and $2::date
           group by (a.escaneado_at at time zone $3)::date, d.estilo, d.modelo, d.color, d.cliente
         ),
         keys as (
           select fecha, modelo_id, modelo_name, color, cliente from production
           union
           select fecha, modelo_id, modelo_name, color, cliente from duration_rollup
           union
           select fecha, modelo_id, modelo_name, color, cliente from defects
           union
           select fecha, modelo_id, modelo_name, color, cliente from compliance
         )
         select
           k.modelo_id,
           k.modelo_name,
           k.color,
           k.cliente,
           k.fecha,
           coalesce(p.status_depto, '15') as status_depto,
           coalesce(p.lotes, 0)::int as lotes,
           coalesce(p.pedidos, 0)::int as pedidos,
           coalesce(ps.pares_por_talla, '{}'::jsonb) as pares_por_talla,
           coalesce(p.pares_producidos, 0)::int as pares_producidos,
           coalesce(df.pares_defectuosos, 0)::int as pares_defectuosos,
           coalesce(df.pares_segundas, 0)::int as pares_segundas,
           coalesce(df.pares_reprocesos, 0)::int as pares_reprocesos,
           (
             coalesce(dr.tiempo_inyeccion_mins, 0)
             + coalesce(dr.tiempo_estabilizacion_mins, 0)
             + coalesce(dr.tiempo_banda_mins, 0)
           ) / 60.0 as lead_time_hours,
           coalesce(dr.tiempo_inyeccion_mins, 0)::float as tiempo_inyeccion_mins,
           coalesce(dr.tiempo_estabilizacion_mins, 0)::float as tiempo_estabilizacion_mins,
           coalesce(dr.tiempo_banda_mins, 0)::float as tiempo_banda_mins,
           coalesce(c.entregas_cumplidas, 0)::int as entregas_cumplidas,
           coalesce(c.entregas_total, 0)::int as entregas_total
         from keys k
         left join production p using (fecha, modelo_id, modelo_name, color, cliente)
         left join production_sizes ps using (fecha, modelo_id, modelo_name, color, cliente)
         left join duration_rollup dr using (fecha, modelo_id, modelo_name, color, cliente)
         left join defects df using (fecha, modelo_id, modelo_name, color, cliente)
         left join compliance c using (fecha, modelo_id, modelo_name, color, cliente)
         where coalesce(p.pares_producidos, 0) > 0
            or coalesce(df.pares_defectuosos, 0) > 0
            or coalesce(c.entregas_total, 0) > 0
         order by k.fecha, pares_producidos desc`,
        [fechaInicio, fechaFin, config.PLANT_TZ]
      ),
      this.pool.query<ErpRecord>(
        `select codigo as id, codigo, nombre as name, rfc, clasif, telefono, internet,
                direccion, ciudad, estado, limite_credito, dias_credito
         from public.bigzap_clientes
         order by nombre nulls last, codigo`
      ),
      this.pool.query<ErpRecord>(
        `select e.codigo as id, e.codigo, e.nombre as name, e.linea, li.nombre as line_name,
                e.vigente, e.foto, e.costo, e.escala, e.categoria, e.flujo,
                e.dias_proceso, e.tipo_producto, e.altura_piso, e.unidad
         from public.bigzap_estilos e
         left join public.bigzap_lineas li on li.codigo = e.linea
         order by e.nombre nulls last, e.codigo`
      ),
      this.pool.query<ErpRecord>(
        `select codigo as id, codigo, nombre as name, stage_id, orden
         from public.bigzap_departamentos
         order by orden nulls last, codigo`
      ),
      this.pool.query<ErpRecord>(
        `select codigo as id, codigo, nombre as name from public.bigzap_lineas order by codigo`
      ),
      this.pool.query<ErpRecord>(
        `select codigo as id, codigo, nombre as name from public.bigzap_combinaciones order by codigo`
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
                 when '50' then 'facturacion'
                 else 'alta_pedido'
               end
             ) as stage_id,
             coalesce(pares, 0)::numeric as pares,
             ultimo_escaneo
           from public.tarjetas_viajeras
           where cancelado = false
             and coalesce(status_depto, '') <> '50'
             and ultimo_escaneo is not null
             and (ultimo_escaneo at time zone $1)::date >= (now() at time zone $1)::date - ($2::int * interval '1 day')
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
           when 'facturacion' then 8
           else 99
         end`
        ,
        [config.PLANT_TZ, config.BIGZAP_PLANT_ACTIVE_DAYS]
      ),
      this.pool.query<ErpRecord>(
        `with lotes as (
           select
             'PED-' || pedido_folio::text as id,
             pedido_folio,
             coalesce(cliente_nombre, cliente_codigo, 'S/Cliente') as cliente,
             pedido_oc as oc,
             coalesce(estilo_nombre, estilo, 'S/Modelo') as modelo,
             coalesce(color_nombre, piecol, combina, 'N/D') as color,
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
                 when '50' then 'facturacion'
                 else 'alta_pedido'
               end
             ) as stage_id,
             coalesce(pares, 0)::numeric as pares,
             ultimo_escaneo,
             coalesce(status_depto, '') = '50' as delivered,
             p.origen,
             p.porcentaje_descuento,
             p.dias_credito,
             p.observaciones
           from public.tarjetas_viajeras tv
           left join public.bigzap_pedidos p on p.folio = tv.pedido_folio
           where cancelado = false
             and pedido_folio is not null
             and ultimo_escaneo is not null
             and (
               (
                 coalesce(status_depto, '') <> '50'
                 and (ultimo_escaneo at time zone $1)::date >= (now() at time zone $1)::date - ($2::int * interval '1 day')
               )
               or (
                 coalesce(status_depto, '') = '50'
                 and (ultimo_escaneo at time zone $1)::date = (now() at time zone $1)::date
               )
             )
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
             l.id,
             max(l.cliente) as cliente,
             max(l.oc) as oc,
             max(l.modelo) as modelo,
             max(l.color) as color,
             max(l.origen) as origin,
             max(l.porcentaje_descuento) as discount_percentage,
             max(l.dias_credito) as credit_days,
             max(l.observaciones) as notes,
             min(l.fecha_programacion)::text as fecha_alta,
             max(l.pedido_fecha_salida)::text as fecha_compromiso,
             count(*)::int as batches_count,
             greatest(coalesce(max(nullif(p.pares_pedidos, 0)), 0), coalesce(max(pt.planned_pairs), 0), coalesce(sum(l.pares), 0))::int as total_pares,
             coalesce(sum(l.pares) filter (where l.delivered), 0)::int as produced_pairs,
             coalesce(sum(l.pares) filter (where l.delivered), 0)::int as shipped_pairs,
             greatest(
               greatest(coalesce(max(nullif(p.pares_pedidos, 0)), 0), coalesce(max(pt.planned_pairs), 0), coalesce(sum(l.pares), 0))
               - coalesce(sum(l.pares) filter (where l.delivered), 0),
               0
             )::int as in_process_pairs,
             round(avg(greatest(0, extract(epoch from (now() - l.ultimo_escaneo)) / 60.0)) filter (where l.ultimo_escaneo is not null))::int as avg_time_min
           from lotes l
           left join (
             select pedido, coalesce(sum(pares), 0)::int as planned_pairs
             from public.bigzap_lotes_pedidos
             group by pedido
           ) pt on ('PED-' || pt.pedido::text) = l.id
           left join public.bigzap_pedidos p on ('PED-' || p.folio::text) = l.id
           group by l.id
         ),
         planned_sizes_raw as (
           select 'PED-' || lp.pedido::text as id, sizes.key as talla,
                  sum(sizes.value::int)::int as pairs
           from public.bigzap_lotes_pedidos lp
           cross join lateral jsonb_each_text(coalesce(lp.pares_por_talla, '{}'::jsonb)) sizes
           group by lp.pedido, sizes.key
         ),
         planned_sizes as (
           select id, jsonb_object_agg(talla, pairs order by talla) as pairs_by_size
           from planned_sizes_raw group by id
         ),
         shipped_sizes_raw as (
           select 'PED-' || m.pedido::text as id, sizes.key as talla,
                  sum(sizes.value::int)::int as pairs
           from public.bigzap_pt_movimientos m
           cross join lateral jsonb_each_text(coalesce(m.pares_por_talla, '{}'::jsonb)) sizes
           where m.movto = '71' and m.tipo = 'F'
           group by m.pedido, sizes.key
         ),
         shipped_sizes as (
           select id, jsonb_object_agg(talla, pairs order by talla) as pairs_by_size
           from shipped_sizes_raw group by id
         )
         select
           r.*,
           case when r.total_pares > 0 then least(100, round(r.produced_pairs::numeric / r.total_pares * 100)::int) else 0 end as progress,
           d.stage_id as dominant_stage,
           jsonb_object_agg(sp.stage_id, sp.pairs) as pairs_by_stage,
           coalesce(ps.pairs_by_size, '{}'::jsonb) as planned_pairs_by_size,
           coalesce(ss.pairs_by_size, '{}'::jsonb) as shipped_pairs_by_size,
           case when r.fecha_compromiso is null then null else (r.fecha_compromiso::date - current_date)::int end as days_left
         from rollup r
         left join dominant d on d.id = r.id
         left join stage_pairs sp on sp.id = r.id
         left join planned_sizes ps on ps.id = r.id
         left join shipped_sizes ss on ss.id = r.id
         group by r.id, r.cliente, r.oc, r.modelo, r.color, r.fecha_alta, r.fecha_compromiso, r.batches_count,
                  r.total_pares, r.produced_pairs, r.shipped_pairs, r.in_process_pairs, r.avg_time_min, d.stage_id,
                  r.origin, r.discount_percentage, r.credit_days, r.notes, ps.pairs_by_size, ss.pairs_by_size
         order by r.fecha_compromiso nulls last, r.id`
        ,
        [config.PLANT_TZ, config.BIGZAP_PLANT_ACTIVE_DAYS]
      ),
      this.pool.query<ErpRecord>(
        `select * from public.tarjetas_viajeras
         where cancelado = false
           and ultimo_escaneo is not null
           and (
             (
               coalesce(status_depto, '') <> '50'
               and (ultimo_escaneo at time zone $1)::date >= (now() at time zone $1)::date - ($2::int * interval '1 day')
             )
             or (
               coalesce(status_depto, '') = '50'
               and (ultimo_escaneo at time zone $1)::date = (now() at time zone $1)::date
             )
           )
         order by ultimo_escaneo desc nulls last`,
        [config.PLANT_TZ, config.BIGZAP_PLANT_ACTIVE_DAYS]
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
    const orderPipeline: OrderPipelineRow[] = orderRows.rows.map((row) => {
      const totalPares = Number(row.total_pares ?? 0);
      const producedPairs = Number(row.produced_pairs ?? 0);
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
        producedPairs,
        shippedPairs,
        inProcessPairs: Number(row.in_process_pairs ?? 0),
        progress,
        avgTimeMin: row.avg_time_min == null ? null : Number(row.avg_time_min),
        dominantStage: String(row.dominant_stage ?? 'alta_pedido'),
        risk: deliveryRiskFromDays(daysLeft, delivered),
        pairsByStage: normalizeStagePairs(row.pairs_by_stage),
        batchesCount: Number(row.batches_count ?? 0),
        daysLeft,
        origin: row.origin == null ? null : String(row.origin),
        discountPercentage: row.discount_percentage == null ? null : Number(row.discount_percentage),
        creditDays: row.credit_days == null ? null : Number(row.credit_days),
        notes: row.notes == null ? null : String(row.notes),
        plannedPairsBySize: normalizeSizePairs(row.planned_pairs_by_size),
        shippedPairsBySize: normalizeSizePairs(row.shipped_pairs_by_size)
      };
    });
    const activeOrderTotals = orderPipeline
      .filter((row) => row.progress < 100)
      .reduce((acc, row) => {
        acc.total += row.totalPares;
        acc.shipped += row.shippedPairs;
        return acc;
      }, { total: 0, shipped: 0 });
    const wipSummary: WipSummary = {
      activeBatches,
      activePairs,
      globalProgress: activeOrderTotals.total > 0
        ? Math.round((activeOrderTotals.shipped / activeOrderTotals.total) * 100)
        : 0
    };
    const models: ModelPerformanceRow[] = modelRows.rows.map((row) => ({
      id: `${String(row.modelo_id ?? 'modelo')}-${String(row.fecha ?? '')}-${String(row.color ?? '')}-${String(row.cliente ?? '')}`,
      tenantId: config.DEFAULT_TENANT_ID,
      modeloId: String(row.modelo_id ?? 'modelo_desconocido'),
      modeloName: String(row.modelo_name ?? 'S/Modelo'),
      color: String(row.color ?? 'N/D'),
      cliente: String(row.cliente ?? 'S/Cliente'),
      fecha: String(row.fecha ?? ''),
      lotes: Number(row.lotes ?? 0),
      pedidos: Number(row.pedidos ?? row.lotes ?? 0),
      paresPorTalla: normalizeSizePairs(row.pares_por_talla),
      paresProducidos: Number(row.pares_producidos ?? 0),
      paresDefectuosos: Number(row.pares_defectuosos ?? 0),
      paresSegundas: Number(row.pares_segundas ?? 0),
      paresReprocesos: Number(row.pares_reprocesos ?? 0),
      leadTimeHours: Number(Number(row.lead_time_hours ?? 0).toFixed(1)),
      tiempoInyeccionMins: Math.round(Number(row.tiempo_inyeccion_mins ?? 0)),
      tiempoEstabilizacionMins: Math.round(Number(row.tiempo_estabilizacion_mins ?? 0)),
      tiempoBandaMins: Math.round(Number(row.tiempo_banda_mins ?? 0)),
      entregasCumplidas: Number(row.entregas_cumplidas ?? 0),
      entregasTotal: Number(row.entregas_total ?? 0),
      entregaCumplida: Number(row.entregas_total ?? 0) > 0
        ? Number(row.entregas_cumplidas ?? 0) >= Number(row.entregas_total ?? 0)
        : false,
      etapaActiva: stageFromDepto(row.status_depto),
      estatus: statusFromModelRow(row)
    }));
    const lotePipeline: Batch[] = loteRows.rows.map((row) =>
      mapTarjetaToBatch(row as unknown as TarjetaViajeraRow, config.DEFAULT_TENANT_ID as Batch['tenantId'])
    );

    return {
      meta: {
        fechaInicio,
        fechaFin,
        hasPeriodData,
        dataMaxDate: meta.data_max_date && meta.data_max_date !== '1900-01-01' ? String(meta.data_max_date) : null,
        lastSync: toIsoOrNull(sync?.finished_at ?? sync?.started_at),
        qualityAvailable: meta.quality_available === true,
        source: 'big_zap_fdb'
      },
      active: {
        orders: Number(active.orders ?? 0),
        batches: Number(active.batches ?? 0),
        pairs: Number(active.pairs ?? 0)
      },
      productionHourly: ejecutivo.produccion,
      quality: ejecutivo.calidad,
      movements,
      models,
      catalogs: {
        clients: clientsRows.rows,
        models: catalogModelsRows.rows,
        departments: deptRows.rows,
        lines: lineRows.rows,
        combinations: combinationRows.rows
      },
      dailyProduction: dailyRows.rows.map((row) => ({
        fecha: String(row.fecha ?? ''),
        pares: Number(row.pares ?? 0),
        tarjetas: Number(row.tarjetas ?? 0)
      })),
      wipSummary,
      stagePipeline,
      orderRisk: summarizeOrderRisk(orderPipeline),
      orderPipeline,
      lotePipeline
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
    const [avanceRes, ptmovRes, lotesRes, estilosRes, pedidosRes] = await Promise.all([
      this.supabase
        .from('bigzap_avance')
        .select('programa, lote, depto, fecha, escaneado_at')
        .gte('fecha', fechaInicio)
        .lte('fecha', fechaFin)
        .in('depto', ['15', '30', '35', '39', '50'])
        .not('escaneado_at', 'is', null),
      this.supabase
        .from('bigzap_pt_movimientos')
        .select('programa, lote, fecha_movimiento, calidad, pares')
        .gte('fecha_movimiento', fechaInicio)
        .lte('fecha_movimiento', fechaFin)
        .in('calidad', [1, 2, 3])
        .gt('pares', 0),
      this.supabase.from('bigzap_lotes').select('programa, lote, pares, estilo, piecol, combina, status_depto'),
      this.supabase.from('bigzap_estilos').select('codigo, nombre'),
      this.supabase.from('bigzap_lotes_pedidos').select('programa, lote, pedido')
    ]);

    const loteMap = new Map<string, ErpRecord>();
    for (const l of lotesRes.data ?? []) loteMap.set(`${l.programa}-${l.lote}`, l);
    const estiloMap = new Map<string, string>();
    for (const e of estilosRes.data ?? []) estiloMap.set(String(e.codigo), String(e.nombre ?? ''));
    const pedidoMap = new Map<string, string>();
    for (const p of pedidosRes.data ?? []) {
      const key = `${p.programa}-${p.lote}`;
      if (!pedidoMap.has(key)) pedidoMap.set(key, String(p.pedido ?? 'S/Pedido'));
    }

    const AREA_MAP: Record<string, string> = { '15': 'INYECCION', '30': 'BANDA', '35': 'BANDA', '39': 'BANDA', '50': 'FACTURACION' };
    const META_MAP: Record<string, number> = { '15': 550, '30': 620, '35': 620, '39': 620, '50': 500 };

    // Group avance by fecha+depto+hour+lote.
    const prodMap = new Map<string, { area: string; fecha: string; hora: string; turno: string; metaHora: number; pares: number; modelo: string; color: string; pedido: string; lote: string }>();
    for (const a of avanceRes.data ?? []) {
      const hora = hourInTz(a.escaneado_at, config.PLANT_TZ);
      const lot = loteMap.get(`${a.programa}-${a.lote}`);
      const modelo = lot ? (estiloMap.get(String(lot.estilo)) || String(lot.estilo || 'Varios')) : 'Varios';
      const color = lot ? String(lot.piecol || lot.combina || 'N/D') : 'N/D';
      const lote = `${a.programa}-${a.lote}`;
      const pedido = pedidoMap.get(lote) || 'S/Pedido';
      const key = `${a.fecha}|${a.depto}|${hora}|${modelo}|${color}|${lote}`;
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
          color,
          pedido,
          lote
        });
      }
    }
    const produccion: HourlyProductionRow[] = Array.from(prodMap.values()).map(p => ({
      id: `${p.lote}_${p.fecha}_${p.hora}_${p.area}`,
      tarjetaViajera: p.lote,
      pedido: p.pedido,
      lote: p.lote,
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
    const [ejecutivo, movements, sync, tarjetasRes, lotesRes, clientesRes, estilosRes, lineasRes, combinacionesRes, deptosRes, pedidosMetaRes, lotesPedidosSizesRes, ptmovSizesRes] = await Promise.all([
      this.getEjecutivoDashboard(fechaInicio, fechaFin),
      this.getMovimientos(fechaInicio, fechaFin, 500),
      this.getSyncStatus(),
      this.supabase.from('tarjetas_viajeras').select('*'),
      this.supabase.from('bigzap_lotes').select('programa, lote, pares, pares_por_talla, estilo, piecol, combina, fecha_programacion, status_depto').gte('fecha_programacion', fechaInicio).lte('fecha_programacion', fechaFin),
      this.supabase.from('bigzap_clientes').select('codigo, nombre, rfc, clasif, telefono, internet, direccion, ciudad, estado, limite_credito, dias_credito'),
      this.supabase.from('bigzap_estilos').select('codigo, nombre, linea, vigente, foto, costo, escala, categoria, flujo, dias_proceso, tipo_producto, altura_piso, unidad'),
      this.supabase.from('bigzap_lineas').select('codigo, nombre'),
      this.supabase.from('bigzap_combinaciones').select('codigo, nombre'),
      this.supabase.from('bigzap_departamentos').select('codigo, nombre, stage_id, orden'),
      this.supabase.from('bigzap_pedidos').select('folio, origen, porcentaje_descuento, dias_credito, observaciones'),
      this.supabase.from('bigzap_lotes_pedidos').select('pedido, pares_por_talla'),
      this.supabase.from('bigzap_pt_movimientos').select('pedido, movto, tipo, pares_por_talla').eq('movto', '71').eq('tipo', 'F')
    ]);
    if (tarjetasRes.error) throw tarjetasRes.error;
    if (lotesRes.error) throw lotesRes.error;
    if (clientesRes.error) throw clientesRes.error;
    if (estilosRes.error) throw estilosRes.error;
    if (lineasRes.error) throw lineasRes.error;
    if (combinacionesRes.error) throw combinacionesRes.error;
    if (deptosRes.error) throw deptosRes.error;
    if (pedidosMetaRes.error) throw pedidosMetaRes.error;
    if (lotesPedidosSizesRes.error) throw lotesPedidosSizesRes.error;
    if (ptmovSizesRes.error) throw ptmovSizesRes.error;

    const estiloMap = new Map<string, string>();
    for (const e of estilosRes.data ?? []) estiloMap.set(String(e.codigo), String(e.nombre ?? ''));
    const combinacionMap = new Map<string, string>();
    for (const c of combinacionesRes.data ?? []) combinacionMap.set(String(c.codigo), String(c.nombre ?? ''));
    const lineMap = new Map<string, string>();
    for (const line of lineasRes.data ?? []) lineMap.set(String(line.codigo), String(line.nombre ?? ''));
    const hasPeriodData = ejecutivo.produccion.length > 0 || ejecutivo.calidad.length > 0 || (lotesRes.data ?? []).length > 0;
    const dataMaxDate = (tarjetasRes.data ?? [])
      .map((row) => String(row.ultimo_escaneo ?? row.fecha_programacion ?? '').slice(0, 10))
      .filter(Boolean)
      .sort()
      .pop() ?? null;
    const activeTarjetas = (tarjetasRes.data ?? []).filter((row) =>
      row.cancelado !== true && String(row.status_depto ?? '') !== '50'
    );
    const operationalSummaries = buildOperationalSummariesFromTarjetas((tarjetasRes.data ?? []) as ErpRecord[]);
    const orderMetaMap = new Map((pedidosMetaRes.data ?? []).map((row) => [String(row.folio), row]));
    const plannedSizeMap = new Map<string, Record<string, number>>();
    for (const row of lotesPedidosSizesRes.data ?? []) {
      const key = String(row.pedido);
      const sizes = plannedSizeMap.get(key) ?? {};
      addSizePairs(sizes, row.pares_por_talla);
      plannedSizeMap.set(key, sizes);
    }
    const shippedSizeMap = new Map<string, Record<string, number>>();
    for (const row of ptmovSizesRes.data ?? []) {
      const key = String(row.pedido);
      const sizes = shippedSizeMap.get(key) ?? {};
      addSizePairs(sizes, row.pares_por_talla);
      shippedSizeMap.set(key, sizes);
    }
    for (const order of operationalSummaries.orderPipeline) {
      const folio = order.id.replace(/^PED-/, '');
      const meta = orderMetaMap.get(folio);
      order.origin = meta?.origen == null ? null : String(meta.origen);
      order.discountPercentage = meta?.porcentaje_descuento == null ? null : Number(meta.porcentaje_descuento);
      order.creditDays = meta?.dias_credito == null ? null : Number(meta.dias_credito);
      order.notes = meta?.observaciones == null ? null : String(meta.observaciones);
      order.plannedPairsBySize = plannedSizeMap.get(folio) ?? {};
      order.shippedPairsBySize = shippedSizeMap.get(folio) ?? {};
    }
    const modelRows = new Map<string, ModelPerformanceRow>();
    for (const lot of lotesRes.data ?? []) {
      const modeloName = estiloMap.get(String(lot.estilo)) || String(lot.estilo || 'S/Modelo');
      const color = String(combinacionMap.get(String(lot.combina)) || lot.piecol || lot.combina || 'N/D');
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
        lotes: 0,
        pedidos: 0,
        paresPorTalla: {},
        paresProducidos: 0,
        paresDefectuosos: 0,
        paresSegundas: 0,
        paresReprocesos: 0,
        leadTimeHours: 0,
        tiempoInyeccionMins: 0,
        tiempoEstabilizacionMins: 0,
        tiempoBandaMins: 0,
        entregasCumplidas: 0,
        entregasTotal: 0,
        entregaCumplida: false,
        etapaActiva: stageFromDepto(lot.status_depto),
        estatus: 'Active'
      };
      existing.lotes += 1;
      existing.pedidos = (existing.pedidos ?? 0) + 1;
      existing.paresProducidos += Number(lot.pares ?? 0);
      addSizePairs(existing.paresPorTalla ?? (existing.paresPorTalla = {}), lot.pares_por_talla);
      modelRows.set(key, existing);
    }
    const dailyMap = new Map<string, { pares: number; tarjetas: number }>();
    for (const p of ejecutivo.produccion.filter((row) => row.area === 'INYECCION')) {
      const current = dailyMap.get(p.fecha) ?? { pares: 0, tarjetas: 0 };
      current.pares += p.produccionReal;
      current.tarjetas += 1;
      dailyMap.set(p.fecha, current);
    }
    const todayIso = dateInTz(new Date(), config.PLANT_TZ);
    const lotePipeline: Batch[] = (tarjetasRes.data ?? [])
      .filter((row) => {
        if (row.cancelado === true) return false;
        const delivered = String(row.status_depto ?? '') === '50' || row.stage_id === 'facturacion';
        const facturadoHoy = dateInTz(row.ultimo_escaneo, config.PLANT_TZ) === todayIso;
        return !delivered || facturadoHoy;
      })
      .map((row) => mapTarjetaToBatch(row as unknown as TarjetaViajeraRow, config.DEFAULT_TENANT_ID as Batch['tenantId']));

    return {
      meta: {
        fechaInicio,
        fechaFin,
        hasPeriodData,
        dataMaxDate,
        lastSync: toIsoOrNull(sync?.finished_at ?? sync?.started_at),
        qualityAvailable: ejecutivo.calidad.some((row) => row.segundas > 0 || row.merma > 0 || row.reproceso > 0),
        source: 'big_zap_fdb'
      },
      active: {
        orders: new Set(activeTarjetas.map((row) => row.pedido_folio).filter(Boolean)).size,
        batches: activeTarjetas.length,
        pairs: activeTarjetas.reduce((sum, row) => sum + Number(row.pares ?? 0), 0)
      },
      productionHourly: ejecutivo.produccion,
      quality: ejecutivo.calidad,
      movements,
      models: Array.from(modelRows.values()),
      catalogs: {
        clients: (clientesRes.data ?? []).map((row) => ({ ...row, id: row.codigo, name: row.nombre })),
        models: (estilosRes.data ?? []).map((row) => ({ ...row, id: row.codigo, name: row.nombre, line_name: lineMap.get(String(row.linea)) ?? null })),
        departments: (deptosRes.data ?? []).map((row) => ({ id: row.codigo, codigo: row.codigo, name: row.nombre, stage_id: row.stage_id, orden: row.orden })),
        lines: (lineasRes.data ?? []).map((row) => ({ id: row.codigo, codigo: row.codigo, name: row.nombre })),
        combinations: (combinacionesRes.data ?? []).map((row) => ({ id: row.codigo, codigo: row.codigo, name: row.nombre }))
      },
      dailyProduction: Array.from(dailyMap.entries()).map(([fecha, data]) => ({ fecha, ...data })).sort((a, b) => a.fecha.localeCompare(b.fecha)),
      wipSummary: operationalSummaries.wipSummary,
      stagePipeline: operationalSummaries.stagePipeline,
      orderRisk: operationalSummaries.orderRisk,
      orderPipeline: operationalSummaries.orderPipeline,
      lotePipeline
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
      meta: { fechaInicio, fechaFin, hasPeriodData: false, dataMaxDate: null, lastSync: null, qualityAvailable: false, source: 'big_zap_fdb' },
      active: { orders: null, batches: null, pairs: null },
      productionHourly: [],
      quality: [],
      movements: [],
      models: [],
      catalogs: { clients: [], models: [], departments: [], lines: [], combinations: [] },
      dailyProduction: [],
      wipSummary: { activeBatches: 0, activePairs: 0, globalProgress: 0 },
      stagePipeline: [],
      orderRisk: { totalOpen: 0, totalRisk: 0, vencido: 0, alto: 0, medio: 0, bajo: 0, rows: [] },
      orderPipeline: [],
      lotePipeline: []
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
