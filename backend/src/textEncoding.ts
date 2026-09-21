const MOJIBAKE_PATTERNS: Array<[RegExp, string]> = [
  [/Ã‰/g, 'É'],
  [/Ã“/g, 'Ó'],
  [/Ã‘/g, 'Ñ'],
  [/Ãœ/g, 'Ü'],
  [/Ã¡/g, 'á'],
  [/Ã©/g, 'é'],
  [/Ã­/g, 'í'],
  [/Ã³/g, 'ó'],
  [/Ãº/g, 'ú'],
  [/Ã±/g, 'ñ'],
  [/Ã¼/g, 'ü'],
  [/CORPORACI�N/g, 'CORPORACIÓN'],
  [/M�XICO/g, 'MÉXICO'],
  [/BEB�/g, 'BEBÉ'],
  [/CAF�/g, 'CAFÉ'],
  [/JOS�/g, 'JOSÉ'],
  [/MAR�A/g, 'MARÍA'],
  [/GARC�A/g, 'GARCÍA'],
  [/D�AZ/g, 'DÍAZ'],
  [/A�O/g, 'AÑO'],
  [/NI�O/g, 'NIÑO'],
  [/NI�A/g, 'NIÑA'],
  [/ESPA�A/g, 'ESPAÑA'],
  [/MA�ANA/g, 'MAÑANA'],
  [/ACI�N\b/g, 'ACIÓN'],
  [/CI�N\b/g, 'CIÓN'],
  [/SI�N\b/g, 'SIÓN']
];

function mojibakeScore(value: string): number {
  return (value.match(/[�ÃÂ]/g) ?? []).length;
}

function repairUtf8ReadAsLatin1(value: string): string {
  if (!/[ÃÂ]/.test(value)) return value;
  const decoded = Buffer.from(value, 'latin1').toString('utf8');
  return mojibakeScore(decoded) < mojibakeScore(value) ? decoded : value;
}

export function repairTextEncoding(value: string): string {
  let repaired = repairUtf8ReadAsLatin1(value);
  for (const [pattern, replacement] of MOJIBAKE_PATTERNS) {
    repaired = repaired.replace(pattern, replacement);
  }
  return repaired;
}

export function repairTextEncodingDeep<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (typeof value === 'string') return repairTextEncoding(value) as T;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;

  const existing = seen.get(value);
  if (existing) return existing as T;

  if (Array.isArray(value)) {
    const output: unknown[] = [];
    seen.set(value, output);
    for (const item of value) output.push(repairTextEncodingDeep(item, seen));
    return output as T;
  }

  const output: Record<string, unknown> = {};
  seen.set(value, output);
  for (const [key, item] of Object.entries(value)) {
    output[key] = repairTextEncodingDeep(item, seen);
  }
  return output as T;
}
