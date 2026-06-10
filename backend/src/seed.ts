import type { AuditLog, Band, Batch, BootstrapData, Client, Machine, Model, Order, Tenant, UserSession } from './domain.js';

export const defaultUser: UserSession = {
  username: 'Luis Felipe Bedia',
  email: 'lf.bedia@gmail.com',
  role: 'DIRECTOR_GENERAL',
  require2FA: true,
  has2FAVerified: true
};

const tenants: Tenant[] = [
  { id: 'plasyect_matriz', name: 'Plasyect Matriz - EVA Sandalias', location: 'Leon, Gto. Planta Central', primaryColor: 'indigo' },
  { id: 'plasyect_suelas', name: 'Plasyect Division Suelas', location: 'San Francisco del Rincon, Gto.', primaryColor: 'emerald' },
  { id: 'plasyect_sandalias', name: 'Plasyect Inyeccion Directa', location: 'Purisima del Rincon, Gto.', primaryColor: 'sky' }
];

const clients: Client[] = [
  { id: 'cli_flexi', name: 'Grupo Flexi S.A. de C.V.', rfc: 'GFL840315M98', contactEmail: 'eva.supply@flexi.com.mx', contactPhone: '477-710-1000', priority: 'ALTA' },
  { id: 'cli_price', name: 'Price Shoes S.A. de C.V.', rfc: 'PSO961205K12', contactEmail: 'embarques@priceshoes.com', contactPhone: '555-667-8899', priority: 'MEDIA' },
  { id: 'cli_zalisca', name: 'Zalisca Calzado', rfc: 'ZAL950811AB4', contactEmail: 'compras@zalisca.mx', contactPhone: '477-123-4567', priority: 'ALTA' }
];

const models: Model[] = [
  { id: 'mod_spider', name: 'Spider', isSandalia: true, basePriceUSD: 3.2, densityTarget: 0.24, expansionFactor: 1.58, recommendedPrep: 'Limpieza con solvente suave y flameado', paintType: 'Laca poliuretano base agua' },
  { id: 'mod_snap', name: 'Snap', isSandalia: true, basePriceUSD: 2.5, densityTarget: 0.25, expansionFactor: 1.55, recommendedPrep: 'Flameado estandar', paintType: 'Poliuretano catalizado' },
  { id: 'mod_suela_comfort', name: 'Suela Comfort', isSandalia: false, basePriceUSD: 3.1, densityTarget: 0.25, expansionFactor: 1.52, recommendedPrep: 'Lijado ligero', paintType: 'Poliuretano base agua' }
];

const orders: Order[] = [
  makeOrder('PED-2026-201', 'plasyect_matriz', clients[0], models[0], 'Negro', 6000, 62),
  makeOrder('PED-2026-202', 'plasyect_suelas', clients[1], models[2], 'Arena', 4500, 38),
  makeOrder('PED-2026-203', 'plasyect_sandalias', clients[2], models[1], 'Rosa Bebe', 5200, 78)
];

const batches: Batch[] = [
  makeBatch('LOTE-26-401', orders[0], 'inyeccion', 'OPTIMO', 2500),
  makeBatch('LOTE-26-402', orders[0], 'aduana', 'ALERTA', 2500),
  makeBatch('LOTE-26-403', orders[1], 'almacen', 'OPTIMO', 2250),
  makeBatch('LOTE-26-404', orders[1], 'banda', 'CRITICO', 2250),
  makeBatch('LOTE-26-405', orders[2], 'estabilizacion', 'OPTIMO', 2600),
  makeBatch('LOTE-26-406', orders[2], 'embarque', 'ENTREGADO', 2600)
];

const machines: Machine[] = [
  { id: 'maq_1', name: 'Inyectora EVA 01', type: 'INYECTORA', status: 'OPERANDO', temperature: 172, pressureBar: 110, clampingForceTons: 180, currentBatchId: 'LOTE-26-401' },
  { id: 'maq_2', name: 'Inyectora EVA 02', type: 'INYECTORA', status: 'MANTENIMIENTO', temperature: 0, pressureBar: 0, clampingForceTons: 160 }
];

