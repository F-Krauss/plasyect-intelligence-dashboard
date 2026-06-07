import { 
  Client, 
  Model, 
  Stage, 
  Order, 
  Batch, 
  Machine, 
  Band, 
  QualityDefect, 
  AuditLog,
  Tenant,
  MovementStage,
  QualityRecord,
  HourlyProduction,
  StageId
} from '../types';

export const TENANTS: Tenant[] = [
  { id: 'plasyect_matriz', name: 'Plasyect Matriz - EVA Sandalias', location: 'León, Gto. Planta Central', primaryColor: 'indigo' },
  { id: 'plasyect_suelas', name: 'Plasyect División Suelas', location: 'San Francisco del Rincón, Gto.', primaryColor: 'emerald' },
  { id: 'plasyect_sandalias', name: 'Plasyect Inyección Directa', location: 'Purísima del Rincón, Gto.', primaryColor: 'sky' }
];

export const CLIENTS: Client[] = [
  { id: 'cli_zalisca', name: 'Zalisca Calzado', rfc: 'ZAL950811AB4', contactEmail: 'compras@zalisca.mx', contactPhone: '477-123-4567', priority: 'ALTA' },
  { id: 'cli_nubby', name: 'Nubby Boots', rfc: 'NUB120405H92', contactEmail: 'inventarios@nubby.com', contactPhone: '476-890-1234', priority: 'MEDIA' },
  { id: 'cli_dragon', name: 'Drago EVA', rfc: 'DRA080706PL4', contactEmail: 'director@dragocancun.com', contactPhone: '998-445-5667', priority: 'ALTA' },
  { id: 'cli_andrea', name: 'Comercializadora Andrea', rfc: 'CAN9901018D5', contactEmail: 'calidad@andrea.com.mx', contactPhone: '477-987-6543', priority: 'ALTA' },
  { id: 'cli_flexi', name: 'Grupo Flexi S.A. de C.V.', rfc: 'GFL840315M98', contactEmail: 'eva.supply@flexi.com.mx', contactPhone: '477-710-1000', priority: 'ALTA' },
  { id: 'cli_price', name: 'Price Shoes S.A. de C.V.', rfc: 'PSO961205K12', contactEmail: 'embarques@priceshoes.com', contactPhone: '555-667-8899', priority: 'MEDIA' },
  { id: 'cli_cklass', name: 'Cklass S.A. de C.V.', rfc: 'CKL980512F91', contactEmail: 'diseno@cklass.com', contactPhone: '477-443-2211', priority: 'MEDIA' }
];

export const MODELS: Model[] = [
  { id: 'mod_spider', name: 'Spider', isSandalia: true, basePriceUSD: 3.20, densityTarget: 0.24, expansionFactor: 1.58, recommendedPrep: 'Limpieza con solvente suave y flameado a 120°C', paintType: 'Laca de poliuretano base agua' },
  { id: 'mod_ruby', name: 'Ruby', isSandalia: true, basePriceUSD: 2.80, densityTarget: 0.22, expansionFactor: 1.62, recommendedPrep: 'Lijado ligero superficial y primer para EVA', paintType: 'Pintura vinilica elástica' },
  { id: 'mod_snap', name: 'Snap', isSandalia: true, basePriceUSD: 2.50, densityTarget: 0.25, expansionFactor: 1.55, recommendedPrep: 'Flameado estándar, soplado de aire ionizado', paintType: 'Poliuretano catalizado' },
  { id: 'mod_dragon', name: 'Dragon', isSandalia: false, basePriceUSD: 4.10, densityTarget: 0.28, expansionFactor: 1.48, recommendedPrep: 'Sin tratamiento posterior (suela rugosa antideslizante)', paintType: 'No requiere pintura (pigmentación directa)' },
  { id: 'mod_atenea', name: 'Atenea', isSandalia: true, basePriceUSD: 3.90, densityTarget: 0.23, expansionFactor: 1.60, recommendedPrep: 'Líquido desmoldante purgado y soplado', paintType: 'Efecto nacarado bicapa' },
  { id: 'mod_nubuck', name: 'Nubuck', isSandalia: false, basePriceUSD: 3.50, densityTarget: 0.26, expansionFactor: 1.50, recommendedPrep: 'Lijado profundo para lograr efecto terciopelo', paintType: 'Pintura mate micro-asfáltica' },
  { id: 'mod_eva_100', name: 'Sandalia Eva 100', isSandalia: true, basePriceUSD: 2.20, densityTarget: 0.24, expansionFactor: 1.57, recommendedPrep: 'Flameado estándar', paintType: 'Pintura acrílica elástica' },
  { id: 'mod_suela_comfort', name: 'Suela Comfort', isSandalia: false, basePriceUSD: 3.10, densityTarget: 0.25, expansionFactor: 1.52, recommendedPrep: 'Lijado ligero rotativo periférico', paintType: 'Poliuretano base agua' },
  { id: 'mod_plataforma_light', name: 'Plataforma Light', isSandalia: false, basePriceUSD: 4.30, densityTarget: 0.21, expansionFactor: 1.63, recommendedPrep: 'Tratamiento corona y desengrasado profundo', paintType: 'Acabado bicapa texturizado de poliuretano' }
];

