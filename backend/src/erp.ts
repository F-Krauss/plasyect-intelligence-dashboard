import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { config, hasSupabaseConfig } from './config.js';

/**
 * Acceso a los datos de BixApp (tarjetas viajeras) sincronizados por
 * sync-service/ hacia las tablas bigzap_* y la vista tarjetas_viajeras.
 * El backend nunca habla con Firebird directamente.
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
    configured: hasSupabaseConfig,
    message: 'Supabase no configurado: los datos de tarjetas viajeras llegan via sync-service a las tablas bigzap_*.'
  };
}

/** id de tarjeta = "PROGRAMA-LOTE", p. ej. "5498-40638" */
export function parseTarjetaId(id: string): { programa: number; lote: number } | null {
  const match = /^(\d{1,9})-(\d{1,9})$/.exec(id.trim());
  if (!match) return null;
  return { programa: Number(match[1]), lote: Number(match[2]) };
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
  if (!hasSupabaseConfig) return new DisabledErpService();
  const supabase = createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return new SupabaseErpService(supabase);
}
