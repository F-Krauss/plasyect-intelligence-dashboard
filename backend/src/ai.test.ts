import { describe, expect, it } from 'vitest';
import { buildChatContext } from './ai.js';
import type { ErpOperationalResponse } from './erp.js';

describe('buildChatContext', () => {
  it('excludes Alta Pedido from productive WIP context', () => {
    const data: ErpOperationalResponse = {
      meta: {
        fechaInicio: '2026-07-01',
        fechaFin: '2026-07-01',
        hasPeriodData: true,
        dataMaxDate: '2026-07-01',
        lastSync: '2026-07-02T01:51:39.126Z',
        qualityAvailable: false,
        source: 'big_zap_fdb'
      },
      active: { orders: 10, batches: 265, pairs: 8602 },
      productionHourly: [],
      quality: [],
      movements: [],
      models: [],
      catalogs: { clients: [], models: [], departments: [], lines: [], combinations: [] },
      dailyProduction: [],
      wipSummary: { activeBatches: 265, activePairs: 8602, globalProgress: 4 },
      stagePipeline: [
        { stageId: 'alta_pedido', stageName: 'Alta Pedido', pairs: 19740, batches: 11, avgMinutes: null, wipPct: 0, saturation: 'CRITICO' },
        { stageId: 'banda', stageName: 'Banda', pairs: 3942, batches: 97, avgMinutes: null, wipPct: 45.8, saturation: 'CRITICO' }
      ],
      orderRisk: { totalOpen: 0, totalRisk: 0, vencido: 0, alto: 0, medio: 0, bajo: 0, rows: [] },
      orderPipeline: [],
      lotePipeline: []
    };

    const { contexto } = buildChatContext(data, '2026-07-01');

    expect(contexto).toContain('Alta Pedido: 19,740 pares en 11 lotes capturados, pero NO cuenta como WIP productivo');
    const productiveWipSection = contexto.split('### WIP productivo por etapa (excluye Alta Pedido)')[1];
    expect(productiveWipSection).toContain('- Banda: 3,942 pares');
    expect(productiveWipSection).not.toContain('- Alta Pedido:');
  });
});
