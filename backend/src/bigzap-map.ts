import type { Batch, Order, TenantId } from './domain.js';

/**
 * Convierte las tarjetas viajeras / pedidos reales de BixApp (sincronizados en
 * las tablas bigzap_* por sync-service) al shape que ya consume el dashboard
 * (Batch / Order con sus campos en espanol). Asi el frontend funciona con datos
 * reales sin cambios.
 */

type StageId = 'alta_pedido' | 'almacen' | 'inyeccion' | 'estabilizacion' | 'aduana' | 'banda' | 'embarque';

const STAGE_ORDER: StageId[] = [
  'alta_pedido',
  'almacen',
  'inyeccion',
  'estabilizacion',
  'aduana',
  'banda',
  'embarque'
];

// Respaldo por si la vista no trae stage_id (departamento sin fila en catalogo).
const DEPTO_STAGE: Record<string, StageId> = {
  '01': 'alta_pedido',
  '10': 'almacen',
  '15': 'inyeccion',
  '20': 'aduana',
  '25': 'aduana',
  '30': 'banda',
  '35': 'banda',
  '39': 'banda',
  '40': 'embarque',
  '50': 'embarque'
};

export interface TarjetaViajeraRow {
  tarjeta: string;
  programa: number;
  lote: number;
  estilo: string | null;
  estilo_nombre: string | null;
  piecol: string | null;
  combina: string | null;
  corrida: string | null;
  pares: number | null;
  fecha_programacion: string | null;
  status_depto: string | null;
  status_depto_nombre: string | null;
  stage_id: string | null;
  zona_actual: string | null;
  zona_actual_nombre: string | null;
  zona_previa: string | null;
  zona_previa_nombre: string | null;
  ultimo_escaneo: string | null;
  cancelado: boolean | null;
  tarjeta_impresa: boolean | null;
  pares_por_talla: Record<string, number> | null;
  pedido_folio: number | null;
  cliente_codigo: string | null;
  cliente_nombre: string | null;
  pedido_oc: string | null;
  pedido_fecha_salida: string | null;
}

export interface PedidoRow {
  folio: number;
  cliente: string | null;
  cliente_nombre?: string | null;
  fecha_pedido: string | null;
  fecha_recepcion: string | null;
  fecha_salida: string | null;
  // OJO: en BixApp PE_FECCAN es la FECHA LIMITE de cancelacion (deadline),
  // no un evento de cancelacion: viene poblada en todos los pedidos. No se usa
  // para marcar el pedido como cancelado.
  fecha_cancelacion: string | null;
  pares_pedidos: number | null;
  pares_facturados: number | null;
  pedido_cliente: string | null;
  tienda: string | null;
  temporada: string | null;
  // Pares reales agregados desde los lotes del pedido (los headers PEDIDOS
  // suelen traer PE_PARPED/PE_PARFAC en 0). Si vienen, mandan sobre los headers.
  pares_lotes_total?: number | null;
  pares_lotes_entregados?: number | null;
}

function resolveStage(row: TarjetaViajeraRow): StageId {
  if (row.stage_id && STAGE_ORDER.includes(row.stage_id as StageId)) return row.stage_id as StageId;
  if (row.status_depto && DEPTO_STAGE[row.status_depto]) return DEPTO_STAGE[row.status_depto];
  if (row.zona_actual && DEPTO_STAGE[row.zona_actual]) return DEPTO_STAGE[row.zona_actual];
  return 'inyeccion';
}

function stageProgress(stage: StageId): number {
  const idx = STAGE_ORDER.indexOf(stage);
  return Math.round(((idx + 1) / STAGE_ORDER.length) * 100);
}

function minutesSince(iso: string | null): number | undefined {
  if (!iso) return undefined;
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return undefined;
  return Math.max(0, Math.round((Date.now() - then) / 60000));
}

function deliveryRisk(fechaSalida: string | null, entregado: boolean): 'BAJO' | 'MEDIO' | 'ALTO' | 'VENCIDO' {
  if (entregado || !fechaSalida) return 'BAJO';
  const due = new Date(fechaSalida).getTime();
  if (Number.isNaN(due)) return 'BAJO';
  const days = (due - Date.now()) / (24 * 3600 * 1000);
  if (days < 0) return 'VENCIDO';
  if (days < 3) return 'ALTO';
  if (days < 7) return 'MEDIO';
  return 'BAJO';
}

