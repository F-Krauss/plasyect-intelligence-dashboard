import { createHash } from 'node:crypto';
import { config } from './config.js';
import { withFirebird, fbDate, fbNumber, fbString, type FbQuery, type FbRow } from './firebird.js';
import { log } from './log.js';
import { getSyncState, recordSyncRun, replaceJson, setSyncState, upsertJson, type JsonRow } from './pg.js';

const IN_CHUNK = 500;

const sizeColumns = (prefix: string): string =>
  Array.from({ length: 30 }, (_, index) => `${prefix}${String(index + 1).padStart(2, '0')}`).join(', ');

const LOTCAB_COLS = `LC_PROG, LC_LOTE, LC_ESTILO, LC_PIECOL, LC_COMBINA, LC_CORRIDA, LC_FECPRO,
  LC_PARLOT, LC_STATUS, LC_CANCELA, LC_FECCAN, LC_SEMPRO, LC_ANOPRO, LC_PLANTA, LC_SUBDEPTO,
  LC_IMPRESO, LC_IMPETI,
  LC_PTO01, LC_PTO02, LC_PTO03, LC_PTO04, LC_PTO05, LC_PTO06, LC_PTO07, LC_PTO08, LC_PTO09, LC_PTO10,
  LC_PTO11, LC_PTO12, LC_PTO13, LC_PTO14, LC_PTO15, LC_PTO16, LC_PTO17, LC_PTO18, LC_PTO19, LC_PTO20,
  LC_PTO21, LC_PTO22, LC_PTO23, LC_PTO24, LC_PTO25, LC_PTO26, LC_PTO27, LC_PTO28, LC_PTO29, LC_PTO30`;

// Producto terminado (PTLOTCAB/PTLOTDET): espejo de LOTCAB/LOTDET para lotes ya terminados.
const PTLOTCAB_COLS = `LC_PROG, LC_LOTE, LC_ESTILO, LC_PIECOL, LC_COMBINA, LC_CORRIDA, LC_FECPT,
  LC_OBSERVA, LC_PARLOT, LC_STATUS, LC_CALIDAD, LC_DISPO, LC_PREDIR, LC_ALMACEN, LC_PASILLO, LC_TARIMA,
  ${sizeColumns('LC_PTO')}`;

const PTLOTDET_COLS = `LD_PROG, LD_LOTE, LD_PEDIDO, LD_REN, LD_CODCTE, LD_CORRIDA, LD_PARES, LD_CALIDAD,
  LD_DISPO, LD_ORIGEN, LD_MODELO, ${sizeColumns('LD_PTO')}`;

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

export function paresPorTalla(row: FbRow, prefix: string): Record<string, number> | null {
  const tallas: Record<string, number> = {};
  for (let i = 1; i <= 30; i++) {
    const suffix = String(i).padStart(2, '0');
    const pares = fbNumber(row[`${prefix}${suffix}`]);
    if (pares) tallas[suffix] = pares;
  }
  return Object.keys(tallas).length > 0 ? tallas : null;
}