export const COLORS = [
  'Rosa Humo',
  'Rosa Bebé',
  'Negro',
  'Blanco',
  'Arena',
  'Azul Marino',
  'Rojo',
  'Gris'
];

export const TALLAS = [15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30];

export const STAGES: Stage[] = [
  { id: 'alta_pedido', name: 'Alta de Pedido', order: 1, color: 'bg-blue-600', description: 'Registro inicial de volumen, modelo, tallas y cotización.' },
  { id: 'almacen', name: 'Almacén', order: 2, color: 'bg-cool-gray-500', description: 'Pesaje de compuesto EVA, pigmentos y agente soplante (expansor).' },
  { id: 'inyeccion', name: 'Inyección', order: 3, color: 'bg-amber-500', description: 'Fusión e inyección a alta presión y vulcanización.' },
  { id: 'estabilizacion', name: 'Estabilización', order: 4, color: 'bg-purple-500', description: 'Estabilización de dimensiones (encogimiento natural del EVA).' },
  { id: 'aduana', name: 'Aduana', order: 5, color: 'bg-rose-500', description: 'Verificación de densidad, peso, dureza Shore A y liberación.' },
  { id: 'banda', name: 'Banda', order: 6, color: 'bg-indigo-500', description: 'Recorte de rebabas, marcado láser, empaque e identificación.' },
  { id: 'embarque', name: 'Embarque', order: 7, color: 'bg-emerald-500', description: 'Paletizado final, precinto y entrega a transporte cliente.' }
];

export const DEFECTOS_CATALOGO = [
  'Dimensión fuera de especificación',
  'Variación de volumen',
  'Quemado',
  'Contaminado',
  'Tapón de basura',
  'Marca de sarro',
  'Agujeros',
  'Marmoleado',
  'Molde dañado',
  'Deforme',
  'Punto de inyección sin cortar',
  'Hoyos',
  'Burbuja',
  'Rebaba',
  'Faltante de material',
  'Contracción',
  'Diferencia de color',
  'Mal llenado',
  'Plastisol despegado',
  'Plastisol mal colocado',
  'Manchado',
  'Rayado'
];

// Helper to determine delivery date
// Base date is set around local time: May 25, 2026
const BASE_DATE = new Date('2026-05-25T12:00:00Z');

// 6. Pedidos: Generar al menos 18 pedidos con idPedido, cliente, oc, fechaAlta, fechaCompromiso, totalPares, estatus, prioridad, responsable, porcentajeAvance, riesgoEntrega
export const INITIAL_ORDERS: Order[] = [];

// Helper lists
const RESPONSABLES_COMERCIALES = ['Juan de Dios Solís', 'María Elena Cabrera', 'Ing. Arturo Torres', 'Lic. Andrea Ruiz'];
const COMPRADORES = ['C. Moreno', 'T. Albarrán', 'L. Palomares', 'J. Garmendia', 'M. Lozano'];

