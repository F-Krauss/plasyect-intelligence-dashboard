/**
 * El identificador real de un lote (la tarjeta viajera) es el numero de LOTE,
 * p. ej. 41077 — NO el codigo concatenado "programa-lote" (5516-41077) que el
 * backend usa internamente como clave unica, ni el codigo de barras impreso.
 *
 * Estas funciones extraen el numero de lote para mostrarlo al usuario en
 * cualquier campo que diga "ID Lote". El id interno (programa-lote) se conserva
 * para keys de React, seleccion, busqueda y joins.
 */

/** Extrae el numero de lote de un valor "programa-lote" (o lo deja intacto). */
export function loteDisplay(value: string | number | null | undefined): string {
  if (value == null) return '';
  const s = String(value).trim();
  if (!s) return '';
  // "5516-41077" -> "41077". Prefijos como TV-/LOTE-/PED- tambien caen al ultimo segmento.
  const dash = s.lastIndexOf('-');
  if (dash >= 0 && dash < s.length - 1) {
    return s.slice(dash + 1);
  }
  return s;
}

/** Numero de lote a mostrar para un Batch: usa el campo numerico si existe. */
export function batchLoteDisplay(batch: { lote?: number; idLote?: string; id?: string }): string {
  if (typeof batch.lote === 'number' && Number.isFinite(batch.lote)) return String(batch.lote);
  return loteDisplay(batch.idLote || batch.id);
}
