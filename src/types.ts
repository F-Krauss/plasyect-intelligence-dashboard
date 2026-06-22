/**
 * Types for Plasyect Intelligence Dashboard
 */

export type Role = 
  | 'DIRECTOR_GENERAL' 
  | 'LIDER_ADMINISTRACION' 
  | 'LIDER_INYECCION' 
  | 'SUPERVISOR_CALIDAD';

export type PermissionKey =
  | 'dashboard.view'
  | 'pipeline_lote.view'
  | 'pipeline_pedido.view'
  | 'produccion_area.view'
  | 'modelos_productos.view'
  | 'calidad.view'
  | 'inyeccion.view'
  | 'banda.view'
  | 'aduana_liberacion.view'
  | 'embarque.view'
  | 'ocr_validacion.view'
  | 'reportes_historicos.view'
  | 'catalogos.view'
  | 'configuracion.view'
  | 'produccion_area.create_log'
  | 'produccion_area.export'
  | 'inyeccion.create_log'
  | 'inyeccion.export'
  | 'banda.create_log'
  | 'banda.export'
  | 'configuracion.manage_users'
  | 'configuracion.manage_permissions'
  | 'configuracion.manage_goals'
  | 'configuracion.manage_turns';

export type ProductionAreaId =
  | 'almacen'
  | 'inyeccion'
  | 'aduana'
  | 'banda'
  | 'embarque'
  | 'facturacion'
  | 'entregas'
  | 'salidas_tercera';

export interface UserSession {
  username: string;
  email: string;
  role: Role;
  require2FA: boolean;
  has2FAVerified: boolean;
}

export interface AppUser {
  id: string;
  tenantId: TenantId;
  username: string;
  password: string;
  roles: Role[];
  permissionOverrides: Partial<Record<PermissionKey, boolean>>;
  active: boolean;
}

export interface ProductionTurn {
  id: string;
  tenantId: TenantId;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  active: boolean;
  responsableUserId?: string;
  areaId?: ProductionAreaId;
}

export interface SemaphoreConfig {
  greenDays: number;
  yellowDays: number;
  redDays: number;
}

export interface ProductionGoal {
  id: string;
  tenantId: TenantId;
  area: ProductionAreaId;
  turnId: string;
  metaHora: number;
  metaTurno: number;
  responsableUserId: string;
  active: boolean;
}

// Single-tenant: la empresa real (BixApp/BigZap no tiene dimensión de tenant).
export type TenantId = 'plasyect_matriz';

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
  | 'embarque'
  | 'facturacion';

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
  status: 'PENDIENTE' | 'PROCESANDO' | 'COMPLETADO' | 'CANCELADO' | 'ENTREGADO';
  discountAuthorized: boolean;
  discountPercentage: number;

  // Campos opcionales en español poblados desde FDB / OCR
  idPedido?: string;
  cliente?: string;
  oc?: string;
  fechaAlta?: string;
  fechaCompromiso?: string;
  totalPares?: number;
  estatus?: 'PENDIENTE' | 'PROCESANDO' | 'COMPLETADO' | 'CANCELADO' | 'ENTREGADO';
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
  status: 'OPTIMO' | 'ALERTA' | 'CRITICO' | 'DETENIDO' | 'ARCHIVADO' | 'ENTREGADO';
  archivedAt?: string; // Soft delete tracking
  defectRate: number;
  lastUpdate: string;

  // Campos opcionales en español poblados desde FDB / OCR
  idLote?: string;
  programa?: number;
  lote?: number;
  tarjetaViajera?: string;
  codigoBarras?: string;
  cliente?: string;
  oc?: string;
  modelo?: string;
  totalPares?: number;
  etapaActual?: StageId;
  paresEnEtapa?: number;
  fechaAlta?: string;
  fechaCompromiso?: string;
  ultimoEscaneo?: string;
  tiempoEnEtapaMinutos?: number;
  porcentajeAvance?: number;
  estatus?: 'OPTIMO' | 'ALERTA' | 'CRITICO' | 'DETENIDO' | 'ARCHIVADO' | 'ENTREGADO';
  responsableActual?: string;
  observaciones?: string;
  corrida?: string;
  tarjetaImpresa?: boolean;
  paresPorTalla?: Record<string, number>;

  // Zona previa / actual reales tomadas de los escaneos de la Tarjeta Viajera (ERP BixApp).
  // Cuando vienen del ERP llevan el nombre del departamento (DEPA); si no, la vista las
  // deriva del orden de etapas.
  zonaPrevia?: string;
  zonaActual?: string;
  // Marca el origen del lote: 'erp' = tarjeta viajera real sincronizada desde Firebird.
  source?: 'erp' | 'ocr';
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
