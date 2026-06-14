import type { AuditLog, Band, Batch, Client, Machine, Model, Order, QualityDefect, StageId, TenantId, Tenant, UserSession } from '../types';
import { getStoredString, removeStoredItem, setStoredString } from '../utils/storage';

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

export type DeliveryRisk = 'VENCIDO' | 'ALTO' | 'MEDIO' | 'BAJO';
export type StageSaturation = 'OPTIMO' | 'SATURADO' | 'CRITICO';

export interface WipSummary {
  activeBatches: number;
  activePairs: number;
  globalProgress: number;
}

export interface StagePipelineRow {
  stageId: StageId;
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
  dominantStage: StageId;
  risk: DeliveryRisk;
  pairsByStage: Record<StageId, number>;
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
  catalogs: {
    clients: Array<Record<string, unknown>>;
    models: Array<Record<string, unknown>>;
    departments: Array<Record<string, unknown>>;
  };
  dailyProduction: DailyProductionRow[];
  wipSummary: WipSummary;
  stagePipeline: StagePipelineRow[];
  orderRisk: OrderRiskSummary;
  orderPipeline: OrderPipelineRow[];
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'plasyect_api_token';
let tokenPromise: Promise<string> | null = null;
let refreshedThisSession = false;

export interface BootstrapResponse {
  tenants: Tenant[];
  users: UserSession[];
  clients: Client[];
  models: Model[];
  orders: Order[];
  batches: Batch[];
  machines: Machine[];
  bands: Band[];
  defects: QualityDefect[];
  audits: AuditLog[];
  ocrDocuments?: unknown[];
}

export const backendEnabled = Boolean(API_BASE_URL);

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  if (!backendEnabled) throw new Error('Backend disabled');
  const token = await getToken();
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  headers.set('Authorization', `Bearer ${token}`);

  const response = await fetch(`${API_BASE_URL}${path}`, { ...options, headers });
  if (response.status === 401 && retry) {
    removeStoredItem(TOKEN_KEY);
    refreshedThisSession = false;
    return request<T>(path, options, false);
  }
  if (!response.ok) throw new Error(`API ${response.status}: ${path}`);
  return response.json();
}

async function getToken(): Promise<string> {
  if (tokenPromise) return tokenPromise;
  const saved = getStoredString(TOKEN_KEY);
  if (saved && refreshedThisSession) return saved;
  tokenPromise = refreshToken().finally(() => {
    tokenPromise = null;
  });
  return tokenPromise;
}

async function refreshToken(): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/api/auth/auto`, { method: 'POST' });
  if (!response.ok) throw new Error(`Auto auth failed: ${response.status}`);
  const data = await response.json();
  setStoredString(TOKEN_KEY, data.token);
  refreshedThisSession = true;
  return data.token;
}

function post<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(payload) });
}

function patch<T>(path: string, payload: unknown): Promise<T> {
  return request<T>(path, { method: 'PATCH', body: JSON.stringify(payload) });
}

export const dashboardApi = {
  bootstrap: () => request<BootstrapResponse>('/api/bootstrap'),
  createOrder: (order: Order) => post<Order>('/api/orders', order),
  updateOrderDiscount: (orderId: string, discountPercentage: number, discountAuthorized: boolean) =>
    patch<Order>(`/api/orders/${encodeURIComponent(orderId)}/discount`, { discountPercentage, discountAuthorized }),
  createBatch: (batch: Batch) => post<Batch>('/api/batches', batch),
  moveBatchStage: (batchId: string, stage: Batch['stage']) =>
    patch<Batch>(`/api/batches/${encodeURIComponent(batchId)}/stage`, { stage }),
  updateBatchStatus: (batchId: string, status: Batch['status']) =>
    patch<Batch>(`/api/batches/${encodeURIComponent(batchId)}/status`, { status }),
  archiveBatch: (batchId: string) =>
    request<Batch>(`/api/batches/${encodeURIComponent(batchId)}`, { method: 'DELETE' }),
  restoreBatch: (batchId: string) =>
    patch<Batch>(`/api/batches/${encodeURIComponent(batchId)}/restore`, {}),
  createDefect: (defect: QualityDefect) => post<QualityDefect>('/api/defects', defect),
  resolveDefect: (defectId: string) =>
    patch<QualityDefect>(`/api/defects/${encodeURIComponent(defectId)}/resolve`, {}),
  createAudit: (audit: AuditLog) => post<AuditLog>('/api/audits', audit),

  // Tarjetas viajeras reales (ERP BixApp via sync-service)
  erpTarjetas: (params: { limit?: number; status?: string; stage?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.status) qs.set('status', params.status);
    if (params.stage) qs.set('stage', params.stage);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<unknown[]>(`/api/erp/tarjetas${suffix}`);
  },
  erpTarjeta: (id: string) => request<unknown>(`/api/erp/tarjetas/${encodeURIComponent(id)}`),
  erpSyncStatus: () => request<unknown>('/api/erp/sync/status'),
  erpEjecutivo: (fechaInicio: string, fechaFin: string) => {
    const qs = new URLSearchParams({ fechaInicio, fechaFin });
    return request<EjecutivoData>(`/api/erp/ejecutivo?${qs}`);
  },
  erpOperativo: (fechaInicio: string, fechaFin: string) => {
    const qs = new URLSearchParams({ fechaInicio, fechaFin });
    return request<ErpOperationalResponse>(`/api/erp/operativo?${qs}`);
  },
  erpMovimientos: (fechaInicio: string, fechaFin: string, limit = 50) => {
    const qs = new URLSearchParams({ fechaInicio, fechaFin, limit: String(limit) });
    return request<MovimientoRow[]>(`/api/erp/movimientos?${qs}`);
  }
};

export function sendApiMutation(task: Promise<unknown>): void {
  task.catch((error) => {
    if (backendEnabled) console.warn('Backend sync failed', error);
  });
}
