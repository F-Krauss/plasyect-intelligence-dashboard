export type Role =
  | 'DIRECTOR_GENERAL'
  | 'LIDER_ADMINISTRACION'
  | 'LIDER_INYECCION'
  | 'SUPERVISOR_CALIDAD';

export type TenantId = 'plasyect_matriz' | 'plasyect_suelas' | 'plasyect_sandalias';
export type StageId = 'alta_pedido' | 'almacen' | 'inyeccion' | 'estabilizacion' | 'aduana' | 'banda' | 'embarque';

export interface UserSession {
  username: string;
  email: string;
  role: Role;
  require2FA: boolean;
  has2FAVerified: boolean;
}

export interface Tenant {
  id: TenantId;
  name: string;
  location: string;
  primaryColor: string;
}

export interface Client {
  id: string;
  name: string;
  rfc: string;
  contactEmail: string;
  contactPhone: string;
  priority: 'ALTA' | 'MEDIA' | 'BAJA';
}

export interface Model {
  id: string;
  name: string;
  isSandalia: boolean;
  basePriceUSD: number;
  densityTarget: number;
  expansionFactor: number;
  recommendedPrep: string;
  paintType: string;
}

export type Order = Record<string, unknown> & { id: string; tenantId: TenantId };
export type Batch = Record<string, unknown> & { id: string; tenantId: TenantId; orderId?: string };
export type Machine = Record<string, unknown> & { id: string };
export type Band = Record<string, unknown> & { id: string };
export type QualityDefect = Record<string, unknown> & { id: string; batchId: string };
export type AuditLog = Record<string, unknown> & { id: string; tenantId: TenantId };
export type OcrDocument = Record<string, unknown> & { id: string; tenantId: TenantId };

export interface BootstrapData {
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
  ocrDocuments: OcrDocument[];
}
