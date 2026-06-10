import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mapPedidoToOrder, mapTarjetaToBatch, type PedidoRow, type TarjetaViajeraRow } from './bigzap-map.js';
import { config, hasSupabaseConfig } from './config.js';
import type { AuditLog, Band, Batch, BootstrapData, Client, Machine, Model, OcrDocument, Order, QualityDefect, Tenant, TenantId, UserSession } from './domain.js';
import { seedData } from './seed.js';

type EntityName = 'orders' | 'batches' | 'defects' | 'audits' | 'ocrDocuments';
type StoredEntity = Order | Batch | QualityDefect | AuditLog | OcrDocument;

const tableMap: Record<EntityName, string> = {
  orders: 'orders',
  batches: 'batches',
  defects: 'quality_defects',
  audits: 'audit_logs',
  ocrDocuments: 'ocr_documents'
};

interface EntityRow {
  id: string;
  tenant_id?: string | null;
  payload: StoredEntity;
}

export interface DashboardRepository {
  bootstrap(): Promise<BootstrapData>;
  create<K extends EntityName>(entity: K, payload: StoredEntity): Promise<StoredEntity>;
  patch<K extends EntityName>(entity: K, id: string, patch: Record<string, unknown>): Promise<StoredEntity | null>;
  list<K extends EntityName>(entity: K): Promise<StoredEntity[]>;
  get<K extends EntityName>(entity: K, id: string): Promise<StoredEntity | null>;
}

export function createRepository(): DashboardRepository {
  if (!hasSupabaseConfig) return new MemoryRepository();
  return new SupabaseRepository(createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false }
  }));
}

/** PostgREST PGRST205 / Postgres 42P01 = la tabla/vista aun no existe. */
function isMissingRelation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'PGRST205' || code === '42P01';
}

export class MemoryRepository implements DashboardRepository {
  private data: BootstrapData;

  constructor(initialData: BootstrapData = seedData) {
    this.data = structuredClone(initialData);
  }

  async bootstrap(): Promise<BootstrapData> {
    return structuredClone(this.data);
  }

  async list<K extends EntityName>(entity: K): Promise<StoredEntity[]> {
    return structuredClone(this.data[entity]) as StoredEntity[];
  }

  async get<K extends EntityName>(entity: K, id: string): Promise<StoredEntity | null> {
    const found = (this.data[entity] as StoredEntity[]).find((item) => item.id === id);
    return found ? structuredClone(found) : null;
  }

  async create<K extends EntityName>(entity: K, payload: StoredEntity): Promise<StoredEntity> {
    (this.data[entity] as StoredEntity[]).unshift(structuredClone(payload));
    return structuredClone(payload);
  }

  async patch<K extends EntityName>(entity: K, id: string, patch: Record<string, unknown>): Promise<StoredEntity | null> {
    const items = this.data[entity] as StoredEntity[];
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...patch } as StoredEntity;
    return structuredClone(items[index]);
  }
}

export class SupabaseRepository implements DashboardRepository {
  constructor(private readonly supabase: SupabaseClient) {}

  async bootstrap(): Promise<BootstrapData> {
    const [tenants, users, clients, models, orders, batches, machines, bands, defects, audits, ocrDocuments, bigzap] = await Promise.all([
      this.readStatic<Tenant>('tenants'),
      this.readStatic<UserSession>('app_users'),
      this.readStatic<Client>('clients'),
      this.readStatic<Model>('models'),
      this.list('orders') as Promise<Order[]>,
      this.list('batches') as Promise<Batch[]>,
      this.readStatic<Machine>('machines'),
      this.readStatic<Band>('bands'),
      this.list('defects') as Promise<QualityDefect[]>,
      this.list('audits') as Promise<AuditLog[]>,
      this.list('ocrDocuments') as Promise<OcrDocument[]>,
      this.loadBigzap()
    ]);

    // Las tarjetas viajeras reales (BixApp) tienen prioridad sobre el seed y la
    // tabla batches; si el sync aun no corre, se conserva el fallback existente.
    const realBatches = bigzap?.batches ?? [];
    const realOrders = bigzap?.orders ?? [];

    return {
      tenants: tenants.length ? tenants : seedData.tenants,
      users: users.length ? users : seedData.users,
      clients: clients.length ? clients : seedData.clients,
      models: models.length ? models : seedData.models,
      orders: realOrders.length ? realOrders : orders.length ? orders : seedData.orders,
      batches: realBatches.length ? realBatches : batches.length ? batches : seedData.batches,
      machines: machines.length ? machines : seedData.machines,
      bands: bands.length ? bands : seedData.bands,
      defects: defects.length ? defects : seedData.defects,
      audits: audits.length ? audits : seedData.audits,
      ocrDocuments
    };
  }