// 18 Static/Programmatic Deterministic Pedidos
const ocs = ['OC-9031', 'OC-9842', 'OC-7103', 'OC-2244', 'OC-3155', 'OC-4116', 'OC-5077', 'OC-6188', 'OC-7129', 'OC-8190', 'OC-1121', 'OC-1232', 'OC-1343', 'OC-1454', 'OC-1565', 'OC-1676', 'OC-1787', 'OC-1898'];
const exchangeRates = [18.45, 18.50, 18.42, 18.52, 18.40, 18.35, 18.44, 18.48, 18.55, 18.51, 18.40, 18.45, 18.50, 18.42, 18.48, 18.36, 18.41, 18.45];

for (let i = 0; i < 18; i++) {
  const clObj = CLIENTS[i % CLIENTS.length];
  const modObj = MODELS[i % MODELS.length];
  const col = COLORS[i % COLORS.length];
  const total = 5000 + (i * 1500);
  const exRate = exchangeRates[i];
  const totalUSD = Math.round(total * modObj.basePriceUSD);
  const totalMXN = Math.round(totalUSD * exRate);
  
  // Dates
  const createdDate = new Date(BASE_DATE.getTime() - (30 - i) * 24 * 3600 * 1000);
  const deliveryDate = new Date(BASE_DATE.getTime() + (10 - i) * 24 * 3600 * 1000); // i=10 to i=17 will be upcoming, i=0 to i=9 will be past/vencido
  
  // Status and Delivery Risk
  let status: 'PENDIENTE' | 'PROCESANDO' | 'COMPLETADO' | 'CANCELADO' = 'PROCESANDO';
  if (i === 17) status = 'PENDIENTE';
  else if (i < 5) status = 'COMPLETADO';
  
  let riesgo: 'BAJO' | 'MEDIO' | 'ALTO' | 'VENCIDO' = 'BAJO';
  if (status === 'COMPLETADO') {
    riesgo = 'BAJO';
  } else if (deliveryDate.getTime() < BASE_DATE.getTime()) {
    riesgo = 'VENCIDO';
    status = 'PROCESANDO'; // Still ongoing but past delivery
  } else if (deliveryDate.getTime() - BASE_DATE.getTime() < 3 * 24 * 3600 * 1000) {
    riesgo = 'ALTO';
  } else if (deliveryDate.getTime() - BASE_DATE.getTime() < 7 * 24 * 3600 * 1000) {
    riesgo = 'MEDIO';
  }

  const progress = status === 'COMPLETADO' ? 100 : Math.round(20 + (i * 4.2));

  const orderId = `PED-2026-${String(200 + i).padStart(3, '0')}`;
  INITIAL_ORDERS.push({
    id: orderId,
    tenantId: i % 3 === 0 ? 'plasyect_matriz' : i % 3 === 1 ? 'plasyect_suelas' : 'plasyect_sandalias',
    clientId: clObj.id,
    clientName: clObj.name,
    modelId: modObj.id,
    modelName: modObj.name,
    color: col,
    quantity: total,
    exchangeRate: exRate,
    totalUSD: totalUSD,
    totalMXN: totalMXN,
    createdAt: createdDate.toISOString(),
    deliveryDate: deliveryDate.toISOString(),
    status: status,
    discountAuthorized: i % 2 === 0,
    discountPercentage: i % 2 === 0 ? 5 : 0,

    // Spanish / Realistic
    idPedido: orderId,
    cliente: clObj.name,
    oc: ocs[i],
    fechaAlta: createdDate.toISOString(),
    fechaCompromiso: deliveryDate.toISOString(),
    totalPares: total,
    estatus: status,
    prioridad: clObj.priority,
    responsable: RESPONSABLES_COMERCIALES[i % RESPONSABLES_COMERCIALES.length],
    porcentajeAvance: progress,
    riesgoEntrega: riesgo
  });
}

// 7. Lotes: Generar al menos 45 lotes distribuidos entre esos 18 pedidos
export const INITIAL_BATCHES: Batch[] = [];

