const OCR_BASE_URL = (import.meta.env.VITE_OCR_SERVICE_URL || '').replace(/\/$/, '');

export const ocrEnabled = Boolean(OCR_BASE_URL);

export interface FieldSchema {
  id: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  pageNumber: number;
  mapping?: { x: number; y: number; w: number; h: number };
  validation_rules?: { min: number | null; max: number | null; unit: string | null };
}

export interface TableSchema {
  id: string;
  label: string;
  columns: FieldSchema[];
}

export interface LetterSchema {
  fields: FieldSchema[];
  tables: TableSchema[];
}

export interface LetterType {
  id: string;
  nombre: string;
  descripcion: string | null;
  schema: LetterSchema;
  activo: boolean;
  creado_en: string;
  actualizado_en: string;
}

export interface Responsable {
  id: number;
  letra_tipo_id: string;
  area: string;
  turno: string;
  nombre: string;
  email: string | null;
  notificar: boolean;
}

export interface OcrReport {
  id: string;
  letra_tipo_id: string;
  letra_tipo_nombre?: string;
  nombre_archivo: string | null;
  fecha_carga: string;
  usuario_carga: string | null;
  estado: string;
  datos_extraidos: { data: Record<string, unknown>; tables: Record<string, unknown[]> };
  datos_corregidos: { data: Record<string, unknown>; tables: Record<string, unknown[]> };
  confianza_promedio: number | null;
  alertas: string[];
  aprobador: string | null;
  fecha_aprobacion: string | null;
  notas: string | null;
  creado_en: string;
  actualizado_en: string;
}

export interface ExtractionResult {
  reporte_id: string;
  estado: string;
  data: Record<string, unknown>;
  tables: Record<string, unknown[]>;
  alerts: string[];
  confianza_promedio: number | null;
  responsables_notificados: Responsable[];
  ocr_error?: string;
}

async function ocrFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  if (!ocrEnabled) throw new Error('OCR service URL no configurado (VITE_OCR_SERVICE_URL)');
  const res = await fetch(`${OCR_BASE_URL}${path}`, options);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`OCR ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

// ── Letter types ──────────────────────────────────────────

export async function fetchLetterTypes(): Promise<LetterType[]> {
  const { tipos } = await ocrFetch<{ tipos: LetterType[] }>('/letras/tipos');
  return tipos;
}

export async function fetchLetterType(id: string): Promise<LetterType> {
  return ocrFetch<LetterType>(`/letras/tipos/${id}`);
}

export async function createLetterType(body: { nombre: string; descripcion?: string; schema?: LetterSchema }): Promise<LetterType> {
  return ocrFetch<LetterType>('/letras/tipos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateLetterType(id: string, body: Partial<LetterType>): Promise<LetterType> {
  return ocrFetch<LetterType>(`/letras/tipos/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function generateLetterTypeFromFile(file: File, nombre: string): Promise<LetterType> {
  const form = new FormData();
  form.append('file', file);
  form.append('nombre', nombre);
  return ocrFetch<LetterType>('/letras/tipos/desde-archivo', { method: 'POST', body: form });
}

// ── Responsables ──────────────────────────────────────────

export async function fetchResponsables(params?: { letra_tipo_id?: string; area?: string; turno?: string }): Promise<Responsable[]> {
  const qs = new URLSearchParams();
  if (params?.letra_tipo_id) qs.set('letra_tipo_id', params.letra_tipo_id);
  if (params?.area) qs.set('area', params.area);
  if (params?.turno) qs.set('turno', params.turno);
  const { responsables } = await ocrFetch<{ responsables: Responsable[] }>(`/responsables${qs.toString() ? '?' + qs : ''}`);
  return responsables;
}

export async function createResponsable(body: Omit<Responsable, 'id'>): Promise<Responsable> {
  return ocrFetch<Responsable>('/responsables', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function updateResponsable(id: number, body: Partial<Responsable>): Promise<Responsable> {
  return ocrFetch<Responsable>(`/responsables/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function deleteResponsable(id: number): Promise<void> {
  await ocrFetch<void>(`/responsables/${id}`, { method: 'DELETE' });
}

// ── Reports ───────────────────────────────────────────────

export async function fetchReports(params?: { letra_tipo_id?: string; estado?: string; limit?: number; offset?: number }): Promise<OcrReport[]> {
  const qs = new URLSearchParams();
  if (params?.letra_tipo_id) qs.set('letra_tipo_id', params.letra_tipo_id);
  if (params?.estado) qs.set('estado', params.estado);
  if (params?.limit) qs.set('limit', String(params.limit));
  if (params?.offset) qs.set('offset', String(params.offset));
  const { reportes } = await ocrFetch<{ reportes: OcrReport[] }>(`/reportes${qs.toString() ? '?' + qs : ''}`);
  return reportes;
}

export async function fetchReport(id: string): Promise<OcrReport> {
  return ocrFetch<OcrReport>(`/reportes/${id}`);
}

export async function updateReport(id: string, body: { datos_corregidos?: unknown; notas?: string }): Promise<OcrReport> {
  return ocrFetch<OcrReport>(`/reportes/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export async function transitionReportState(id: string, estado: string, extra?: { aprobador?: string; notas?: string }): Promise<{ ok: boolean; estado_nuevo: string; responsables_notificados: Responsable[] }> {
  return ocrFetch(`/reportes/${id}/estado`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ estado, ...extra }),
  });
}

// ── Streaming extraction ──────────────────────────────────

export type StreamEvent =
  | { type: 'progress'; message: string; docai_error?: string; ocr?: unknown }
  | { type: 'chunk'; text: string }
  | { type: 'done' } & ExtractionResult;

export function extractReportStream(
  file: File,
  letraTipoId: string,
  opts: { usuario_carga?: string; area?: string; turno?: string } = {},
  handlers: {
    onProgress?: (msg: string) => void;
    onDone?: (result: ExtractionResult) => void;
    onError?: (err: string) => void;
  } = {},
): AbortController {
  const controller = new AbortController();

  (async () => {
    if (!ocrEnabled) {
      handlers.onError?.('OCR service URL no configurado');
      return;
    }
    const form = new FormData();
    form.append('file', file);
    form.append('letra_tipo_id', letraTipoId);
    if (opts.usuario_carga) form.append('usuario_carga', opts.usuario_carga);
    if (opts.area) form.append('area', opts.area);
    if (opts.turno) form.append('turno', opts.turno);

    try {
      const res = await fetch(`${OCR_BASE_URL}/reportes/stream`, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        handlers.onError?.(`Error ${res.status}: ${res.statusText}`);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const part of parts) {
          const line = part.trim();
          if (!line.startsWith('data:')) continue;
          try {
            const event: StreamEvent = JSON.parse(line.slice(5).trim());
            if (event.type === 'progress') handlers.onProgress?.(event.message);
            if (event.type === 'done') handlers.onDone?.(event as ExtractionResult);
          } catch {
            // ignore malformed SSE lines
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name !== 'AbortError') {
        handlers.onError?.((err as Error).message || 'Error desconocido');
      }
    }
  })();

  return controller;
}