function legacyPtmovRow(r: FbRow): JsonRow {
  return {
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
}

export function legacyPtmovId(row: FbRow): string {
  return createHash('md5')
    .update(Object.values(legacyPtmovRow(row)).map((value) => String(value ?? '')).join('|'))
    .digest('hex');
}

interface Extraction {
  depa: FbRow[];
  subdepto: FbRow[];
  estilos: FbRow[];
  lineas: FbRow[];
  combinaciones: FbRow[];
  clientes: FbRow[];
  pedidos: FbRow[];
  programacion: FbRow[];
  avance: FbRow[];
  lotcab: FbRow[];
  lotdet: FbRow[];
  ptmov: FbRow[];
  ptlotcab: FbRow[];
  ptlotdet: FbRow[];
  observaciones: FbRow[];
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

async function extract(
  watermarks: { avance: string | null; ptmov: string | null; ptlotcab: string | null }
): Promise<Extraction> {
  return withFirebird(async (query) => {
    const depa = await query('SELECT DP_CODDEP, DP_DESCRIP FROM DEPA');
    const subdepto = await query('SELECT SD_CODIGO, SD_DESCRIP, SD_DEPPAD, SD_PLANTA FROM SUBDEPTO');
    const estilos = await query(
      `SELECT ES_CODEST, ES_NOMEST, ES_LINEA, ES_VIGENTE, ES_FOTO, ES_COSTO, ES_ESCALA,
              ES_CATEGORIA, ES_FLUJO, ES_DIAPRO, ES_TIPPROD, ES_ALTPIS, ES_CODUNI
       FROM ESTILO`
    );
    const lineas = await query('SELECT LI_CODLIN, LI_DESCRIP FROM LINEA');
    const combinaciones = await query('SELECT CO_CODCOM, CO_DESCRIP FROM COMBINA');
    const clientes = await query(
      `SELECT CC_CODCTE, CC_NOMCTE, CC_RFCCTE, CC_CLASIF, CC_TELEFONO, CC_INTERNET,
              CC_DIRECCION, CC_CIUDAD, CC_ESTADO, CC_LIMCRE, CC_DIACRE
       FROM CTES`
    );
    const pedidos = await query(
      `SELECT PE_FOLPED, PE_CODCTE, PE_FECPED, PE_FECREC, PE_FECSAL, PE_FECCAN,
              PE_PARPED, PE_PARFAC, PE_PEDCTE, PE_TIENDA, PE_TEMPORADA,
              PE_ORIGEN, PE_PORDES, PE_DIACRE, PE_OBSERV
       FROM PEDIDOS`
    );
    // Espejo completo: sin filtro de negocio. El backend decide que renglones cuentan
    // (p.ej. Alta de Pedido = SUM(pares_aprogramados) WHERE > 0). Filtrar aqui ya tiro el
    // backlog antes (RE_PARPRO>0 dejaba fuera renglones con RE_PARAPRO>0 y RE_PARPRO=0).
    const programacion = await query(
      `SELECT RE_FOLPED, RE_NUMREN, RE_CODEST, RE_PIECOL, RE_COMBINA, RE_CORRIDA,
              RE_FECENT, RE_FECSAL, RE_FECCAN, RE_FETEPRO, RE_PARREN, RE_PARPRO,
              RE_PARAPRO, RE_CODCTE, RE_PEDCTE, RE_LIBERADO, RE_STATUS
       FROM RENGLON`
    );

    const avance = watermarks.avance
      ? await query(
          `SELECT AV_PROGRAMA, AV_LOTE, AV_DEPTO, AV_FECHA, AV_HORA, AV_GENPOR, AV_SUBDEPTO
           FROM AVANCE WHERE AV_FECHA >= ?`,
          [dateParam(minusDays(watermarks.avance, config.overlapDays))]
        )
      : await query('SELECT AV_PROGRAMA, AV_LOTE, AV_DEPTO, AV_FECHA, AV_HORA, AV_GENPOR, AV_SUBDEPTO FROM AVANCE');

    // Espejo completo de LOTCAB/LOTDET. Antes era incremental (por LC_FECPRO + escaneos +
    // refresh de abiertos), lo que dejaba filas viejas congeladas: un lote que salia de
    // LOTCAB (graduaba a producto terminado, o lo purgaban) seguia en bigzap_lotes con su
    // ultimo status de piso e inflaba el WIP. Con SELECT completo + replaceJson la tabla es
    // un espejo 1:1 de LOTCAB en cada ciclo, sin reconcile manual. ~38k filas: barato.
    const lotcab = await query(`SELECT ${LOTCAB_COLS} FROM LOTCAB`);

    const lotdet = await query(`SELECT LD_PROG, LD_LOTE, LD_PEDIDO, LD_REN, LD_CODCTE, LD_CORRIDA, LD_PARES,
                                       ${sizeColumns('LD_PTO')} FROM LOTDET`);

    const ptmov = watermarks.ptmov
      ? await query(
          `SELECT PT_FECMOV, PT_MOVTO, PT_TIPO, PT_DOCTO, PT_PROG, PT_LOTE, PT_PEDIDO, PT_RENGLON,
                  PT_CALIDAD, PT_PARES, PT_DISTINGUE, PT_OBSERVA, PT_PLANTA, PT_FOLALM,
                  ${sizeColumns('PT_PTO')}
           FROM PTMOV WHERE PT_FECMOV >= ?`,
          [dateParam(minusDays(watermarks.ptmov, config.overlapDays))]
        )
      : await query(
          `SELECT PT_FECMOV, PT_MOVTO, PT_TIPO, PT_DOCTO, PT_PROG, PT_LOTE, PT_PEDIDO, PT_RENGLON,
                  PT_CALIDAD, PT_PARES, PT_DISTINGUE, PT_OBSERVA, PT_PLANTA, PT_FOLALM,
                  ${sizeColumns('PT_PTO')} FROM PTMOV`
        );

    // Producto terminado. Cabecera incremental por LC_FECPT; detalle por las llaves
    // (prog, lote) de la cabecera extraida (igual que LOTCAB/LOTDET).
    let ptlotcab: FbRow[];
    if (watermarks.ptlotcab) {
      const since = dateParam(minusDays(watermarks.ptlotcab, config.overlapDays));
      ptlotcab = await query(`SELECT ${PTLOTCAB_COLS} FROM PTLOTCAB WHERE LC_FECPT >= ?`, [since]);
    } else {
      ptlotcab = await query(`SELECT ${PTLOTCAB_COLS} FROM PTLOTCAB`);
    }

    const ptlotdet = watermarks.ptlotcab
      ? await fetchLotesPorPares(
          query,
          (l) => `SELECT ${PTLOTDET_COLS} FROM PTLOTDET WHERE LD_PROG = ? AND LD_LOTE IN (${l})`,
          ptlotcab
            .map((r) => ({ prog: fbNumber(r.LC_PROG), lote: fbNumber(r.LC_LOTE) }))
            .filter((p): p is { prog: number; lote: number } => p.prog !== null && p.lote !== null)
        )
      : await query(`SELECT ${PTLOTDET_COLS} FROM PTLOTDET`);

    const observaciones = await query('SELECT OL_PROGRAMA, OL_LOTE, OL_OBSERVA FROM OBSLOT');

    return { depa, subdepto, estilos, lineas, combinaciones, clientes, pedidos, programacion, avance, lotcab, lotdet, ptmov, ptlotcab, ptlotdet, observaciones };
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
      { name: 'vigente', type: 'boolean' },
      { name: 'foto', type: 'text' },
      { name: 'costo', type: 'numeric' },
      { name: 'escala', type: 'numeric' },
      { name: 'categoria', type: 'text' },
      { name: 'flujo', type: 'text' },
      { name: 'dias_proceso', type: 'numeric' },
      { name: 'tipo_producto', type: 'text' },
      { name: 'altura_piso', type: 'numeric' },
      { name: 'unidad', type: 'text' }
    ],
    'codigo',
    data.estilos
      .map((r) => ({
        codigo: fbString(r.ES_CODEST),
        nombre: fbString(r.ES_NOMEST),
        linea: fbString(r.ES_LINEA),
        vigente: fbString(r.ES_VIGENTE) === 'S',
        foto: fbString(r.ES_FOTO),
        costo: fbNumber(r.ES_COSTO),
        escala: fbNumber(r.ES_ESCALA),
        categoria: fbString(r.ES_CATEGORIA),
        flujo: fbString(r.ES_FLUJO),
        dias_proceso: fbNumber(r.ES_DIAPRO),
        tipo_producto: fbString(r.ES_TIPPROD),
        altura_piso: fbNumber(r.ES_ALTPIS),
        unidad: fbString(r.ES_CODUNI)
      }))
      .filter((r) => r.codigo)
  );

  counts.lineas = await upsertJson(
    'public.bigzap_lineas',
    [{ name: 'codigo', type: 'text' }, { name: 'nombre', type: 'text' }],
    'codigo',
    data.lineas
      .map((r) => ({ codigo: fbString(r.LI_CODLIN), nombre: fbString(r.LI_DESCRIP) }))
      .filter((r) => r.codigo)
  );

  counts.combinaciones = await upsertJson(
    'public.bigzap_combinaciones',
    [{ name: 'codigo', type: 'text' }, { name: 'nombre', type: 'text' }],
    'codigo',
    data.combinaciones
      .map((r) => ({ codigo: fbString(r.CO_CODCOM), nombre: fbString(r.CO_DESCRIP) }))
      .filter((r) => r.codigo)
  );

  counts.clientes = await upsertJson(
    'public.bigzap_clientes',
    [
      { name: 'codigo', type: 'text' },
      { name: 'nombre', type: 'text' },
      { name: 'rfc', type: 'text' },
      { name: 'clasif', type: 'text' },
      { name: 'telefono', type: 'text' },
      { name: 'internet', type: 'text' },
      { name: 'direccion', type: 'text' },
      { name: 'ciudad', type: 'text' },
      { name: 'estado', type: 'text' },
      { name: 'limite_credito', type: 'numeric' },
      { name: 'dias_credito', type: 'int' }
    ],
    'codigo',
    data.clientes
      .map((r) => ({
        codigo: fbString(r.CC_CODCTE),
        nombre: fbString(r.CC_NOMCTE),
        rfc: fbString(r.CC_RFCCTE),
        clasif: fbString(r.CC_CLASIF),
        telefono: fbString(r.CC_TELEFONO),
        internet: fbString(r.CC_INTERNET),
        direccion: fbString(r.CC_DIRECCION),
        ciudad: fbString(r.CC_CIUDAD),
        estado: fbString(r.CC_ESTADO),
        limite_credito: fbNumber(r.CC_LIMCRE),
        dias_credito: fbNumber(r.CC_DIACRE)
      }))
      .filter((r) => r.codigo)
  );

  counts.lotes = await replaceJson(
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
      { name: 'temporada', type: 'text' },
      { name: 'origen', type: 'text' },
      { name: 'porcentaje_descuento', type: 'numeric' },
      { name: 'dias_credito', type: 'int' },
      { name: 'observaciones', type: 'text' }
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
        temporada: fbString(r.PE_TEMPORADA),
        origen: fbString(r.PE_ORIGEN),
        porcentaje_descuento: fbNumber(r.PE_PORDES),
        dias_credito: fbNumber(r.PE_DIACRE),
        observaciones: fbString(r.PE_OBSERV)
      }))
      .filter((r) => r.folio !== null)
  );

  counts.programacion = await replaceJson(
    'public.bigzap_programacion_renglones',
    [
      { name: 'pedido', type: 'int' },
      { name: 'renglon', type: 'int' },
      { name: 'entrega', type: 'date' },
      { name: 'fecha_salida', type: 'date' },
      { name: 'fecha_cancelacion', type: 'date' },
      { name: 'fecha_programacion', type: 'date' },
      { name: 'estilo', type: 'text' },
      { name: 'piecol', type: 'text' },
      { name: 'combina', type: 'text' },
      { name: 'corrida', type: 'text' },
      { name: 'cliente', type: 'text' },
      { name: 'pedido_cliente', type: 'text' },
      { name: 'pares_renglon', type: 'int' },
      { name: 'pares_programar', type: 'int' },
      { name: 'pares_aprogramados', type: 'int' },
      { name: 'liberado', type: 'boolean' },
      { name: 'status', type: 'text' }
    ],
    data.programacion
      .map((r) => ({
        pedido: fbNumber(r.RE_FOLPED),
        renglon: fbNumber(r.RE_NUMREN),
        entrega: fbDate(r.RE_FECENT),
        fecha_salida: fbDate(r.RE_FECSAL),
        fecha_cancelacion: fbDate(r.RE_FECCAN),
        fecha_programacion: fbDate(r.RE_FETEPRO),
        estilo: fbString(r.RE_CODEST),
        piecol: fbString(r.RE_PIECOL),
        combina: fbString(r.RE_COMBINA),
        corrida: fbString(r.RE_CORRIDA),
        cliente: fbString(r.RE_CODCTE),
        pedido_cliente: fbString(r.RE_PEDCTE),
        pares_renglon: fbNumber(r.RE_PARREN),
        pares_programar: fbNumber(r.RE_PARPRO),
        pares_aprogramados: fbNumber(r.RE_PARAPRO),
        liberado: fbString(r.RE_LIBERADO) === 'S',
        status: fbString(r.RE_STATUS)
      }))
      .filter((r) => r.pedido !== null && r.renglon !== null)
  );

  counts.lotes_pedidos = await replaceJson(
    'public.bigzap_lotes_pedidos',
    [
      { name: 'programa', type: 'int' },
      { name: 'lote', type: 'int' },
      { name: 'pedido', type: 'int' },
      { name: 'renglon', type: 'int' },
      { name: 'cliente', type: 'text' },
      { name: 'corrida', type: 'text' },
      { name: 'pares', type: 'int' },
      { name: 'pares_por_talla', type: 'jsonb' }
    ],
    data.lotdet
      .map((r) => ({
        programa: fbNumber(r.LD_PROG),
        lote: fbNumber(r.LD_LOTE),
        pedido: fbNumber(r.LD_PEDIDO),
        renglon: fbNumber(r.LD_REN),
        cliente: fbString(r.LD_CODCTE),
        corrida: fbString(r.LD_CORRIDA),
        pares: fbNumber(r.LD_PARES),
        pares_por_talla: paresPorTalla(r, 'LD_PTO')
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
      { name: 'observa', type: 'text' },
      { name: 'pares_por_talla', type: 'jsonb' },
      { name: 'planta', type: 'text' },
      { name: 'folio_almacen', type: 'bigint' }
    ],
    'id',
    data.ptmov.map((r) => {
      const legacyRow = legacyPtmovRow(r);
      const id = legacyPtmovId(r);
      return {
        id,
        ...legacyRow,
        pares_por_talla: paresPorTalla(r, 'PT_PTO'),
        planta: fbString(r.PT_PLANTA),
        folio_almacen: fbNumber(r.PT_FOLALM)
      };
    })
  );

  counts.pt_lotes = await upsertJson(
    'public.bigzap_pt_lotes',
    [
      { name: 'programa', type: 'int' },
      { name: 'lote', type: 'int' },
      { name: 'estilo', type: 'text' },
      { name: 'piecol', type: 'text' },
      { name: 'combina', type: 'text' },
      { name: 'corrida', type: 'text' },
      { name: 'fecha_pt', type: 'date' },
      { name: 'observacion', type: 'text' },
      { name: 'pares', type: 'int' },
      { name: 'status', type: 'text' },
      { name: 'calidad', type: 'int' },
      { name: 'disponible', type: 'text' },
      { name: 'precio_dir', type: 'numeric' },
      { name: 'almacen', type: 'text' },
      { name: 'pasillo', type: 'text' },
      { name: 'tarima', type: 'text' },
      { name: 'pares_por_talla', type: 'jsonb' }
    ],
    'programa, lote',
    data.ptlotcab
      .map((r) => ({
        programa: fbNumber(r.LC_PROG),
        lote: fbNumber(r.LC_LOTE),
        estilo: fbString(r.LC_ESTILO),
        piecol: fbString(r.LC_PIECOL),
        combina: fbString(r.LC_COMBINA),
        corrida: fbString(r.LC_CORRIDA),
        fecha_pt: fbDate(r.LC_FECPT),
        observacion: fbString(r.LC_OBSERVA),
        pares: fbNumber(r.LC_PARLOT),
        status: fbString(r.LC_STATUS),
        calidad: fbNumber(r.LC_CALIDAD),
        disponible: fbString(r.LC_DISPO),
        precio_dir: fbNumber(r.LC_PREDIR),
        almacen: fbString(r.LC_ALMACEN),
        pasillo: fbString(r.LC_PASILLO),
        tarima: fbString(r.LC_TARIMA),
        pares_por_talla: paresPorTalla(r, 'LC_PTO')
      }))
      .filter((r) => r.programa !== null && r.lote !== null)
  );

  counts.pt_lotes_detalle = await upsertJson(
    'public.bigzap_pt_lotes_detalle',
    [
      { name: 'programa', type: 'int' },
      { name: 'lote', type: 'int' },
      { name: 'pedido', type: 'int' },
      { name: 'renglon', type: 'int' },
      { name: 'cliente', type: 'text' },
      { name: 'corrida', type: 'text' },
      { name: 'pares', type: 'int' },
      { name: 'calidad', type: 'int' },
      { name: 'disponible', type: 'text' },
      { name: 'origen', type: 'text' },
      { name: 'modelo', type: 'text' },
      { name: 'pares_por_talla', type: 'jsonb' }
    ],
    'programa, lote, pedido, renglon',
    data.ptlotdet
      .map((r) => ({
        programa: fbNumber(r.LD_PROG),
        lote: fbNumber(r.LD_LOTE),
        pedido: fbNumber(r.LD_PEDIDO),
        renglon: fbNumber(r.LD_REN),
        cliente: fbString(r.LD_CODCTE),
        corrida: fbString(r.LD_CORRIDA),
        pares: fbNumber(r.LD_PARES),
        calidad: fbNumber(r.LD_CALIDAD),
        disponible: fbString(r.LD_DISPO),
        origen: fbString(r.LD_ORIGEN),
        modelo: fbString(r.LD_MODELO),
        pares_por_talla: paresPorTalla(r, 'LD_PTO')
      }))
      .filter((r) => r.programa !== null && r.lote !== null && r.pedido !== null && r.renglon !== null)
  );

  counts.observaciones_lote = await replaceJson(
    'public.bigzap_lote_observaciones',
    [
      { name: 'programa', type: 'int' },
      { name: 'lote', type: 'int' },
      { name: 'observacion', type: 'text' }
    ],
    data.observaciones
      .map((r) => ({
        programa: fbNumber(r.OL_PROGRAMA),
        lote: fbNumber(r.OL_LOTE),
        observacion: fbString(r.OL_OBSERVA)
      }))
      .filter((r) => r.programa !== null && r.lote !== null)
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
    // LOTCAB/LOTDET/RENGLON/OBSLOT se espejean completos cada ciclo (replaceJson), no usan
    // watermark. Solo los logs append-only (AVANCE, PTMOV, PTLOTCAB) son incrementales.
    const watermarks = {
      avance: full ? null : state.get('avance') ?? null,
      ptmov: full ? null : state.get('ptmov') ?? null,
      ptlotcab: full ? null : state.get('ptlotcab') ?? null
    };
    const mode = watermarks.avance ? 'incremental' : 'completo';

    const data = await extract(watermarks);
    const counts = await load(data);

    let wmAvance: string | null = null;
    for (const r of data.avance) wmAvance = maxDate(wmAvance, fbDate(r.AV_FECHA));
    let wmPtmov: string | null = null;
    for (const r of data.ptmov) wmPtmov = maxDate(wmPtmov, fbDate(r.PT_FECMOV));
    let wmPtlotcab: string | null = null;
    for (const r of data.ptlotcab) wmPtlotcab = maxDate(wmPtlotcab, fbDate(r.LC_FECPT));

    const next = {
      avance: maxDate(watermarks.avance, wmAvance),
      ptmov: maxDate(watermarks.ptmov, wmPtmov),
      ptlotcab: maxDate(watermarks.ptlotcab, wmPtlotcab)
    };
    if (next.avance) await setSyncState('avance', next.avance);
    if (next.ptmov) await setSyncState('ptmov', next.ptmov);
    if (next.ptlotcab) await setSyncState('ptlotcab', next.ptlotcab);

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