// We will also accumulate movements stage logs
export const MOVIMIENTOS: MovementStage[] = [];

const OPERATORS = ['Téc. Sofía Ruiz', 'Téc. Alfredo Ríos', 'Ing. Pedro Ortiz', 'Ing. Luis Hernández', 'Téc. Arturo Olvera', 'Ing. Manuel Gómez', 'Téc. Alejandro N.', 'Dora Elizabeth S.'];

// Generate 45 batches mapping to the 18 orders
let totalLotesGenerated = 0;
let moveIdIndex = 1;

for (let orderIdx = 0; orderIdx < 18; orderIdx++) {
  const orderObj = INITIAL_ORDERS[orderIdx];
  
  // Decide how many batches to make for this order (usually 2 or 3)
  const numBatches = orderIdx % 3 === 0 ? 3 : 2;
  const sizesForOrder = orderIdx % 2 === 0 ? [24, 25, 26] : [27, 28];

  for (let bIdx = 0; bIdx < numBatches; bIdx++) {
    if (totalLotesGenerated >= 45) break;

    const size = sizesForOrder[bIdx % sizesForOrder.length];
    const qtyShoes = Math.round(orderObj.quantity / numBatches);
    const batchId = `LOTE-26-${String(401 + totalLotesGenerated).padStart(3, '0')}`;
    
    // Distribute nicely across stages
    // Stages: alta_pedido, almacen, inyeccion, stabilisacion, aduana, banda, embarque
    let stageId: StageId = 'inyeccion';
    if (orderObj.status === 'COMPLETADO') {
      stageId = 'embarque';
    } else {
      const stageIdx = (totalLotesGenerated) % STAGES.length;
      stageId = STAGES[stageIdx].id as StageId;
    }

    // Status: OPTIMO, ALERTA, CRITICO, DETENIDO
    let batchStatus: 'OPTIMO' | 'ALERTA' | 'CRITICO' | 'DETENIDO' | 'ARCHIVADO' = 'OPTIMO';
    if (totalLotesGenerated % 9 === 2) {
      batchStatus = 'ALERTA';
    } else if (totalLotesGenerated % 9 === 5) {
      batchStatus = 'CRITICO';
    } else if (totalLotesGenerated % 11 === 10) {
      batchStatus = 'DETENIDO';
    }

    const defectR = batchStatus === 'CRITICO' ? 4.8 + (orderIdx * 0.1) : batchStatus === 'ALERTA' ? 2.3 + (orderIdx * 0.15) : 0.4;
    const dens = stageId === 'alta_pedido' || stageId === 'almacen' ? 0 : 0.22 + (orderIdx * 0.005);
    const expFactor = 1.45 + (orderIdx * 0.015);
    
    // Set a date tracker for latest update
    const updateDate = new Date(BASE_DATE.getTime() - (orderIdx % 4) * 4 * 3600 * 1000);

    // Build Batch
    const batchObj: Batch = {
      id: batchId,
      tenantId: orderObj.tenantId,
      orderId: orderObj.id,
      modelId: orderObj.modelId,
      modelName: orderObj.modelName,
      color: orderObj.color,
      size: size,
      quantityShoes: qtyShoes,
      stage: stageId,
      machineId: stageId === 'inyeccion' ? `maq_${(totalLotesGenerated % 3) + 1}` : undefined,
      bandId: stageId === 'banda' ? `banda_${(totalLotesGenerated % 2) === 0 ? 'a' : 'b'}` : undefined,
      operatorId: OPERATORS[totalLotesGenerated % OPERATORS.length],
      densityMeasured: Number(dens.toFixed(3)),
      shrinkageRatio: Number(expFactor.toFixed(2)),
      temperatureTarget: 165 + (orderIdx * 1.5),
      cycleTimeSeconds: 200 + (orderIdx * 5),
      status: batchStatus,
      defectRate: Number(defectR.toFixed(1)),
      lastUpdate: updateDate.toISOString(),

      // Spanish keys
      idLote: batchId,
      tarjetaViajera: `TV-${batchId}`,
      codigoBarras: `7500123${String(totalLotesGenerated).padStart(5, '0')}`,
      cliente: orderObj.clientName,
      modelo: orderObj.modelName,
      totalPares: qtyShoes,
      etapaActual: stageId,
      paresEnEtapa: qtyShoes,
      fechaAlta: orderObj.createdAt,
      fechaCompromiso: orderObj.deliveryDate,
      ultimoEscaneo: updateDate.toISOString(),
      tiempoEnEtapaMinutos: (totalLotesGenerated % 4 === 1 && (stageId === 'banda' || stageId === 'estabilizacion')) ? 4120 : 120 + (totalLotesGenerated * 45), // Cuello de botella simulado en Banda / Estabilizacion - más de 1000 mins
      porcentajeAvance: orderObj.porcentajeAvance,
      estatus: batchStatus,
      responsableActual: OPERATORS[(totalLotesGenerated + 2) % OPERATORS.length],
      observaciones: batchStatus === 'CRITICO' ? 'Alta rechupe y rebaba extrema. Ajuste de plato requerido.' : 'Operación normal de soplado molecular.'
    };

    INITIAL_BATCHES.push(batchObj);

    // 8. Generate simulated movements per stage for this Batch
    // We will generate sequential movements from stage 1 (alta_pedido) up to current stage
    const currentStageObj = STAGES.find(s => s.id === stageId) || STAGES[0];
    const totalStagesToTraverse = currentStageObj.order;

    for (let stIdx = 1; stIdx <= totalStagesToTraverse; stIdx++) {
      const st = STAGES[stIdx - 1];
      const entryTime = new Date(new Date(orderObj.createdAt).getTime() + (stIdx - 1) * 12 * 3600 * 1000);
      const exitTime = stIdx === totalStagesToTraverse ? null : new Date(entryTime.getTime() + 10 * 3600 * 1000);
      
      // Simulate bottleneck in Banda and Estabilizacion (longer duration)
      let duration = 600; // 10 hours baseline
      if (st.id === 'banda' || st.id === 'estabilizacion') {
        duration = 3200 + (totalLotesGenerated * 120); // bottleneck: 50+ hours
      } else {
        duration = 180 + (totalLotesGenerated * 15);
      }

      MOVIMIENTOS.push({
        idMovimiento: `MOV-${String(moveIdIndex++).padStart(4, '0')}`,
        idLote: batchId,
        etapa: st.name,
        fechaEntrada: entryTime.toISOString(),
        fechaSalida: exitTime ? exitTime.toISOString() : null,
        pares: qtyShoes,
        usuarioEscaneo: OPERATORS[(stIdx + totalLotesGenerated) % OPERATORS.length],
        duracionMinutos: exitTime ? duration : Math.round((BASE_DATE.getTime() - entryTime.getTime()) / (60 * 1000))
      });
    }

    totalLotesGenerated++;
  }
}

