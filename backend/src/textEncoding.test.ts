import { describe, expect, it } from 'vitest';
import { repairTextEncoding, repairTextEncodingDeep } from './textEncoding.js';

describe('repairTextEncoding', () => {
  it('repairs common replacement-character catalog text from Firebird sync output', () => {
    expect(repairTextEncoding('CORPORACI�N VANDECI SA DE CV')).toBe('CORPORACIÓN VANDECI SA DE CV');
    expect(repairTextEncoding('PLASYECT INDUSTRIAL DE M�XICO S.A.')).toBe('PLASYECT INDUSTRIAL DE MÉXICO S.A.');
    expect(repairTextEncoding('ROSA BEB�')).toBe('ROSA BEBÉ');
  });

  it('repairs UTF-8 text decoded as latin1 when it reaches the API layer', () => {
    expect(repairTextEncoding('CORPORACIÃ“N VANDECI')).toBe('CORPORACIÓN VANDECI');
    expect(repairTextEncoding('MÃ‰XICO')).toBe('MÉXICO');
  });

  it('walks nested API payloads without changing non-string values', () => {
    const payload = {
      cliente: 'CORPORACI�N VANDECI',
      rows: [{ color: 'ROSA BEB�', pares: 30 }],
      ok: true
    };

    expect(repairTextEncodingDeep(payload)).toEqual({
      cliente: 'CORPORACIÓN VANDECI',
      rows: [{ color: 'ROSA BEBÉ', pares: 30 }],
      ok: true
    });
  });
});