  /**
   * Lee las tarjetas viajeras activas y pedidos reales de las tablas bigzap_*.
   * Devuelve null si el esquema aun no existe (migracion sin aplicar) o no hay
   * datos, para que el bootstrap caiga al fallback sin romperse.
   */
  private async loadBigzap(): Promise<{ batches: Batch[]; orders: Order[] } | null> {
    const tenantId = config.DEFAULT_TENANT_ID as TenantId;
    try {
      const sinceIso = new Date(Date.now() - config.BIGZAP_ACTIVE_DAYS * 86_400_000).toISOString();
      const { data: tarjetas, error: tErr } = await this.supabase
        .from('tarjetas_viajeras')
        .select('*')
        .eq('cancelado', false)
        .or(`status_depto.neq.50,ultimo_escaneo.gte.${sinceIso}`)
        .order('ultimo_escaneo', { ascending: false, nullsFirst: false })
        .limit(config.BIGZAP_BATCH_LIMIT);
      if (tErr) {
        if (isMissingRelation(tErr)) return null;
        throw tErr;
      }
      if (!tarjetas || tarjetas.length === 0) return null;

      const { data: pedidos, error: pErr } = await this.supabase
        .from('bigzap_pedidos')
        .select('*')
        .is('fecha_cancelacion', null)
        .order('folio', { ascending: false })
        .limit(config.BIGZAP_BATCH_LIMIT);
      if (pErr && !isMissingRelation(pErr)) throw pErr;

      const { data: clientes } = await this.supabase.from('bigzap_clientes').select('codigo, nombre');
      const clienteName = new Map((clientes ?? []).map((c: { codigo: string; nombre: string | null }) => [c.codigo, c.nombre]));

      const batches = (tarjetas as TarjetaViajeraRow[]).map((row) => mapTarjetaToBatch(row, tenantId));
      const orders = (pedidos ?? []).map((row: PedidoRow) =>
        mapPedidoToOrder({ ...row, cliente_nombre: clienteName.get(row.cliente ?? '') ?? null }, tenantId)
      );
      return { batches, orders };
    } catch (error) {
      console.warn('No se pudieron cargar tarjetas viajeras de bigzap_*; usando fallback.', error);
      return null;
    }
  }

  async list<K extends EntityName>(entity: K): Promise<StoredEntity[]> {
    const { data, error } = await this.supabase
      .from(tableMap[entity])
      .select('id,payload')
      .order('updated_at', { ascending: false });
    if (error) throw error;
    return ((data ?? []) as EntityRow[]).map((row) => row.payload);
  }

  async get<K extends EntityName>(entity: K, id: string): Promise<StoredEntity | null> {
    const { data, error } = await this.supabase
      .from(tableMap[entity])
      .select('id,payload')
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as EntityRow | null)?.payload ?? null;
  }

  async create<K extends EntityName>(entity: K, payload: StoredEntity): Promise<StoredEntity> {
    const { error } = await this.supabase.from(tableMap[entity]).upsert(this.toRow(payload));
    if (error) throw error;
    return payload;
  }

  async patch<K extends EntityName>(entity: K, id: string, patch: Record<string, unknown>): Promise<StoredEntity | null> {
    const existing = await this.get(entity, id);
    if (!existing) return null;
    const updated = { ...existing, ...patch } as StoredEntity;
    const { error } = await this.supabase.from(tableMap[entity]).update(this.toRow(updated)).eq('id', id);
    if (error) throw error;
    return updated;
  }

  private async readStatic<T>(table: string): Promise<T[]> {
    const { data, error } = await this.supabase.from(table).select('payload').order('id', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as Array<{ payload: T }>).map((row) => row.payload);
  }

  private toRow(payload: StoredEntity): EntityRow & { updated_at: string } {
    return {
      id: payload.id,
      tenant_id: 'tenantId' in payload ? String(payload.tenantId) : null,
      payload,
      updated_at: new Date().toISOString()
    };
  }
}