const bands: Band[] = [
  { id: 'banda_a', name: 'Banda A', status: 'ACTIVA', speedMs: 0.8, currentBatchId: 'LOTE-26-404', inspectorId: 'calidad_1' },
  { id: 'banda_b', name: 'Banda B', status: 'ACTIVA', speedMs: 0.7, inspectorId: 'calidad_2' }
];

const audits: AuditLog[] = [
  { id: 'aud_seed_1', tenantId: 'plasyect_matriz', timestamp: new Date().toISOString(), userId: defaultUser.email, userRole: defaultUser.role, event: 'BACKEND_SEEDED', module: 'SYSTEM', details: 'Datos iniciales cargados.' }
];

export const seedData: BootstrapData = {
  tenants,
  users: [defaultUser],
  clients,
  models,
  orders,
  batches,
  machines,
  bands,
  defects: [
    { id: 'def_seed_1', batchId: 'LOTE-26-404', defectType: 'BURBUJA', severity: 'GRAVE', detectedAt: new Date().toISOString(), inspectorName: 'Inspector Turno', notes: 'Validacion inicial', resolved: false }
  ],
  audits,
  ocrDocuments: []
};

function makeOrder(id: string, tenantId: Tenant['id'], client: Client, model: Model, color: string, quantity: number, progress: number): Order {
  const createdAt = new Date('2026-05-20T12:00:00.000Z').toISOString();
  const deliveryDate = new Date('2026-06-20T12:00:00.000Z').toISOString();
  const totalUSD = Math.round(quantity * model.basePriceUSD);
  const exchangeRate = 18.45;
  return {
    id,
    tenantId,
    clientId: client.id,
    clientName: client.name,
    modelId: model.id,
    modelName: model.name,
    color,
    quantity,
    exchangeRate,
    totalUSD,
    totalMXN: Math.round(totalUSD * exchangeRate),
    createdAt,
    deliveryDate,
    status: 'PROCESANDO',
    discountAuthorized: false,
    discountPercentage: 0,
    idPedido: id,
    cliente: client.name,
    oc: `OC-${id.slice(-3)}`,
    fechaAlta: createdAt,
    fechaCompromiso: deliveryDate,
    totalPares: quantity,
    estatus: 'PROCESANDO',
    prioridad: client.priority,
    responsable: 'Luis Felipe Bedia',
    porcentajeAvance: progress,
    riesgoEntrega: progress > 70 ? 'BAJO' : 'MEDIO'
  };
}

function makeBatch(id: string, order: Order, stage: string, status: string, quantity: number): Batch {
  return {
    id,
    tenantId: order.tenantId,
    orderId: order.id,
    modelId: String(order.modelId),
    modelName: String(order.modelName),
    color: String(order.color),
    size: 26,
    quantityShoes: quantity,
    stage,
    operatorId: 'Operador Central',
    densityMeasured: stage === 'almacen' ? 0 : 0.24,
    shrinkageRatio: 1.55,
    temperatureTarget: 170,
    cycleTimeSeconds: 220,
    status,
    defectRate: status === 'CRITICO' ? 4.8 : status === 'ALERTA' ? 2.3 : 0.4,
    lastUpdate: new Date().toISOString(),
    idLote: id,
    tarjetaViajera: `TV-${id}`,
    codigoBarras: `7500123${id.slice(-3)}`,
    cliente: String(order.clientName),
    modelo: String(order.modelName),
    totalPares: quantity,
    etapaActual: stage,
    paresEnEtapa: quantity,
    fechaAlta: String(order.createdAt),
    fechaCompromiso: String(order.deliveryDate),
    ultimoEscaneo: new Date().toISOString(),
    porcentajeAvance: Number(order.porcentajeAvance),
    estatus: status,
    responsableActual: 'Operador Central'
  };
}
