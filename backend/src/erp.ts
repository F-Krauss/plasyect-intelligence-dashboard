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

export interface ErpService {
  readonly enabled: boolean;
  listTarjetas(options: ListTarjetasOptions): Promise<ErpRecord[]>;
  getTarjeta(id: string): Promise<TarjetaDetalle | null>;
  getSyncStatus(): Promise<ErpRecord | null>;
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