// Ensure exactly at least 45 lotes
if (totalLotesGenerated < 45) {
  // Safe failsafe, though loop above generates exactly ~45 batches
  console.log(`Generated ${totalLotesGenerated} batches.`);
}

// 9. Calidad: Generar registros de calidad para inyección y banda con mayor mermas en Ruby
export const CALIDAD_RECORDS: QualityRecord[] = [];

// Static/Programmatic quality records across dates and shifts
const INSPECTORES_CALIDAD = ['Ins. Carlos Vaca', 'Ins. Elena Torres', 'Ins. Raúl Díaz', 'Ins. Roberto Solano'];
const LIDERES_AREA = ['Líd. Francisco M.', 'Líd. Amancio G.', 'Líd. Sonia Juárez'];

const qualityBatches = INITIAL_BATCHES.slice(0, 20); // Sample 20 batches for quality inspection logs
qualityBatches.forEach((tb, index) => {
  const isRuby = tb.modelName.includes('Ruby');
  
  // Ruby ultra model produces more defects
  const totalInspected = 500 + (index * 100);
  const mermQty = isRuby ? Math.round(totalInspected * 0.052) : Math.round(totalInspected * 0.008);
  const secondQty = isRuby ? Math.round(totalInspected * 0.045) : Math.round(totalInspected * 0.012);
  const reprocQty = isRuby ? Math.round(totalInspected * 0.035) : Math.round(totalInspected * 0.018);
  const firstsQty = totalInspected - (mermQty + secondQty + reprocQty);
  
  const def = isRuby ? 'Dimensión fuera de especificación' : 'Rebaba';
  const pctDefectivo = Number(((totalInspected - firstsQty) / totalInspected * 100).toFixed(2));

  CALIDAD_RECORDS.push({
    fecha: new Date(BASE_DATE.getTime() - (index % 3) * 24 * 3600 * 1000).toISOString().split('T')[0],
    turno: (index % 3 === 0 ? '1' : index % 3 === 1 ? '2' : '3') as '1' | '2' | '3',
    area: index % 2 === 0 ? 'INYECCION' : 'BANDA',
    maquinaOBanda: index % 2 === 0 ? `Inyectora ${String(index % 3 + 1)}` : `Banda Trim-${String(index % 2 + 1)}`,
    inspector: INSPECTORES_CALIDAD[index % INSPECTORES_CALIDAD.length],
    lider: LIDERES_AREA[index % LIDERES_AREA.length],
    lote: tb.id,
    modelo: tb.modelName,
    color: tb.color,
    talla: tb.size,
    totalInspeccionado: totalInspected,
    primeras: firstsQty,
    segundas: secondQty,
    reproceso: reprocQty,
    merma: mermQty,
    defecto: def,
    cantidadDefecto: mermQty + secondQty,
    porcentajeDefectivo: pctDefectivo
  });
});

