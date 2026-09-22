import { GoogleGenAI } from '@google/genai';
import { config } from './config.js';
import type { ErpOperationalResponse, ErpService } from './erp.js';

/** Mensaje previo de la conversacion que reenvia el frontend. */
export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface AiChatReply {
  reply: string;
  generatedAt: string;
  /** Fecha (planta) del snapshot de datos usado para responder. */
  dataDate: string | null;
}

export interface AiChatService {
  readonly enabled: boolean;
  chat(message: string, history: AiChatMessage[]): Promise<AiChatReply>;
}

const SNAPSHOT_TTL_MS = 60_000;
const HISTORY_LIMIT = 12;

// Conocimiento fijo del sistema: modulos visibles y de donde salen los datos.
// El asistente solo puede hablar de esto + el snapshot de datos que se le inyecta.
const SYSTEM_PROMPT = `Eres el asistente del Plasyect Intelligence Dashboard, un tablero industrial para una planta de sandalias EVA (Plasyect Matriz, León, Gto.). Respondes SIEMPRE en español, claro y conciso.

## Fuente de los datos
- Los datos operativos vienen del ERP BixApp (Firebird, BIGZAP.FDB) sincronizados a Postgres/Supabase por un sync-service. Cada "tarjeta viajera" equivale a un lote; cada escaneo de tarjeta es un movimiento entre etapas.
- Etapas del proceso: Alta de Pedido → Almacén → Inyección → Calidad → Aduana → Banda → Embarque → Facturación.
- El FDB NO registra defectos ni calidad reales (todos los movimientos llegan con calidad "primera"). Si preguntan por defectos, segundas o mermas reales, aclara que el sistema aún no los recibe del ERP.
- Los datos de OCR y registros de inspección de calidad se capturan manualmente en el dashboard.

## Módulos del dashboard (menú lateral)
- **Dashboard Ejecutivo**: KPIs de planta, producción del día, pipeline global.
- **Pipeline por Lote**: seguimiento de lotes (tarjetas viajeras) por etapa, con diagnóstico por lote.
- **Pipeline por Pedido**: avance y riesgo de entrega por pedido (vencido/alto/medio/bajo).
- **Producción por Área**: throughput por etapa/área y por hora.
- **Modelos y Productos**: desempeño por modelo (volumen, lead time, cumplimiento) con insights bajo demanda.
- **OCR y Validación EVA**: validación de documentos escaneados.
- **Reportes Históricos**, **Catálogos**, **Configuración / RBAC**.

## Reglas estrictas
1. Responde SOLO con la información del "Snapshot de datos" que se te entrega y con el conocimiento de módulos de arriba. NUNCA inventes lotes, pedidos, clientes, máquinas, operadores, fechas ni cifras.
2. Cita números exactos del snapshot cuando existan (pares, lotes, %, fechas).
3. Si la pregunta requiere un dato que no está en el snapshot (p. ej. un lote específico, costos, nómina, inventario de materia prima), dilo explícitamente e indica en qué módulo podría verse si aplica, o aclara que el sistema no registra ese dato.
4. Si preguntan cómo hacer algo en el dashboard, responde con pasos numerados usando los nombres exactos de los módulos.
5. Máximo ~4 párrafos o una lista corta. No repitas la pregunta. No uses tablas Markdown grandes.
6. Los datos del snapshot corresponden a la fecha indicada en él (zona horaria de la planta). Si el snapshot indica que no hubo datos del día consultado, acláralo.`;

interface Snapshot {
  fecha: string | null;
  contexto: string;
  at: number;
}

function plantToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: config.PLANT_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/** Reduce la respuesta operativa completa a un contexto compacto y 100% derivado del sistema. */
export function buildChatContext(data: ErpOperationalResponse, fechaConsultada: string): { fecha: string | null; contexto: string } {
  const fecha = data.meta.hasPeriodData ? fechaConsultada : data.meta.dataMaxDate;

  const intakeStage = data.stagePipeline.find((s) => s.stageId === 'alta_pedido');
  const stageLines = data.stagePipeline
    .filter((s) => s.stageId !== 'alta_pedido')
    .map((s) =>
      `- ${s.stageName}: ${s.pairs.toLocaleString()} pares en ${s.batches} lotes (${s.wipPct}% del WIP, saturación ${s.saturation}${s.avgMinutes != null ? `, ${Math.round(s.avgMinutes)} min prom.` : ''})`
    );

  const riesgo = data.orderRisk;
  const topRiesgo = riesgo.rows
    .filter((o) => o.risk === 'VENCIDO' || o.risk === 'ALTO')
    .slice(0, 12)
    .map((o) =>
      `- Pedido ${o.id} (${o.cliente}${o.modelo ? `, ${o.modelo}` : ''}): ${o.producedPairs.toLocaleString()}/${o.totalPares.toLocaleString()} pares (${o.progress}%), compromiso ${o.fechaCompromiso ?? 'sin fecha'}, riesgo ${o.risk}${o.daysLeft != null ? `, ${o.daysLeft} días restantes` : ''}`
    );

  const dailyProd = data.dailyProduction.slice(-14).map((d) => `- ${d.fecha}: ${d.pares.toLocaleString()} pares (${d.tarjetas} escaneos)`);

  const prodPorArea = new Map<string, number>();
  for (const row of data.productionHourly) {
    prodPorArea.set(row.area, (prodPorArea.get(row.area) ?? 0) + row.produccionReal);
  }
  const areaLines = Array.from(prodPorArea.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([area, pares]) => `- ${area}: ${pares.toLocaleString()} pares`);

  const topModelos = [...data.models]
    .sort((a, b) => b.paresProducidos - a.paresProducidos)
    .slice(0, 10)
    .map((m) =>
      `- ${m.modeloName}${m.color ? ` ${m.color}` : ''} (${m.cliente || 'sin cliente'}): ${m.paresProducidos.toLocaleString()} pares, ${m.lotes} lotes, etapa dominante ${m.etapaActiva}${m.leadTimeHours > 0 ? `, lead time ${(m.leadTimeHours / 24).toFixed(1)} días` : ''}`
    );

  const contexto = `## Snapshot de datos del sistema (fecha planta: ${fecha ?? 'sin datos'}, consultado: ${fechaConsultada})
- Última sincronización con BixApp: ${data.meta.lastSync ?? 'desconocida'}
- Datos del día consultado disponibles: ${data.meta.hasPeriodData ? 'sí' : `no (último día con datos: ${data.meta.dataMaxDate ?? 'ninguno'})`}
- Calidad/defectos reales disponibles: ${data.meta.qualityAvailable ? 'sí' : 'no (el ERP no registra defectos; todo llega como primera)'}

### Estado actual de planta
- Pedidos activos: ${data.active.orders ?? 'N/D'} | Lotes activos: ${data.active.batches ?? 'N/D'} | Pares en proceso: ${data.active.pairs?.toLocaleString() ?? 'N/D'}
- Avance global WIP: ${data.wipSummary.globalProgress}% (${data.wipSummary.activeBatches} lotes, ${data.wipSummary.activePairs.toLocaleString()} pares)
${intakeStage ? `- Alta Pedido: ${intakeStage.pairs.toLocaleString()} pares en ${intakeStage.batches} lotes capturados, pero NO cuenta como WIP productivo ni como pares en proceso de planta.` : ''}

### WIP productivo por etapa (excluye Alta Pedido)
${stageLines.join('\n') || '- Sin datos de etapas'}

### Riesgo de entrega (pedidos abiertos: ${riesgo.totalOpen})
- Vencidos: ${riesgo.vencido} | Riesgo alto: ${riesgo.alto} | Medio: ${riesgo.medio} | Bajo: ${riesgo.bajo}
${topRiesgo.length ? `Pedidos más urgentes:\n${topRiesgo.join('\n')}` : 'Sin pedidos vencidos ni de riesgo alto en el corte.'}

### Producción del período consultado por área (pares escaneados)
${areaLines.join('\n') || '- Sin producción registrada en el período'}

### Producción diaria reciente
${dailyProd.join('\n') || '- Sin serie diaria'}

### Top modelos del período
${topModelos.join('\n') || '- Sin modelos con producción en el período'}`;

  return { fecha, contexto };
}

class GeminiChatService implements AiChatService {
  readonly enabled = true;
  private readonly client: GoogleGenAI;
  private snapshot: Snapshot | null = null;
  private snapshotPromise: Promise<Snapshot> | null = null;

  constructor(private readonly erp: ErpService, apiKey: string) {
    this.client = new GoogleGenAI({ apiKey });
  }

  private async getSnapshot(): Promise<Snapshot> {
    if (this.snapshot && Date.now() - this.snapshot.at < SNAPSHOT_TTL_MS) return this.snapshot;
    if (this.snapshotPromise) return this.snapshotPromise;
    this.snapshotPromise = (async () => {
      const hoy = plantToday();
      const data = await this.erp.getOperational(hoy, hoy);
      const { fecha, contexto } = buildChatContext(data, hoy);
      const snap: Snapshot = { fecha, contexto, at: Date.now() };
      this.snapshot = snap;
      return snap;
    })().finally(() => {
      this.snapshotPromise = null;
    });
    return this.snapshotPromise;
  }

  async chat(message: string, history: AiChatMessage[]): Promise<AiChatReply> {
    const snapshot = await this.getSnapshot();

    const contents = [
      ...history.slice(-HISTORY_LIMIT).map((m) => ({
        role: m.role === 'user' ? ('user' as const) : ('model' as const),
        parts: [{ text: m.content }]
      })),
      { role: 'user' as const, parts: [{ text: message }] }
    ];

    const response = await this.client.models.generateContent({
      model: config.GEMINI_MODEL,
      contents,
      config: {
        systemInstruction: `${SYSTEM_PROMPT}\n\n${snapshot.contexto}`,
        temperature: 0.3,
        maxOutputTokens: 1024
      }
    });

    return {
      reply: response.text?.trim() || 'No pude generar una respuesta con los datos actuales. Intenta reformular la pregunta.',
      generatedAt: new Date().toISOString(),
      dataDate: snapshot.fecha
    };
  }
}

class DisabledAiChatService implements AiChatService {
  readonly enabled = false;

  async chat(): Promise<AiChatReply> {
    return {
      reply: 'El asistente IA no está configurado (falta GEMINI_API_KEY en el backend).',
      generatedAt: new Date().toISOString(),
      dataDate: null
    };
  }
}

export function createAiChatService(erp: ErpService): AiChatService {
  if (!config.GEMINI_API_KEY || !erp.enabled) return new DisabledAiChatService();
  return new GeminiChatService(erp, config.GEMINI_API_KEY);
}
