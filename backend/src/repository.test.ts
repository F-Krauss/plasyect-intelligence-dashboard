import { describe, expect, it } from 'vitest';
import { DisabledErpService, type ErpService, getTarjetaViajeraStub, parseTarjetaId } from './erp.js';
import { MemoryRepository } from './repository.js';

describe('MemoryRepository', () => {
  it('returns seeded bootstrap data', async () => {
    const repo = new MemoryRepository();
    const bootstrap = await repo.bootstrap();
    // Single-tenant: plasyect_matriz only
    expect(bootstrap.tenants.length).toBe(1);
    expect(bootstrap.tenants[0].id).toBe('plasyect_matriz');
    // No transactional data in seed — FDB/OCR provides it at runtime
    expect(bootstrap.orders).toEqual([]);
    expect(bootstrap.batches).toEqual([]);
  });

  it('creates and patches a batch', async () => {
    const repo = new MemoryRepository();
    const batch = { id: 'LOTE-26-401', tenantId: 'plasyect_matriz' as const, stage: 'almacen' };
    await repo.create('batches', batch);
    const updated = await repo.patch('batches', 'LOTE-26-401', { stage: 'embarque' });
    expect(updated?.stage).toBe('embarque');
  });
});

describe('Big Zap stub', () => {
  it('returns controlled unavailable response', () => {
    expect(getTarjetaViajeraStub('TV-1')).toMatchObject({
      id: 'TV-1',
      status: 'unavailable',
      source: 'big_zap_fdb'
    });
  });
});

describe('ERP tarjetas viajeras', () => {
  it('parses tarjeta ids "PROGRAMA-LOTE"', () => {
    expect(parseTarjetaId('5498-40638')).toEqual({ programa: 5498, lote: 40638 });
    expect(parseTarjetaId(' 5498-40638 ')).toEqual({ programa: 5498, lote: 40638 });
    expect(parseTarjetaId('TV-1')).toBeNull();
    expect(parseTarjetaId('5498')).toBeNull();
    expect(parseTarjetaId('5498-40638-1')).toBeNull();
  });

  it('DisabledErpService returns empty/null for all calls', async () => {
    const service: ErpService = new DisabledErpService();
    expect(service.enabled).toBe(false);
    expect(await service.listTarjetas({ limit: 10 })).toEqual([]);
    expect(await service.getTarjeta('5498-40638')).toBeNull();
    expect(await service.getSyncStatus()).toBeNull();
    const operational = await service.getOperational('2026-05-01', '2026-05-25');
    expect(operational.meta.hasPeriodData).toBe(false);
    expect(operational.active).toEqual({ orders: null, batches: null, pairs: null });
  });
});
