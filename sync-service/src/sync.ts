import { createHash } from 'node:crypto';
import { config } from './config.js';
import { withFirebird, fbDate, fbNumber, fbString, type FbQuery, type FbRow } from './firebird.js';
import { log } from './log.js';
import { getSyncState, recordSyncRun, setSyncState, upsertJson, type JsonRow } from './pg.js';

const IN_CHUNK = 500;

const LOTCAB_COLS = `LC_PROG, LC_LOTE, LC_ESTILO, LC_PIECOL, LC_COMBINA, LC_CORRIDA, LC_FECPRO,
  LC_PARLOT, LC_STATUS, LC_CANCELA, LC_FECCAN, LC_SEMPRO, LC_ANOPRO, LC_PLANTA, LC_SUBDEPTO,
  LC_IMPRESO, LC_IMPETI,
  LC_PTO01, LC_PTO02, LC_PTO03, LC_PTO04, LC_PTO05, LC_PTO06, LC_PTO07, LC_PTO08, LC_PTO09, LC_PTO10,
  LC_PTO11, LC_PTO12, LC_PTO13, LC_PTO14, LC_PTO15, LC_PTO16, LC_PTO17, LC_PTO18, LC_PTO19, LC_PTO20,
  LC_PTO21, LC_PTO22, LC_PTO23, LC_PTO24, LC_PTO25, LC_PTO26, LC_PTO27, LC_PTO28, LC_PTO29, LC_PTO30`;

function minusDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/** Firebird espera Date de JS para parametros DATE. */
function dateParam(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function maxDate(current: string | null, candidate: string | null): string | null {
  if (!candidate) return current;
  if (!current || candidate > current) return candidate;
  return current;
}

function paresPorTalla(row: FbRow, prefix: string): Record<string, number> | null {
  const tallas: Record<string, number> = {};
  for (let i = 1; i <= 30; i++) {
    const suffix = String(i).padStart(2, '0');
    const pares = fbNumber(row[`${prefix}${suffix}`]);
    if (pares) tallas[suffix] = pares;
  }
  return Object.keys(tallas).length > 0 ? tallas : null;
}

interface Extraction {
  depa: FbRow[];
  subdepto: FbRow[];
  estilos: FbRow[];
  clientes: FbRow[];
  pedidos: FbRow[];
  avance: FbRow[];
  lotcab: FbRow[];
  lotdet: FbRow[];
  ptmov: FbRow[];
}

async function fetchLotesPorPares(query: FbQuery, sql: (lotes: string) => string, pairs: Array<{ prog: number; lote: number }>): Promise<FbRow[]> {
  const byPrograma = new Map<number, number[]>();
  for (const pair of pairs) {
    const lotes = byPrograma.get(pair.prog) ?? [];
    lotes.push(pair.lote);
    byPrograma.set(pair.prog, lotes);
  }
  const rows: FbRow[] = [];
  for (const [prog, lotes] of byPrograma) {
    for (let i = 0; i < lotes.length; i += IN_CHUNK) {
      const chunk = lotes.slice(i, i + IN_CHUNK);
      const placeholders = chunk.map(() => '?').join(',');
      rows.push(...(await query(sql(placeholders), [prog, ...chunk])));
    }
  }
  return rows;
}

async function extract(watermarks: { avance: string | null; lotcab: string | null; ptmov: string | null }): Promise<Extraction> {
  return withFirebird(async (query) => {
    const depa = await query('SELECT DP_CODDEP, DP_DESCRIP FROM DEPA');
    const subdepto = await query('SELECT SD_CODIGO, SD_DESCRIP, SD_DEPPAD, SD_PLANTA FROM SUBDEPTO');
    const estilos = await query('SELECT ES_CODEST, ES_NOMEST, ES_LINEA, ES_VIGENTE FROM ESTILO');
    const clientes = await query('SELECT CC_CODCTE, CC_NOMCTE, CC_RFCCTE, CC_CLASIF FROM CTES');
    const pedidos = await query(
      `SELECT PE_FOLPED, PE_CODCTE, PE_FECPED, PE_FECREC, PE_FECSAL, PE_FECCAN,
              PE_PARPED, PE_PARFAC, PE_PEDCTE, PE_TIENDA, PE_TEMPORADA FROM PEDIDOS`
    );

    const avance = watermarks.avance
      ? await query(
          `SELECT AV_PROGRAMA, AV_LOTE, AV_DEPTO, AV_FECHA, AV_HORA, AV_GENPOR, AV_SUBDEPTO
           FROM AVANCE WHERE AV_FECHA >= ?`,
          [dateParam(minusDays(watermarks.avance, config.overlapDays))]
        )
      : await query('SELECT AV_PROGRAMA, AV_LOTE, AV_DEPTO, AV_FECHA, AV_HORA, AV_GENPOR, AV_SUBDEPTO FROM AVANCE');

    let lotcab: FbRow[];
    if (watermarks.lotcab) {
      const since = dateParam(minusDays(watermarks.lotcab, config.overlapDays));
      lotcab = await query(`SELECT ${LOTCAB_COLS} FROM LOTCAB WHERE LC_FECPRO >= ? OR LC_FECCAN >= ?`, [since, since]);
      const presentes = new Set(lotcab.map((r) => `${r.LC_PROG}|${r.LC_LOTE}`));
      const faltantes = new Map<string, { prog: number; lote: number }>();
      for (const row of avance) {
        const prog = fbNumber(row.AV_PROGRAMA);
        const lote = fbNumber(row.AV_LOTE);
        if (prog === null || lote === null) continue;
        const key = `${prog}|${lote}`;
        if (!presentes.has(key) && !faltantes.has(key)) faltantes.set(key, { prog, lote });
      }
      if (faltantes.size > 0) {
        lotcab.push(
          ...(await fetchLotesPorPares(
            query,
            (l) => `SELECT ${LOTCAB_COLS} FROM LOTCAB WHERE LC_PROG = ? AND LC_LOTE IN (${l})`,
            [...faltantes.values()]
          ))
        );
      }
    } else {
      lotcab = await query(`SELECT ${LOTCAB_COLS} FROM LOTCAB`);
    }

    const lotdet = watermarks.lotcab
      ? await fetchLotesPorPares(
          query,
          (l) => `SELECT LD_PROG, LD_LOTE, LD_PEDIDO, LD_REN, LD_CODCTE, LD_CORRIDA, LD_PARES
                  FROM LOTDET WHERE LD_PROG = ? AND LD_LOTE IN (${l})`,
          lotcab
            .map((r) => ({ prog: fbNumber(r.LC_PROG), lote: fbNumber(r.LC_LOTE) }))
            .filter((p): p is { prog: number; lote: number } => p.prog !== null && p.lote !== null)
        )
      : await query('SELECT LD_PROG, LD_LOTE, LD_PEDIDO, LD_REN, LD_CODCTE, LD_CORRIDA, LD_PARES FROM LOTDET');

    const ptmov = watermarks.ptmov
      ? await query(
          `SELECT PT_FECMOV, PT_MOVTO, PT_TIPO, PT_DOCTO, PT_PROG, PT_LOTE, PT_PEDIDO, PT_RENGLON,
                  PT_CALIDAD, PT_PARES, PT_DISTINGUE, PT_OBSERVA
           FROM PTMOV WHERE PT_FECMOV >= ?`,
          [dateParam(minusDays(watermarks.ptmov, config.overlapDays))]
        )
      : await query(
          `SELECT PT_FECMOV, PT_MOVTO, PT_TIPO, PT_DOCTO, PT_PROG, PT_LOTE, PT_PEDIDO, PT_RENGLON,
                  PT_CALIDAD, PT_PARES, PT_DISTINGUE, PT_OBSERVA FROM PTMOV`
        );

    return { depa, subdepto, estilos, clientes, pedidos, avance, lotcab, lotdet, ptmov };
  });
}

async function load(data: Extraction): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};

  counts.departamentos = await upsertJson(
    'public.bigzap_departamentos',
    [
      { name: 'codigo', type: 'text' },
      { name: 'nombre', type: 'text' }
    ],
    'codigo',
    data.depa
      .map((r) => ({ codigo: fbString(r.DP_CODDEP), nombre: fbString(r.DP_DESCRIP) ?? '' }))
      .filter((r) => r.codigo),
    { updateColumns: ['nombre'] }
  );

  counts.subdeptos = await upsertJson(
    'public.bigzap_subdeptos',
    [
      { name: 'codigo', type: 'text' },
      { name: 'nombre', type: 'text' },
      { name: 'depto_padre', type: 'text' },
      { name: 'planta', type: 'text' }
    ],
    'codigo',
    data.subdepto
      .map((r) => ({
        codigo: fbString(r.SD_CODIGO),
        nombre: fbString(r.SD_DESCRIP) ?? '',
        depto_padre: fbString(r.SD_DEPPAD),
        planta: fbString(r.SD_PLANTA)
      }))
      .filter((r) => r.codigo)
  );

  counts.estilos = await upsertJson(
    'public.bigzap_estilos',
    [
      { name: 'codigo', type: 'text' },
      { name: 'nombre', type: 'text' },
      { name: 'linea', type: 'text' },
      { name: 'vigente', type: 'boolean' }
    ],
    'codigo',
    data.estilos
      .map((r) => ({
        codigo: fbString(r.ES_CODEST),
        nombre: fbString(r.ES_NOMEST),
        linea: fbString(r.ES_LINEA),
        vigente: fbString(r.ES_VIGENTE) === 'S'
      }))
      .filter((r) => r.codigo)
  );

  counts.clientes = await upsertJson(
    'public.bigzap_clientes',
    [
      { name: 'codigo', type: 'text' },
      { name: 'nombre', type: 'text' },
      { name: 'rfc', type: 'text' },
      { name: 'clasif', type: 'text' }
    ],
    'codigo',
    data.clientes
      .map((r) => ({
        codigo: fbString(r.CC_CODCTE),
        nombre: fbString(r.CC_NOMCTE),
        rfc: fbString(r.CC_RFCCTE),
        clasif: fbString(r.CC_CLASIF)
      }))
      .filter((r) => r.codigo)
  );

  counts.lotes = await upsertJson(
    'public.bigzap_lotes',
    [
      { name: 'programa', type: 'int' },
      { name: 'lote', type: 'int' },
      { name: 'estilo', type: 'text' },
      { name: 'piecol', type: 'text' },
      { name: 'combina', type: 'text' },
      { name: 'corrida', type: 'text' },
      { name: 'fecha_programacion', type: 'date' },
      { name: 'pares', type: 'int' },
      { name: 'status_depto', type: 'text' },
      { name: 'cancelado', type: 'boolean' },
      { name: 'fecha_cancelacion', type: 'date' },
      { name: 'semana_produccion', type: 'text' },
      { name: 'anio_produccion', type: 'text' },
      { name: 'planta', type: 'text' },
      { name: 'subdepto', type: 'text' },
      { name: 'tarjeta_impresa', type: 'boolean' },
      { name: 'etiqueta_impresa', type: 'boolean' },
      { name: 'pares_por_talla', type: 'jsonb' }
    ],
    'programa, lote',
    data.lotcab
      .map((r) => ({
        programa: fbNumber(r.LC_PROG),
        lote: fbNumber(r.LC_LOTE),
        estilo: fbString(r.LC_ESTILO),
        piecol: fbString(r.LC_PIECOL),
        combina: fbString(r.LC_COMBINA),
        corrida: fbString(r.LC_CORRIDA),
        fecha_programacion: fbDate(r.LC_FECPRO),
        pares: fbNumber(r.LC_PARLOT),
        status_depto: fbString(r.LC_STATUS),
        cancelado: fbString(r.LC_CANCELA) === 'CA',
        fecha_cancelacion: fbDate(r.LC_FECCAN),
        semana_produccion: fbString(r.LC_SEMPRO),
        anio_produccion: fbString(r.LC_ANOPRO),
        planta: fbString(r.LC_PLANTA),
        subdepto: fbString(r.LC_SUBDEPTO),
        tarjeta_impresa: fbString(r.LC_IMPRESO) === 'S',
        etiqueta_impresa: fbString(r.LC_IMPETI) === 'S',
        pares_por_talla: paresPorTalla(r, 'LC_PTO')
      }))
      .filter((r) => r.programa !== null && r.lote !== null)
  );

  const plantTzLiteral = config.plantTz.replace(/'/g, "''");
  counts.avance = await upsertJson(
    'public.bigzap_avance',
    [
      { name: 'programa', type: 'int' },
      { name: 'lote', type: 'int' },
      { name: 'depto', type: 'text' },
      { name: 'fecha', type: 'date' },
      { name: 'hora_cs', type: 'int' },
      { name: 'gen_por', type: 'text' },
      { name: 'subdepto', type: 'text' }
    ],
    'programa, lote, depto',
    data.avance
      .map((r) => ({
        programa: fbNumber(r.AV_PROGRAMA),
        lote: fbNumber(r.AV_LOTE),
        depto: fbString(r.AV_DEPTO) ?? '',
        fecha: fbDate(r.AV_FECHA),
        hora_cs: fbNumber(r.AV_HORA) ?? 0,
        gen_por: fbString(r.AV_GENPOR),
        subdepto: fbString(r.AV_SUBDEPTO)
      }))
      .filter((r) => r.programa !== null && r.lote !== null && r.fecha !== null),
    {
      extraInsert: {
        column: 'escaneado_at',
        expression: `((r.fecha)::timestamp + make_interval(secs => r.hora_cs / 100.0)) at time zone '${plantTzLiteral}'`
      }
    }
  );

  counts.pedidos = await upsertJson(
    'public.bigzap_pedidos',
    [
      { name: 'folio', type: 'int' },
      { name: 'cliente', type: 'text' },
      { name: 'fecha_pedido', type: 'date' },
      { name: 'fecha_recepcion', type: 'date' },
      { name: 'fecha_salida', type: 'date' },
      { name: 'fecha_cancelacion', type: 'date' },
      { name: 'pares_pedidos', type: 'int' },
      { name: 'pares_facturados', type: 'int' },
      { name: 'pedido_cliente', type: 'text' },
      { name: 'tienda', type: 'text' },
      { name: 'temporada', type: 'text' }
    ],
    'folio',
    data.pedidos
      .map((r) => ({
        folio: fbNumber(r.PE_FOLPED),
        cliente: fbString(r.PE_CODCTE),
        fecha_pedido: fbDate(r.PE_FECPED),
        fecha_recepcion: fbDate(r.PE_FECREC),
        fecha_salida: fbDate(r.PE_FECSAL),
        fecha_cancelacion: fbDate(r.PE_FECCAN),
        pares_pedidos: fbNumber(r.PE_PARPED),
        pares_facturados: fbNumber(r.PE_PARFAC),
        pedido_cliente: fbString(r.PE_PEDCTE),
        tienda: fbString(r.PE_TIENDA),
        temporada: fbString(r.PE_TEMPORADA)
      }))
      .filter((r) => r.folio !== null)
  );

  counts.lotes_pedidos = await upsertJson(
    'public.bigzap_lotes_pedidos',
    [
      { name: 'programa', type: 'int' },
      { name: 'lote', type: 'int' },
      { name: 'pedido', type: 'int' },
      { name: 'renglon', type: 'int' },
      { name: 'cliente', type: 'text' },
      { name: 'corrida', type: 'text' },
      { name: 'pares', type: 'int' }
    ],
    'programa, lote, pedido, renglon',
    data.lotdet
      .map((r) => ({
        programa: fbNumber(r.LD_PROG),
        lote: fbNumber(r.LD_LOTE),
        pedido: fbNumber(r.LD_PEDIDO),
        renglon: fbNumber(r.LD_REN),
        cliente: fbString(r.LD_CODCTE),
        corrida: fbString(r.LD_CORRIDA),
        pares: fbNumber(r.LD_PARES)
      }))
      .filter((r) => r.programa !== null && r.lote !== null && r.pedido !== null && r.renglon !== null)
  );

  counts.pt_movimientos = await upsertJson(
    'public.bigzap_pt_movimientos',
    [
      { name: 'id', type: 'text' },
      { name: 'fecha_movimiento', type: 'date' },
      { name: 'movto', type: 'text' },
      { name: 'tipo', type: 'text' },
      { name: 'docto', type: 'text' },
      { name: 'programa', type: 'int' },
      { name: 'lote', type: 'int' },
      { name: 'pedido', type: 'int' },
      { name: 'renglon', type: 'int' },
      { name: 'calidad', type: 'int' },
      { name: 'pares', type: 'int' },
      { name: 'distingue', type: 'bigint' },
      { name: 'observa', type: 'text' }
    ],
    'id',
    data.ptmov.map((r) => {
      const row = {
        fecha_movimiento: fbDate(r.PT_FECMOV),
        movto: fbString(r.PT_MOVTO),
        tipo: fbString(r.PT_TIPO),
        docto: fbString(r.PT_DOCTO),
        programa: fbNumber(r.PT_PROG),
        lote: fbNumber(r.PT_LOTE),
        pedido: fbNumber(r.PT_PEDIDO),
        renglon: fbNumber(r.PT_RENGLON),
        calidad: fbNumber(r.PT_CALIDAD),
        pares: fbNumber(r.PT_PARES),
        distingue: fbNumber(r.PT_DISTINGUE),
        observa: fbString(r.PT_OBSERVA)
      };
      const id = createHash('md5')
        .update(Object.values(row).map((v) => String(v ?? '')).join('|'))
        .digest('hex');
      return { id, ...row };
    })
  );

  return counts;
}

