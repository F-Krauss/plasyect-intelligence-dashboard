/**
 * Types for Plasyect Intelligence Dashboard
 */

export type Role = 
  | 'DIRECTOR_GENERAL' 
  | 'LIDER_ADMINISTRACION' 
  | 'LIDER_INYECCION' 
  | 'SUPERVISOR_CALIDAD';

export interface UserSession {
  username: string;
  email: string;
  role: Role;
  require2FA: boolean;
  has2FAVerified: boolean;
}

export type TenantId = 'plasyect_matriz' | 'plasyect_suelas' | 'plasyect_sandalias';

export interface Tenant {
  id: TenantId;
  name: string;
  location: string;
  primaryColor: string;
}

export type StageId = 
  | 'alta_pedido' 
  | 'almacen' 
  | 'inyeccion' 
  | 'estabilizacion' 
  | 'aduana' 
  | 'banda' 
  | 'embarque';

export interface Stage {
  id: StageId;
  name: string;
  order: number;
  color: string; // Tailwind hex or class name
  description: string;
}

export interface Model {
  id: string;
  name: string;
  isSandalia: boolean;
  basePriceUSD: number;
  densityTarget: number; // e.g., 0.25 g/cm3
  expansionFactor: number; // e.g., 1.55 (EVA expansion)
  recommendedPrep: string;
  paintType: string;
}

export interface Client {
  id: string;
  name: string;
  rfc: string;
  contactEmail: string;
  contactPhone: string;
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
}

export interface Order {
  id: string;
  tenantId: TenantId;
  clientId: string;
  clientName: string;
  modelId: string;
  modelName: string;
  color: string;
  quantity: number;
  exchangeRate: number; // Conversion rate to MXN saved per order
  totalUSD: number;
  totalMXN: number;
  createdAt: string;
  deliveryDate: string;
  status: 'PENDIENTE' | 'PROCESANDO' | 'COMPLETADO' | 'CANCELADO';
  discountAuthorized: boolean;
  discountPercentage: number;

  // Spanish / Realistic Mock properties
  idPedido?: string;
  cliente?: string;
  oc?: string;
  fechaAlta?: string;
  fechaCompromiso?: string;
  totalPares?: number;
  estatus?: 'PENDIENTE' | 'PROCESANDO' | 'COMPLETADO' | 'CANCELADO';
  prioridad?: 'ALTA' | 'MEDIA' | 'BAJA';
  responsable?: string;
  porcentajeAvance?: number;
  riesgoEntrega?: 'BAJO' | 'MEDIO' | 'ALTO' | 'VENCIDO';
}

export interface Batch {
  id: string; // e.g., LOTE-2026-001
  tenantId: TenantId;
  orderId: string;
  modelId: string;
  modelName: string;
  color: string;
  size: number;
  quantityShoes: number;
  stage: StageId;
  machineId?: string;
  bandId?: string;
  operatorId: string;
  densityMeasured: number;
  shrinkageRatio: number;
  temperatureTarget: number;
  cycleTimeSeconds: number;
  status: 'OPTIMO' | 'ALERTA' | 'CRITICO' | 'DETENIDO' | 'ARCHIVADO';
  archivedAt?: string; // Soft delete tracking
  defectRate: number;
  lastUpdate: string;

  // Spanish / Realistic Mock properties
  idLote?: string;
  tarjetaViajera?: string;
  codigoBarras?: string;
  cliente?: string;
  modelo?: string;
  totalPares?: number;
  etapaActual?: StageId;
  paresEnEtapa?: number;
  fechaAlta?: string;
  fechaCompromiso?: string;
  ultimoEscaneo?: string;
  tiempoEnEtapaMinutos?: number;
  porcentajeAvance?: number;
  estatus?: 'OPTIMO' | 'ALERTA' | 'CRITICO' | 'DETENIDO' | 'ARCHIVADO';
  responsableActual?: string;
  observaciones?: string;
}

export interface Machine {
  id: string;
  name: string;
  type: 'INYECTORA' | 'MOLDEADORA' | 'MEZCLADORA';
  status: 'OPERANDO' | 'MANTENIMIENTO' | 'INACTIVA';
  temperature: number;
  pressureBar: number;
  clampingForceTons: number;
  currentBatchId?: string;
}

export interface Band {
  id: string;
  name: string;
  status: 'ACTIVA' | 'DETENIDA' | 'MANTENIMIENTO';
  speedMs: number;
  currentBatchId?: string;
  inspectorId: string;
}

export interface QualityDefect {
  id: string;
  batchId: string;
  defectType: 'BURBUJA' | 'RECHUPE' | 'DEFORMACION' | 'MANCHA' | 'POROSIDAD' | 'FALTA_LLENADO';
  severity: 'LEVE' | 'MODERADO' | 'GRAVE';
  detectedAt: string;
  inspectorName: string;
  notes: string;
  resolved: boolean;
}

export interface AuditLog {
  id: string;
  tenantId: TenantId;
  timestamp: string;
  userId: string;
  userRole: Role;
  event: string;
  module: string;
  details: string;
}

export interface OfflineQueueItem {
  id: string;
  action: string;
  payload: any;
  timestamp: string;
}

export interface MovementStage {
  idMovimiento: string;
  idLote: string;
  etapa: string;
  fechaEntrada: string;
  fechaSalida: string | null;
  pares: number;
  usuarioEscaneo: string;
  duracionMinutos: number;
}

export interface QualityRecord {
  fecha: string;
  turno: '1' | '2' | '3';
  area: 'INYECCION' | 'BANDA';
  maquinaOBanda: string;
  inspector: string;
  lider: string;
  lote: string;
  modelo: string;
  color: string;
  talla: number;
  totalInspeccionado: number;
  primeras: number;
  segundas: number;
  reproceso: number;
  merma: number;
  defecto?: string;
  cantidadDefecto?: number;
  porcentajeDefectivo: number;
}

export interface HourlyProduction {
  area: 'INYECCION' | 'BANDA' | 'ESTABILIZACION';
  fecha: string;
  hora: string;
  turno: '1' | '2' | '3';
  metaHora: number;
  produccionReal: number;
  eficiencia: number; // e.g., percentage 0-100
  modelo: string;
  color: string;
  responsable: string;
}
