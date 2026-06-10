import type { AuditLog, Band, Batch, Client, Machine, Model, Order, QualityDefect, StageId, TenantId, Tenant, UserSession } from '../types';

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

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const TOKEN_KEY = 'plasyect_api_token';

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
    localStorage.removeItem(TOKEN_KEY);
    return request<T>(path, options, false);
  }
  if (!response.ok) throw new Error(`API ${response.status}: ${path}`);
  return response.json();
}

async function getToken(): Promise<string> {
  const saved = localStorage.getItem(TOKEN_KEY);
  if (saved) return saved;
  const response = await fetch(`${API_BASE_URL}/api/auth/auto`, { method: 'POST' });
  if (!response.ok) throw new Error(`Auto auth failed: ${response.status}`);
  const data = await response.json();
  localStorage.setItem(TOKEN_KEY, data.token);
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
  }
};

export function sendApiMutation(task: Promise<unknown>): void {
  task.catch((error) => {
    if (backendEnabled) console.warn('Backend sync failed', error);
  });
}
