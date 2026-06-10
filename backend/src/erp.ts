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

export interface ErpService {
  readonly enabled: boolean;
  listTarjetas(options: ListTarjetasOptions): Promise<ErpRecord[]>;
  getTarjeta(id: string): Promise<TarjetaDetalle | null>;
  getSyncStatus(): Promise<ErpRecord | null>;
  getEjecutivoDashboard(fechaInicio: string, fechaFin: string): Promise<EjecutivoData>;
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
        `SELECT
           CASE a.depto
             WHEN '15' THEN 'INYECCION'
             WHEN '30' THEN 'BANDA'
             WHEN '35' THEN 'BANDA'
             WHEN '39' THEN 'BANDA'
             ELSE COALESCE(d.nombre, 'DEPTO-' || a.depto)
           END AS area,
           a.fecha::text AS fecha,
           lpad(extract(hour from a.escaneado_at)::text, 2, '0') || ':00' AS hora,
           CASE
             WHEN extract(hour from a.escaneado_at) >= 7 AND extract(hour from a.escaneado_at) < 15 THEN '1'
             WHEN extract(hour from a.escaneado_at) >= 15 AND extract(hour from a.escaneado_at) < 23 THEN '2'
             ELSE '3'
           END AS turno,
           CASE a.depto WHEN '15' THEN 550 WHEN '30' THEN 620 WHEN '35' THEN 620 WHEN '39' THEN 620 ELSE 500 END AS meta_hora,
           COALESCE(SUM(l.pares), 0)::int AS produccion_real,
           COALESCE(MIN(e.nombre), MIN(l.estilo), 'Varios') AS modelo
         FROM public.bigzap_avance a
         LEFT JOIN public.bigzap_lotes l ON l.programa = a.programa AND l.lote = a.lote
         LEFT JOIN public.bigzap_estilos e ON e.codigo = l.estilo
         LEFT JOIN public.bigzap_departamentos d ON d.codigo = a.depto
         WHERE a.fecha BETWEEN $1::date AND $2::date
           AND a.depto IN ('15','30','35','39')
           AND a.escaneado_at IS NOT NULL
         GROUP BY a.fecha, a.depto, d.nombre, extract(hour from a.escaneado_at)
         ORDER BY a.fecha, area, hora`,
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
      color: 'N/D',
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
    const prodMap = new Map<string, { area: string; fecha: string; hora: string; turno: string; metaHora: number; pares: number; modelo: string }>();
    for (const a of avanceRes.data ?? []) {
      const hora = new Date(a.escaneado_at).getHours();
      const key = `${a.fecha}|${a.depto}|${hora}`;
      const lot = loteMap.get(`${a.programa}-${a.lote}`);
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
          modelo: lot ? (estiloMap.get(String(lot.estilo)) || String(lot.estilo || 'Varios')) : 'Varios'
        });
      }
    }
    const produccion: HourlyProductionRow[] = Array.from(prodMap.values()).map(p => ({
      area: p.area, fecha: p.fecha, hora: p.hora, turno: p.turno,
      metaHora: p.metaHora, produccionReal: p.pares,
      eficiencia: p.metaHora > 0 ? Number(((p.pares / p.metaHora) * 100).toFixed(1)) : 0,
      modelo: p.modelo, color: 'N/D', responsable: 'N/D'
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
}

class DisabledErpService implements ErpService {
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