export interface CycleResult {
  ok: boolean;
  counts: Record<string, number>;
  error?: string;
}

export async function runSyncCycle(full: boolean): Promise<CycleResult> {
  const startedAt = new Date();
  try {
    const state = await getSyncState();
    const watermarks = {
      avance: full ? null : state.get('avance') ?? null,
      lotcab: full ? null : state.get('lotcab') ?? null,
      ptmov: full ? null : state.get('ptmov') ?? null
    };
    const mode = watermarks.avance ? 'incremental' : 'completo';

    const data = await extract(watermarks);
    const counts = await load(data);

    let wmAvance: string | null = null;
    for (const r of data.avance) wmAvance = maxDate(wmAvance, fbDate(r.AV_FECHA));
    let wmLotcab: string | null = null;
    for (const r of data.lotcab) {
      wmLotcab = maxDate(wmLotcab, fbDate(r.LC_FECPRO));
      wmLotcab = maxDate(wmLotcab, fbDate(r.LC_FECCAN));
    }
    let wmPtmov: string | null = null;
    for (const r of data.ptmov) wmPtmov = maxDate(wmPtmov, fbDate(r.PT_FECMOV));

    const next = {
      avance: maxDate(watermarks.avance, wmAvance),
      lotcab: maxDate(watermarks.lotcab, wmLotcab),
      ptmov: maxDate(watermarks.ptmov, wmPtmov)
    };
    if (next.avance) await setSyncState('avance', next.avance);
    if (next.lotcab) await setSyncState('lotcab', next.lotcab);
    if (next.ptmov) await setSyncState('ptmov', next.ptmov);

    const durationMs = Date.now() - startedAt.getTime();
    await recordSyncRun({ status: 'ok', startedAt, payload: { mode, durationMs, counts } });
    log.info(`Sync ${mode} OK en ${durationMs} ms`, counts);
    return { ok: true, counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error('Sync fallido', error);
    try {
      await recordSyncRun({ status: 'error', startedAt, error: message, payload: {} });
    } catch (recordError) {
      log.error('No se pudo registrar la corrida fallida', recordError);
    }
    return { ok: false, counts: {}, error: message };
  }
}
