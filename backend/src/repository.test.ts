import { describe, expect, it } from 'vitest';
import { createErpService, getTarjetaViajeraStub, parseTarjetaId } from './erp.js';
import { MemoryRepository } from './repository.js';

describe('MemoryRepository', () => {
  it('returns seeded bootstrap data', async () => {
    const repo = new MemoryRepository();
    const bootstrap = await repo.bootstrap();
    expect(bootstrap.tenants.length).toBeGreaterThan(0);
    expect(bootstrap.orders.length).toBeGreaterThan(0);
  });

  it('patches a batch stage', async () => {
    const repo = new MemoryRepository();
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

  it('falls back to a disabled service without Supabase config', async () => {
    const service = createErpService();
    expect(service.enabled).toBe(false);
    expect(await service.listTarjetas({ limit: 10 })).toEqual([]);
    expect(await service.getTarjeta('5498-40638')).toBeNull();
    expect(await service.getSyncStatus()).toBeNull();
  });
});
