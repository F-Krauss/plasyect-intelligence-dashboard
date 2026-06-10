import { describe, expect, it } from 'vitest';
import { mapPedidoToOrder, mapTarjetaToBatch, type PedidoRow, type TarjetaViajeraRow } from './bigzap-map.js';

const sampleRow: TarjetaViajeraRow = {
  tarjeta: '5498-40641',
  programa: 5498,
  lote: 40641,
  estilo: '0001-D-G',
  estilo_nombre: 'RUBBY DAMA 22-26 GANCHO',
  piecol: '001002226',
  combina: '10029',
  corrida: '01',
  pares: 456,
  fecha_programacion: '2026-04-21',
  status_depto: '40',
  status_depto_nombre: 'EMBARQUE',
  stage_id: 'embarque',
  zona_actual: '40',
  zona_actual_nombre: 'EMBARQUE',
  zona_previa: '01',
  zona_previa_nombre: 'PROGRAMACION',
  ultimo_escaneo: '2026-04-21T15:13:03.08+00:00',
  cancelado: false,
  tarjeta_impresa: false,
  pares_por_talla: { '02': 456 },
  pedido_folio: 547,
  cliente_codigo: '00005',
  cliente_nombre: 'ZAMISKA',
  pedido_fecha_salida: '2026-04-22'
};

describe('mapTarjetaToBatch', () => {
  it('maps a real tarjeta viajera row to the dashboard Batch shape', () => {
    const batch = mapTarjetaToBatch(sampleRow, 'plasyect_matriz') as Record<string, unknown>;
    expect(batch.id).toBe('5498-40641');
    expect(batch.tarjetaViajera).toBe('5498-40641');
    expect(batch.tenantId).toBe('plasyect_matriz');
    expect(batch.stage).toBe('embarque');
    expect(batch.etapaActual).toBe('embarque');
    expect(batch.estatus).toBe('ENTREGADO'); // depto 40 / embarque
    expect(batch.totalPares).toBe(456);
    expect(batch.modelo).toBe('RUBBY DAMA 22-26 GANCHO');
    expect(batch.cliente).toBe('ZAMISKA');
    expect(batch.orderId).toBe('PED-547');
    expect(batch.zonaPrevia).toBe('PROGRAMACION');
    expect(batch.zonaActual).toBe('EMBARQUE');
  });

  it('derives stage from depto when stage_id is missing, and flags cancelled', () => {
    const batch = mapTarjetaToBatch(
      { ...sampleRow, stage_id: null, status_depto: '15', cancelado: true },
      'plasyect_matriz'
    ) as Record<string, unknown>;
    expect(batch.stage).toBe('inyeccion');
    expect(batch.status).toBe('ARCHIVADO');
    expect(batch.estatus).toBe('ARCHIVADO');
  });

  it('falls back gracefully when style/client are missing', () => {
    const batch = mapTarjetaToBatch(
      { ...sampleRow, estilo_nombre: null, estilo: null, cliente_nombre: null, cliente_codigo: null, pedido_folio: null },
      'plasyect_matriz'
    ) as Record<string, unknown>;
    expect(batch.modelo).toBe('S/Modelo');
    expect(batch.cliente).toBe('S/Cliente');
    expect(batch.orderId).toBe('LOTE-5498-40641');
  });
});

describe('mapPedidoToOrder', () => {
  const pedido: PedidoRow = {
    folio: 547,
    cliente: '00005',
    cliente_nombre: 'ZAMISKA',
    fecha_pedido: '2026-04-10',
    fecha_recepcion: '2026-04-10',
    fecha_salida: '2026-04-22',
    fecha_cancelacion: null,
    pares_pedidos: 1000,
    pares_facturados: 456,
    pedido_cliente: 'OC-XYZ',
    tienda: 'Tienda Centro',
    temporada: 'V26'
  };

  it('prefiere los pares agregados de lotes y calcula avance', () => {
    const order = mapPedidoToOrder(
      { ...pedido, pares_lotes_total: 1000, pares_lotes_entregados: 250 },
      'plasyect_matriz'
    ) as Record<string, unknown>;
    expect(order.id).toBe('PED-547');
    expect(order.cliente).toBe('ZAMISKA');
    expect(order.oc).toBe('OC-XYZ');
    expect(order.totalPares).toBe(1000);
    expect(order.paresEntregados).toBe(250);
    expect(order.porcentajeAvance).toBe(25);
    expect(order.estatus).toBe('PROCESANDO'); // 250 < 1000
  });

  it('marca ENTREGADO cuando los lotes entregados cubren el total', () => {
    const order = mapPedidoToOrder(
      { ...pedido, pares_lotes_total: 500, pares_lotes_entregados: 500 },
      'plasyect_matriz'
    ) as Record<string, unknown>;
    expect(order.estatus).toBe('ENTREGADO');
    expect(order.porcentajeAvance).toBe(100);
  });

  it('NO trata PE_FECCAN (deadline) como cancelacion', () => {
    const order = mapPedidoToOrder(
      { ...pedido, fecha_cancelacion: '2026-05-20', pares_lotes_total: 100, pares_lotes_entregados: 0 },
      'plasyect_matriz'
    ) as Record<string, unknown>;
    expect(order.estatus).toBe('PROCESANDO');
    expect(order.fechaLimiteCancelacion).toBe('2026-05-20');
  });
});
