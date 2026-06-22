import assert from 'node:assert/strict';
import test, { after } from 'node:test';

process.env.FIREBIRD_DATABASE ??= '/tmp/test-bigzap.fdb';
process.env.FIREBIRD_PASSWORD ??= 'masterkey';
process.env.DATABASE_URL ??= 'postgres://user:pass@localhost:5432/test';

const { pool } = await import('./pg.js');
const { legacyPtmovId, paresPorTalla } = await import('./sync.js');

after(async () => {
  await pool.end();
});

test('paresPorTalla keeps only non-zero size positions', () => {
  assert.deepEqual(
    paresPorTalla({ LD_PTO01: 4, LD_PTO02: 0, LD_PTO03: 7 }, 'LD_PTO'),
    { '01': 4, '03': 7 }
  );
});

test('PTMOV id ignores newly mirrored fields', () => {
  const base = {
    PT_FECMOV: new Date(2026, 5, 19), PT_MOVTO: '71', PT_TIPO: 'F', PT_DOCTO: '123',
    PT_PROG: 10, PT_LOTE: 20, PT_PEDIDO: 30, PT_RENGLON: 1,
    PT_CALIDAD: 1, PT_PARES: 12, PT_DISTINGUE: 99, PT_OBSERVA: 'OK'
  };
  assert.equal(
    legacyPtmovId(base),
    legacyPtmovId({ ...base, PT_PLANTA: '01', PT_FOLALM: 44, PT_PTO01: 12 })
  );
});