export function mapTarjetaToBatch(row: TarjetaViajeraRow, tenantId: TenantId): Batch {
  const stage = resolveStage(row);
  const entregado = stage === 'embarque' || row.status_depto === '40' || row.status_depto === '50';
  const cancelado = row.cancelado === true;
  const status: string = cancelado ? 'ARCHIVADO' : entregado ? 'ENTREGADO' : 'OPTIMO';
  const pares = row.pares ?? 0;
  const modelName = row.estilo_nombre || row.estilo || 'S/Modelo';
  const clienteNombre = row.cliente_nombre || row.cliente_codigo || 'S/Cliente';
  const orderId = row.pedido_folio != null ? `PED-${row.pedido_folio}` : `LOTE-${row.tarjeta}`;
  const fechaCompromiso = row.pedido_fecha_salida;

  return {
    id: row.tarjeta,
    tenantId,
    orderId,
    oc: row.pedido_oc ?? undefined,
    modelId: row.estilo || 'estilo_desconocido',
    modelName,
    color: row.piecol || row.combina || 'N/D',
    size: 0,
    quantityShoes: pares,
    stage,
    operatorId: '—',
    densityMeasured: 0,
    shrinkageRatio: 0,
    temperatureTarget: 0,
    cycleTimeSeconds: 0,
    status,
    defectRate: 0,
    lastUpdate: row.ultimo_escaneo || row.fecha_programacion || new Date().toISOString(),

    // Campos en espanol que usa el pipeline por lote
    idLote: row.tarjeta,
    programa: row.programa,
    lote: row.lote,
    tarjetaViajera: row.tarjeta,
    codigoBarras: row.tarjeta,
    cliente: clienteNombre,
    modelo: modelName,
    totalPares: pares,
    etapaActual: stage,
    paresEnEtapa: pares,
    fechaAlta: row.fecha_programacion ?? undefined,
    fechaCompromiso: fechaCompromiso ?? undefined,
    ultimoEscaneo: row.ultimo_escaneo ?? undefined,
    tiempoEnEtapaMinutos: minutesSince(row.ultimo_escaneo),
    porcentajeAvance: stageProgress(stage),
    estatus: status,
    responsableActual: undefined,
    observaciones: cancelado ? 'Lote cancelado en BixApp.' : undefined,

    // Zona previa / actual reales (escaneos), para rastreo en tiempo real
    zonaActual: row.zona_actual_nombre || row.status_depto_nombre || undefined,
    zonaPrevia: row.zona_previa_nombre || undefined,
    corrida: row.corrida ?? undefined,
    tarjetaImpresa: row.tarjeta_impresa ?? undefined,
    paresPorTalla: row.pares_por_talla ?? undefined,
    source: 'big_zap_fdb'
  } as Batch;
}

export function mapPedidoToOrder(row: PedidoRow, tenantId: TenantId): Order {
  // Pares reales: preferir el agregado de lotes; si no, los headers del pedido.
  const totalPares = row.pares_lotes_total ?? row.pares_pedidos ?? 0;
  const paresEntregados = row.pares_lotes_entregados ?? row.pares_facturados ?? 0;
  const avance = totalPares > 0 ? Math.min(100, Math.round((paresEntregados / totalPares) * 100)) : 0;
  const entregado = totalPares > 0 && paresEntregados >= totalPares;
  const estatus = entregado ? 'ENTREGADO' : 'PROCESANDO';
  const clienteNombre = row.cliente_nombre || row.cliente || 'S/Cliente';

  return {
    id: `PED-${row.folio}`,
    tenantId,
    clientId: row.cliente || 'cliente_desconocido',
    clientName: clienteNombre,
    modelId: 'varios',
    modelName: 'Varios modelos',
    color: 'N/D',
    quantity: totalPares,
    exchangeRate: 0,
    totalUSD: 0,
    totalMXN: 0,
    createdAt: row.fecha_pedido ?? new Date().toISOString(),
    deliveryDate: row.fecha_salida ?? row.fecha_recepcion ?? new Date().toISOString(),
    status: estatus,
    discountAuthorized: false,
    discountPercentage: 0,

    // Campos en espanol que usa el pipeline por pedido
    idPedido: `PED-${row.folio}`,
    cliente: clienteNombre,
    oc: row.pedido_cliente ?? undefined,
    fechaAlta: row.fecha_pedido ?? undefined,
    fechaCompromiso: row.fecha_salida ?? row.fecha_recepcion ?? undefined,
    fechaLimiteCancelacion: row.fecha_cancelacion ?? undefined,
    totalPares,
    paresEntregados,
    estatus,
    prioridad: 'MEDIA',
    responsable: row.tienda ?? undefined,
    porcentajeAvance: avance,
    riesgoEntrega: deliveryRisk(row.fecha_salida, entregado),
    temporada: row.temporada ?? undefined,
    source: 'big_zap_fdb'
  } as Order;
}