// 11. Producción por hora: area, fecha, hora, turno, metaHora, produccionReal, eficiencia, modelo, color, responsable
export const PRODUCCION_POR_HORA: HourlyProduction[] = [];

// Generate production history for last 24 working hours across 3 shifts
const HOURS_STR = ['07:00', '08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00', '02:00', '03:00', '04:00', '05:00', '06:00'];

HOURS_STR.forEach((hr, index) => {
  const hrNum = parseInt(hr.split(':')[0]);
  let turnVal: '1' | '2' | '3' = '1';
  if (hrNum >= 15 && hrNum < 23) turnVal = '2';
  else if (hrNum >= 23 || hrNum < 7) turnVal = '3';

  // Areas: INYECCION, BANDA, ESTABILIZACION
  const arList: ('INYECCION' | 'BANDA' | 'ESTABILIZACION')[] = ['INYECCION', 'BANDA', 'ESTABILIZACION'];
  
  arList.forEach((area, areaIdx) => {
    const model = MODELS[(index + areaIdx) % MODELS.length];
    const color = COLORS[(index + areaIdx) % COLORS.length];
    const meta = area === 'INYECCION' ? 550 : area === 'BANDA' ? 620 : 600;
    
    // Simulate slight drop of production in Banda/Estabilizacion to show bottleneck
    const realMultiplier = area === 'BANDA' ? 0.81 : area === 'ESTABILIZACION' ? 0.85 : 0.98;
    const prodReal = Math.round(meta * realMultiplier + (Math.sin(index) * 25));
    const efficiency = Number(((prodReal / meta) * 100).toFixed(1));

    PRODUCCION_POR_HORA.push({
      area: area,
      fecha: BASE_DATE.toISOString().split('T')[0],
      hora: hr,
      turno: turnVal,
      metaHora: meta,
      produccionReal: prodReal,
      eficiencia: efficiency,
      modelo: model.name,
      color: color,
      responsable: OPERATORS[index % OPERATORS.length]
    });
  });
});

