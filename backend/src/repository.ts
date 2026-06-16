import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mapPedidoToOrder, mapTarjetaToBatch, type PedidoRow, type TarjetaViajeraRow } from './bigzap-map.js';
import { config, hasDatabaseUrl, hasSupabaseConfig } from './config.js';
import { getPool } from './db.js';
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
  if (hasDatabaseUrl) return new PgRepository();
  if (hasSupabaseConfig)
    return new SupabaseRepository(createClient(config.SUPABASE_URL!, config.SUPABASE_SERVICE_ROLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false }
    }));
  return new MemoryRepository();
}

/** PostgREST PGRST205 / Postgres 42P01 = la tabla/vista aun no existe. */
function isMissingRelation(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === 'PGRST205' || code === '42P01';
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function deriveClientsFromOrders(orders: Order[]): Client[] {
  const clients = new Map<string, Client>();
  orders.forEach((order) => {
    const row = order as Record<string, unknown>;
    const name = stringValue(row.clientName) || stringValue(row.cliente) || stringValue(row.clientId);
    if (!name) return;
    const id = stringValue(row.clientId) || name;
    const rawPriority = stringValue(row.prioridad);
    const priority = rawPriority === 'ALTA' || rawPriority === 'BAJA' ? rawPriority : 'MEDIA';
    clients.set(id, {
      id,
      name,
      rfc: stringValue(row.rfc) || '',
      contactEmail: stringValue(row.contactEmail) || '',
      contactPhone: stringValue(row.contactPhone) || '',
      priority
    });
  });
  return [...clients.values()];
}

function deriveModelsFromData(orders: Order[], batches: Batch[]): Model[] {
  const models = new Map<string, Model>();
  [...orders, ...batches].forEach((item) => {
    const row = item as Record<string, unknown>;
    const name = stringValue(row.modelName) || stringValue(row.modelo) || stringValue(row.modelId);
    if (!name) return;
    const id = stringValue(row.modelId) || name;
    models.set(id, {
      id,
      name,
      isSandalia: false,
      basePriceUSD: 0,
      densityTarget: 0,
      expansionFactor: 0,
      recommendedPrep: stringValue(row.recommendedPrep) || '',
      paintType: stringValue(row.paintType) || ''
    });
  });
  return [...models.values()];
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
    const [tenants, users, clients, models, machines, bands, defects, audits, ocrDocuments, bigzap] = await Promise.all([
      this.readStatic<Tenant>('tenants'),
      this.readStatic<UserSession>('app_users'),
      this.readStatic<Client>('clients'),
      this.readStatic<Model>('models'),
      this.readStatic<Machine>('machines'),
      this.readStatic<Band>('bands'),
      this.list('defects') as Promise<QualityDefect[]>,
      this.list('audits') as Promise<AuditLog[]>,
      this.list('ocrDocuments') as Promise<OcrDocument[]>,
      this.loadBigzap()
    ]);

    // Pedidos y lotes provienen EXCLUSIVAMENTE del FDB (bigzap). Sin fallback a
    // store manual/seed: si el FDB no trae datos, se devuelven arreglos vacios.
    const resolvedOrders = bigzap?.orders ?? [];
    const resolvedBatches = bigzap?.batches ?? [];

    return {
      tenants: tenants.length ? tenants : seedData.tenants,
      users: users.length ? users : seedData.users,
      clients: clients.length ? clients : deriveClientsFromOrders(resolvedOrders),
      models: models.length ? models : deriveModelsFromData(resolvedOrders, resolvedBatches),
      orders: resolvedOrders,
      batches: resolvedBatches,
      machines,
      bands,
      defects,
      audits,
      ocrDocuments
    };
  }

  /**
   * Lee las tarjetas viajeras activas y pedidos reales de las tablas bigzap_*.
   * Devuelve null si el esquema aun no existe o no hay datos.
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

      // PE_FECCAN es deadline, NO cancelacion: no se filtra por ella.
      const { data: pedidos, error: pErr } = await this.supabase
        .from('bigzap_pedidos')
        .select('*')
        .order('folio', { ascending: false })
        .limit(config.BIGZAP_BATCH_LIMIT);
      if (pErr && !isMissingRelation(pErr)) throw pErr;

      const { data: clientes } = await this.supabase.from('bigzap_clientes').select('codigo, nombre');
      const clienteRows = (clientes ?? []) as Array<{ codigo: string; nombre: string | null }>;
      const pedidoRows = (pedidos ?? []) as PedidoRow[];
      const clienteName = new Map<string, string | null>(clienteRows.map((c) => [c.codigo, c.nombre]));

      const batches = (tarjetas as TarjetaViajeraRow[]).map((row) => mapTarjetaToBatch(row, tenantId));
      const orders = pedidoRows.map((row) =>
        mapPedidoToOrder({ ...row, cliente_nombre: clienteName.get(row.cliente ?? '') ?? null }, tenantId)
      );
      return { batches, orders };
    } catch (error) {
      console.warn('No se pudieron cargar tarjetas viajeras de bigzap_*; no se usaran datos mock.', error);
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

/**
 * Repositorio que lee/escribe Supabase por conexion Postgres directa
 * (DATABASE_URL), el mismo credential que usa el sync-service. Es la via
 * preferida del backend; si una tabla falta, esa seccion queda vacia.
 */
export class PgRepository implements DashboardRepository {
  private get pool() {
    return getPool();
  }

  async bootstrap(): Promise<BootstrapData> {
    const [tenants, users, clients, models, machines, bands, defects, audits, ocrDocuments, bigzap] = await Promise.all([
      this.safeStatic<Tenant>('tenants'),
      this.safeStatic<UserSession>('app_users'),
      this.safeStatic<Client>('clients'),
      this.safeStatic<Model>('models'),
      this.safeStatic<Machine>('machines'),
      this.safeStatic<Band>('bands'),
      this.safeList('defects') as Promise<QualityDefect[]>,
      this.safeList('audits') as Promise<AuditLog[]>,
      this.safeList('ocrDocuments') as Promise<OcrDocument[]>,
      this.loadBigzap()
    ]);

    // Pedidos y lotes provienen EXCLUSIVAMENTE del FDB (bigzap). Sin fallback a
    // store manual/seed: si el FDB no trae datos, se devuelven arreglos vacios.
    const resolvedOrders = bigzap?.orders ?? [];
    const resolvedBatches = bigzap?.batches ?? [];

    return {
      tenants: tenants.length ? tenants : seedData.tenants,
      users: users.length ? users : seedData.users,
      clients: clients.length ? clients : deriveClientsFromOrders(resolvedOrders),
      models: models.length ? models : deriveModelsFromData(resolvedOrders, resolvedBatches),
      orders: resolvedOrders,
      batches: resolvedBatches,
      machines,
      bands,
      defects,
      audits,
      ocrDocuments
    };
  }

  async list<K extends EntityName>(entity: K): Promise<StoredEntity[]> {
    const { rows } = await this.pool.query<{ payload: StoredEntity }>(
      `select payload from public.${tableMap[entity]} order by updated_at desc`
    );
    return rows.map((row) => row.payload);
  }

  async get<K extends EntityName>(entity: K, id: string): Promise<StoredEntity | null> {
    const { rows } = await this.pool.query<{ payload: StoredEntity }>(
      `select payload from public.${tableMap[entity]} where id = $1 limit 1`,
      [id]
    );
    return rows[0]?.payload ?? null;
  }

  async create<K extends EntityName>(entity: K, payload: StoredEntity): Promise<StoredEntity> {
    const tenantId = 'tenantId' in payload ? String((payload as { tenantId?: unknown }).tenantId) : null;
    await this.pool.query(
      `insert into public.${tableMap[entity]} (id, tenant_id, payload, updated_at)
       values ($1, $2, $3::jsonb, now())
       on conflict (id) do update set tenant_id = excluded.tenant_id, payload = excluded.payload, updated_at = now()`,
      [payload.id, tenantId, JSON.stringify(payload)]
    );
    return payload;
  }

  async patch<K extends EntityName>(entity: K, id: string, patch: Record<string, unknown>): Promise<StoredEntity | null> {
    const existing = await this.get(entity, id);
    if (!existing) return null;
    const updated = { ...existing, ...patch } as StoredEntity;
    await this.create(entity, updated);
    return updated;
  }

  private async readStatic<T>(table: string): Promise<T[]> {
    const { rows } = await this.pool.query<{ payload: T }>(`select payload from public.${table} order by id asc`);
    return rows.map((row) => row.payload);
  }

  private async safeStatic<T>(table: string): Promise<T[]> {
    try {
      return await this.readStatic<T>(table);
    } catch (error) {
      console.warn(`bootstrap: lectura de ${table} fallo, seccion vacia.`, (error as Error).message);
      return [];
    }
  }

  private async safeList<K extends EntityName>(entity: K): Promise<StoredEntity[]> {
    try {
      return await this.list(entity);
    } catch (error) {
      console.warn(`bootstrap: lectura de ${entity} fallo, seccion vacia.`, (error as Error).message);
      return [];
    }
  }

  private async loadBigzap(): Promise<{ batches: Batch[]; orders: Order[] } | null> {
    const tenantId = config.DEFAULT_TENANT_ID as TenantId;
    try {
      const sinceIso = new Date(Date.now() - config.BIGZAP_ACTIVE_DAYS * 86_400_000).toISOString();
      const tarjetas = await this.pool.query<TarjetaViajeraRow>(
        `select * from public.tarjetas_viajeras
         where cancelado = false and (status_depto <> '50' or ultimo_escaneo >= $1)
         order by ultimo_escaneo desc nulls last
         limit $2`,
        [sinceIso, config.BIGZAP_BATCH_LIMIT]
      );
      if (tarjetas.rows.length === 0) return null;

      // PE_FECCAN es deadline, NO cancelacion: no se filtra por ella.
      const pedidos = await this.pool.query<PedidoRow>(
        `select * from public.bigzap_pedidos order by folio desc limit $1`,
        [config.BIGZAP_BATCH_LIMIT]
      );
      const clientes = await this.pool.query<{ codigo: string; nombre: string | null }>(
        'select codigo, nombre from public.bigzap_clientes'
      );
      // Pares reales por pedido agregados desde sus lotes (los headers vienen en 0).
      const paresAgg = await this.pool.query<{ pedido: number; total: number; entregados: number }>(
        `select lp.pedido,
                sum(coalesce(lp.pares, 0))::int as total,
                sum(case when l.status_depto in ('40','50') then coalesce(lp.pares, 0) else 0 end)::int as entregados
         from public.bigzap_lotes_pedidos lp
         join public.bigzap_lotes l on l.programa = lp.programa and l.lote = lp.lote
         where l.cancelado = false
         group by lp.pedido`
      );
      const clienteRows = clientes.rows as Array<{ codigo: string; nombre: string | null }>;
      const paresRows = paresAgg.rows as Array<{ pedido: number; total: number; entregados: number }>;
      const pedidoRows = pedidos.rows as PedidoRow[];
      const tarjetaRows = tarjetas.rows as TarjetaViajeraRow[];
      const clienteName = new Map<string, string | null>(clienteRows.map((c) => [c.codigo, c.nombre]));
      const paresByPedido = new Map<number, { pedido: number; total: number; entregados: number }>(paresRows.map((r) => [r.pedido, r]));

      const batches = tarjetaRows.map((row) => mapTarjetaToBatch(row, tenantId));
      const orders = pedidoRows.map((row) => {
        const agg = paresByPedido.get(row.folio);
        return mapPedidoToOrder(
          {
            ...row,
            cliente_nombre: clienteName.get(row.cliente ?? '') ?? null,
            pares_lotes_total: agg?.total ?? null,
            pares_lotes_entregados: agg?.entregados ?? null
          },
          tenantId
        );
      });
      return { batches, orders };
    } catch (error) {
      if (isMissingRelation(error)) return null;
      console.warn('No se pudieron cargar tarjetas viajeras (pg); no se usaran datos mock.', (error as Error).message);
      return null;
    }
  }
}