// Machinery & Bands
export const INITIAL_MACHINES: Machine[] = [
  { id: 'maq_01', name: 'Inyectora King Steel 1 (CH-A)', type: 'INYECTORA', status: 'OPERANDO', temperature: 175.4, pressureBar: 120, clampingForceTons: 180, currentBatchId: 'LOTE-26-401' },
  { id: 'maq_02', name: 'Inyectora Liansheng ROT-8', type: 'INYECTORA', status: 'OPERANDO', temperature: 180.2, pressureBar: 118, clampingForceTons: 200, currentBatchId: 'LOTE-26-402' },
  { id: 'maq_03', name: 'Mezcladora Banbury T-50', type: 'MEZCLADORA', status: 'OPERANDO', temperature: 110.5, pressureBar: 45, clampingForceTons: 0 },
  { id: 'maq_04', name: 'Inyectora Main Group S-04', type: 'INYECTORA', status: 'MANTENIMIENTO', temperature: 24.1, pressureBar: 0, clampingForceTons: 150 },
  { id: 'maq_05', name: 'Estación Moldeo Rotativa 6E', type: 'MOLDEADORA', status: 'INACTIVA', temperature: 18.0, pressureBar: 0, clampingForceTons: 220 }
];

export const INITIAL_BANDS: Band[] = [
  { id: 'banda_a', name: 'Banda Detallado A (Corte y Marcado)', status: 'ACTIVA', speedMs: 0.82, currentBatchId: 'LOTE-26-405', inspectorId: 'Ins. Carlos Vaca' },
  { id: 'banda_b', name: 'Banda Detallado B (Flameado y Pintura)', status: 'ACTIVA', speedMs: 0.65, inspectorId: 'Ins. Elena Torres' },
  { id: 'banda_c', name: 'Banda Detallado C (Empaque y Cajas)', status: 'DETENIDA', speedMs: 0.0, inspectorId: 'Ins. Raúl Díaz' }
];

// Initial failures for incidents
export const INITIAL_DEFECTS: QualityDefect[] = [
  { id: 'def_01', batchId: 'LOTE-26-405', defectType: 'RECHUPE', severity: 'GRAVE', detectedAt: '2026-05-25T16:40:00Z', inspectorName: 'Ins. Carlos Vaca', notes: 'Excesiva contracción en talón por descalibración de enfriador. Talla reducida.', resolved: false },
  { id: 'def_02', batchId: 'LOTE-26-402', defectType: 'BURBUJA', severity: 'MODERADO', detectedAt: '2026-05-25T15:55:00Z', inspectorName: 'Ins. Elena Torres', notes: 'Burbujas en arco interno. Se ajusta tiempo de vulcanizado en celda 3.', resolved: true },
  { id: 'def_03', batchId: 'LOTE-26-405', defectType: 'FALTA_LLENADO', severity: 'GRAVE', detectedAt: '2026-05-25T16:43:00Z', inspectorName: 'Ins. Carlos Vaca', notes: 'Puntas sin completar. Puede ser falta de carga de masa pre-expandida.', resolved: false }
];

// Initial audit trace for transactions log
export const INITIAL_AUDITS: AuditLog[] = [
  { id: 'aud_01', tenantId: 'plasyect_matriz', timestamp: '2026-05-25T10:00:00Z', userId: 'lf.bedia@gmail.com', userRole: 'DIRECTOR_GENERAL', event: 'LOGIN_SUCCESS', module: 'AUTH', details: 'Sesión iniciada con Tenant: Plasyect Central' },
  { id: 'aud_02', tenantId: 'plasyect_matriz', timestamp: '2026-05-25T11:15:00Z', userId: 'lf.bedia@gmail.com', userRole: 'DIRECTOR_GENERAL', event: 'DISCOUNT_AUTHORIZED', module: 'COMERCIAL', details: 'Descuento del 5% aprobado para pedido PED-2026-200 de cliente Flexi.' },
  { id: 'aud_03', tenantId: 'plasyect_suelas', timestamp: '2026-05-25T14:10:00Z', userId: 'lf.bedia@gmail.com', userRole: 'LIDER_INYECCION', event: 'BATCH_MOVE', module: 'PRODUCCION', details: 'Lote LOTE-26-404 movido a etapa Aduana de Calidad.' }
];
