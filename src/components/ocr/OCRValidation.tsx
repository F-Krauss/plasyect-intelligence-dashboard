import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import {
  ScanLine, Upload, CheckCircle2, AlertTriangle, Play, FileText,
  Check, X, RefreshCw, FileSpreadsheet, UserCheck, Save, FileSearch,
  FileSearch2, Lock, Sparkles, Users, Settings, Bell, Trash2, Plus, Camera,
} from 'lucide-react';
import {
  ocrEnabled,
  fetchLetterTypes, fetchLetterType, generateLetterTypeFromFile,
  fetchResponsables, createResponsable, updateResponsable, deleteResponsable,
  fetchReports, updateReport, transitionReportState,
  extractReportStream,
  type LetterType, type LetterSchema, type FieldSchema,
  type Responsable, type OcrReport, type ExtractionResult,
} from '../../api/ocrApi';

type Confidence = 'Alta' | 'Media' | 'Baja';
type OcrStatus = 'pendiente_ocr' | 'ocr_completado' | 'en_validacion' | 'aprobado' | 'rechazado' | 'correccion_requerida';

interface DynamicField {
  value: string;
  confidence: Confidence;
  originalValue: string;
}

interface LocalDocument {
  id: string;
  fileName: string;
  letraTipoId: string;
  letraTipoNombre: string;
  uploadDate: string;
  user: string;
  estado: OcrStatus;
  fields: Record<string, DynamicField>;
  schema: LetterSchema;
  detectedCount: number;
  averageConfidence: number;
  aprobador?: string;
  reporteId?: string;
  responsables?: Responsable[];
  alerts?: string[];
}

const ESTADO_LABELS: Record<OcrStatus, string> = {
  pendiente_ocr: 'Pendiente OCR',
  ocr_completado: 'OCR completado',
  en_validacion: 'En validación',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  correccion_requerida: 'Corrección requerida',
};

const ESTADO_COLORS: Record<OcrStatus, string> = {
  pendiente_ocr: 'bg-slate-100 text-slate-700 border border-slate-300',
  ocr_completado: 'bg-cyan-50 text-cyan-800 border border-cyan-300',
  en_validacion: 'bg-blue-50 text-blue-800 border border-blue-300',
  aprobado: 'bg-emerald-50 text-emerald-800 border border-emerald-300',
  rechazado: 'bg-rose-50 text-rose-800 border border-rose-300',
  correccion_requerida: 'bg-amber-50 text-amber-800 border border-amber-300',
};

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  Alta: 'text-emerald-750 bg-emerald-50 border border-emerald-250',
  Media: 'text-amber-850 bg-amber-50 border border-amber-250',
  Baja: 'text-rose-850 bg-rose-50 border border-rose-250',
};

const DEMO_LETTER_TYPES: LetterType[] = [
  { id: 'inspeccion_calidad_inyeccion', nombre: 'Reporte de inspección de calidad en inyección', descripcion: null, schema: { fields: [], tables: [] }, activo: true, creado_en: '', actualizado_en: '' },
  { id: 'inspeccion_calidad_banda', nombre: 'Reporte de inspección de calidad en banda', descripcion: null, schema: { fields: [], tables: [] }, activo: true, creado_en: '', actualizado_en: '' },
  { id: 'liberacion_flujo_produccion', nombre: 'Liberación y flujo de producción', descripcion: null, schema: { fields: [], tables: [] }, activo: true, creado_en: '', actualizado_en: '' },
  { id: 'producto_primeras', nombre: 'Producto primeras', descripcion: null, schema: { fields: [], tables: [] }, activo: true, creado_en: '', actualizado_en: '' },
  { id: 'producto_segundas', nombre: 'Producto segundas', descripcion: null, schema: { fields: [], tables: [] }, activo: true, creado_en: '', actualizado_en: '' },
  { id: 'bitacora_produccion', nombre: 'Bitácora manual de producción', descripcion: null, schema: { fields: [], tables: [] }, activo: true, creado_en: '', actualizado_en: '' },
];

const DEMO_FIELDS: FieldSchema[] = [
  { id: 'fecha', label: 'Fecha', type: 'date', pageNumber: 1 },
  { id: 'turno', label: 'Turno', type: 'string', pageNumber: 1 },
  { id: 'area', label: 'Área', type: 'string', pageNumber: 1 },
  { id: 'inspector', label: 'Inspector', type: 'string', pageNumber: 1 },
  { id: 'lider', label: 'Líder', type: 'string', pageNumber: 1 },
  { id: 'maquina_banda', label: 'Máquina / Banda', type: 'string', pageNumber: 1 },
  { id: 'cliente', label: 'Cliente', type: 'string', pageNumber: 1 },
  { id: 'oc', label: 'OC (Orden de Compra)', type: 'string', pageNumber: 1 },
  { id: 'lote', label: 'Lote', type: 'string', pageNumber: 1 },
  { id: 'modelo', label: 'Modelo', type: 'string', pageNumber: 1 },
  { id: 'color', label: 'Color', type: 'string', pageNumber: 1 },
  { id: 'total_pares', label: 'Total Pares', type: 'number', pageNumber: 1 },
  { id: 'primeras', label: 'Primeras', type: 'number', pageNumber: 1 },
  { id: 'segundas', label: 'Segundas', type: 'number', pageNumber: 1 },
  { id: 'defectos', label: 'Defectos', type: 'string', pageNumber: 1 },
  { id: 'observaciones', label: 'Observaciones', type: 'string', pageNumber: 1 },
];

const DEMO_DATA: Record<string, Record<string, string>> = {
  inspeccion_calidad_inyeccion: { fecha: '2026-05-25', turno: 'Matutino', area: 'Inyección EVA', inspector: 'Ing. Hugo Martínez', lider: 'Raúl Sánchez', maquina_banda: 'Inyectora EVA #3', cliente: 'Calzado Andrea', oc: 'OC-2026-4418', lote: 'LOTE-771-EVA', modelo: 'Zapatilla EVA Spring', color: 'Rosa Humo', total_pares: '1250', primeras: '1220', segundas: '30', defectos: 'Marcas de desmolde en 12 pares', observaciones: 'Parámetros de presión normales' },
  inspeccion_calidad_banda: { fecha: '2026-05-25', turno: 'Vespertino', area: 'Banda de Acabado', inspector: 'Lic. Sandra Peralta', lider: 'Diana Cruz', maquina_banda: 'Banda de Concurrencia #2', cliente: 'Corporativo Flexi', oc: 'OC-9902-FLE', lote: 'LOTE-882-BND', modelo: 'Classic Walker EVA', color: 'Gris Oxford', total_pares: '2400', primeras: '2350', segundas: '50', defectos: 'Rebaba en junta talón en 32 pares', observaciones: 'Velocidad de banda ajustada' },
};

function buildDemoFields(tipoId: string, user: string): Record<string, DynamicField> {
  const data = DEMO_DATA[tipoId] || {};
  const result: Record<string, DynamicField> = {};
  for (const f of DEMO_FIELDS) {
    const val = f.id === 'inspector' ? user : (data[f.id] || '');
    result[f.id] = { value: val, confidence: val ? 'Alta' : 'Baja', originalValue: val };
  }
  return result;
}

function buildEmptyFields(schema: LetterSchema): Record<string, DynamicField> {
  const result: Record<string, DynamicField> = {};
  const allFields = [...(schema.fields || []), ...(schema.tables || []).flatMap(t => t.columns || [])];
  for (const f of allFields) {
    result[f.id] = { value: '', confidence: 'Baja', originalValue: '' };
  }
  return result;
}

function fieldsFromExtraction(schema: LetterSchema, data: Record<string, unknown>): Record<string, DynamicField> {
  const result: Record<string, DynamicField> = {};
  const allFields = [...(schema.fields || []), ...(schema.tables || []).flatMap(t => t.columns || [])];
  for (const f of allFields) {
    const val = data[f.id] != null ? String(data[f.id]) : '';
    result[f.id] = { value: val, confidence: val ? 'Alta' : 'Baja', originalValue: val };
  }
  return result;
}

function countCorrected(fields: Record<string, DynamicField>): number {
  return Object.values(fields).filter(f => f.value !== f.originalValue).length;
}

// ────────────────────────────────────────────────────────────
// Dynamic field renderer
// ────────────────────────────────────────────────────────────

interface DynamicFieldInputProps {
  fieldDef: FieldSchema;
  field: DynamicField;
  onChange: (value: string) => void;
  onConfidenceChange: (c: Confidence) => void;
  disabled: boolean;
}

const DynamicFieldInput: React.FC<DynamicFieldInputProps> = ({ fieldDef, field, onChange, onConfidenceChange, disabled }) => {
  const isModified = field.value !== field.originalValue;
  const isWide = fieldDef.type === 'string' && (fieldDef.label.toLowerCase().includes('observ') || fieldDef.label.toLowerCase().includes('defecto'));

  const inputClass = `w-full bg-slate-905 border ${isModified ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-200'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`;

  return (
    <div className={`space-y-1 ${isWide ? 'md:col-span-2' : ''}`}>
      <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
        <span className="font-bold text-slate-450 uppercase">{fieldDef.label}</span>
        <div className="flex items-center gap-1">
          <select
            value={field.confidence}
            onChange={e => onConfidenceChange(e.target.value as Confidence)}
            disabled={disabled}
            className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none disabled:opacity-40"
          >
            <option value="Alta">Alta</option>
            <option value="Media">Media</option>
            <option value="Baja">Baja</option>
          </select>
          <span className={`px-1 rounded-sm text-[8px] font-black ${CONFIDENCE_COLORS[field.confidence]}`}>
            {field.confidence}
          </span>
        </div>
      </div>
      <div className="relative">
        {isWide ? (
          <textarea
            value={field.value}
            onChange={e => onChange(e.target.value)}
            disabled={disabled}
            rows={2}
            className={`${inputClass} resize-none`}
          />
        ) : (
          <input
            type={fieldDef.type === 'number' ? 'number' : fieldDef.type === 'date' ? 'date' : 'text'}
            value={field.value}
            onChange={e => onChange(e.target.value)}
            disabled={disabled}
            className={inputClass}
          />
        )}
        {isModified && (
          <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">
            Modificado
          </span>
        )}
      </div>
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Responsables panel
// ────────────────────────────────────────────────────────────

interface ResponsablesPanelProps {
  letraTipoId: string;
  responsables: Responsable[];
  onRefresh: () => void;
}

const TURNOS = ['*', 'Matutino', 'Vespertino', 'Nocturno'];

const ResponsablesPanel: React.FC<ResponsablesPanelProps> = ({ letraTipoId, responsables, onRefresh }) => {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ nombre: '', email: '', area: '', turno: '*' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleAdd = async () => {
    if (!form.nombre || !form.area) { setError('Nombre y área son requeridos'); return; }
    setSaving(true);
    setError('');
    try {
      await createResponsable({ letra_tipo_id: letraTipoId, area: form.area, turno: form.turno, nombre: form.nombre, email: form.email || null, notificar: true });
      setForm({ nombre: '', email: '', area: '', turno: '*' });
      setAdding(false);
      onRefresh();
    } catch (e: unknown) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteResponsable(id);
      onRefresh();
    } catch {
      // silent
    }
  };

  const grouped: Record<string, Responsable[]> = {};
  for (const r of responsables) {
    const key = `${r.area} / ${r.turno === '*' ? 'Todos los turnos' : r.turno}`;
    (grouped[key] = grouped[key] || []).push(r);
  }

  return (
    <div className="space-y-3 text-xs">
      <p className="text-[10px] text-slate-500 italic">
        Los responsables reciben alertas cuando un reporte de este tipo cambia de estado.
      </p>

      {Object.keys(grouped).length === 0 && !adding && (
        <div className="py-6 text-center text-slate-500 text-[11px]">Sin responsables configurados.</div>
      )}

      {Object.entries(grouped).map(([group, items]) => (
        <div key={group} className="bg-slate-905 border border-slate-800 rounded p-2.5 space-y-1.5">
          <span className="text-[9px] font-extrabold font-mono text-slate-400 uppercase tracking-wider block">{group}</span>
          {items.map(r => (
            <div key={r.id} className="flex items-center justify-between gap-2">
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-slate-900 truncate block">{r.nombre}</span>
                {r.email && <span className="text-[10px] text-slate-500 font-mono truncate block">{r.email}</span>}
              </div>
              <button onClick={() => handleDelete(r.id)} className="p-1 text-rose-500 hover:bg-rose-50 rounded transition shrink-0">
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ))}

      {adding ? (
        <div className="bg-slate-905 border border-blue-300 rounded p-3 space-y-2">
          <span className="text-[10px] font-bold font-mono text-blue-700 block">Nuevo responsable</span>
          {error && <p className="text-[10px] text-rose-600">{error}</p>}
          <input placeholder="Nombre *" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))}
            className="w-full border border-slate-700 rounded p-1.5 text-xs focus:outline-none focus:border-blue-600" />
          <input placeholder="Email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            className="w-full border border-slate-700 rounded p-1.5 text-xs focus:outline-none focus:border-blue-600" />
          <input placeholder="Área *" value={form.area} onChange={e => setForm(p => ({ ...p, area: e.target.value }))}
            className="w-full border border-slate-700 rounded p-1.5 text-xs focus:outline-none focus:border-blue-600" />
          <select value={form.turno} onChange={e => setForm(p => ({ ...p, turno: e.target.value }))}
            className="w-full border border-slate-700 rounded p-1.5 text-xs focus:outline-none focus:border-blue-600">
            {TURNOS.map(t => <option key={t} value={t}>{t === '*' ? 'Todos los turnos' : t}</option>)}
          </select>
          <div className="flex gap-2 pt-1">
            <button onClick={handleAdd} disabled={saving}
              className="flex-1 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded text-xs transition disabled:opacity-50">
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
            <button onClick={() => { setAdding(false); setError(''); }}
              className="flex-1 py-1.5 border border-slate-700 rounded text-xs font-bold hover:bg-slate-100 transition">
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button onClick={() => setAdding(true)}
          className="w-full py-2 border border-dashed border-slate-600 hover:border-blue-500 rounded text-[11px] font-bold text-slate-500 hover:text-blue-600 flex items-center justify-center gap-1.5 transition">
          <Plus className="w-3.5 h-3.5" /> Agregar responsable
        </button>
      )}
    </div>
  );
};

// ────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────

export const OCRValidation: React.FC = () => {
  const { addAuditLog, currentUser } = useDashboard();

  const [letterTypes, setLetterTypes] = useState<LetterType[]>(DEMO_LETTER_TYPES);
  const [selectedTypeId, setSelectedTypeId] = useState<string>(DEMO_LETTER_TYPES[0].id);
  const [selectedType, setSelectedType] = useState<LetterType>(DEMO_LETTER_TYPES[0]);
  const [responsables, setResponsables] = useState<Responsable[]>([]);
  const [documents, setDocuments] = useState<LocalDocument[]>([]);
  const [activeDocId, setActiveDocId] = useState<string>('');
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('');
  const [rightTab, setRightTab] = useState<'validacion' | 'responsables'>('validacion');
  const [apiError, setApiError] = useState('');
  const [genSchema, setGenSchema] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const streamAbortRef = useRef<AbortController | null>(null);

  const activeDoc = documents.find(d => d.id === activeDocId) || documents[0];
  const activeSchema = selectedType?.schema?.fields?.length ? selectedType.schema : { fields: DEMO_FIELDS, tables: [] };

  // Load letter types on mount
  useEffect(() => {
    if (!ocrEnabled) return;
    fetchLetterTypes().then(types => {
      if (types.length > 0) {
        setLetterTypes(types);
        setSelectedTypeId(types[0].id);
        setSelectedType(types[0]);
      }
    }).catch(e => setApiError(e.message));
  }, []);

  // Reload letter type schema when selection changes
  useEffect(() => {
    if (!ocrEnabled) {
      const t = DEMO_LETTER_TYPES.find(t => t.id === selectedTypeId);
      if (t) setSelectedType(t);
      return;
    }
    fetchLetterType(selectedTypeId).then(t => setSelectedType(t)).catch(() => {
      const t = letterTypes.find(x => x.id === selectedTypeId);
      if (t) setSelectedType(t);
    });
  }, [selectedTypeId]);

  // Load responsables when type changes
  const loadResponsables = useCallback(() => {
    if (!ocrEnabled) return;
    fetchResponsables({ letra_tipo_id: selectedTypeId })
      .then(setResponsables)
      .catch(() => setResponsables([]));
  }, [selectedTypeId]);

  useEffect(() => { loadResponsables(); }, [loadResponsables]);

  // Load existing reports on mount
  useEffect(() => {
    if (!ocrEnabled) {
      setDocuments([]);
      return;
    }
    fetchReports({ limit: 30 }).then(reports => {
      const docs: LocalDocument[] = reports.map(r => {
        const schema = (selectedType?.schema?.fields?.length ? selectedType.schema : { fields: DEMO_FIELDS, tables: [] }) as LetterSchema;
        const data = (r.datos_corregidos?.data && Object.keys(r.datos_corregidos.data).length
          ? r.datos_corregidos.data
          : r.datos_extraidos?.data) || {};
        return {
          id: r.id,
          fileName: r.nombre_archivo || r.id,
          letraTipoId: r.letra_tipo_id,
          letraTipoNombre: r.letra_tipo_nombre || r.letra_tipo_id,
          uploadDate: new Date(r.fecha_carga).toLocaleString('es-MX'),
          user: r.usuario_carga || '',
          estado: r.estado as OcrStatus,
          fields: fieldsFromExtraction(schema, data as Record<string, unknown>),
          schema,
          detectedCount: Object.values(data).filter(v => v != null && v !== '').length,
          averageConfidence: r.confianza_promedio || 0,
          aprobador: r.aprobador || undefined,
          reporteId: r.id,
          alerts: r.alertas,
        };
      });
      setDocuments(docs);
      if (docs.length > 0) setActiveDocId(docs[0].id);
    }).catch(() => {});
  }, []);

  const handleFileSelect = (file: File) => {
    setIsUploading(true);
    setApiError('');

    if (!ocrEnabled) {
      // Demo mode
      setTimeout(() => {
        setIsUploading(false);
        const docId = `DOC-${Date.now()}`;
        const tipo = letterTypes.find(t => t.id === selectedTypeId) || letterTypes[0];
        const newDoc: LocalDocument = {
          id: docId,
          fileName: file.name,
          letraTipoId: selectedTypeId,
          letraTipoNombre: tipo.nombre,
          uploadDate: new Date().toLocaleString('es-MX'),
          user: currentUser.email.split('@')[0],
          estado: 'pendiente_ocr',
          fields: buildEmptyFields(activeSchema),
          schema: activeSchema,
          detectedCount: 0,
          averageConfidence: 0,
        };
        setDocuments(prev => [newDoc, ...prev]);
        setActiveDocId(docId);
        addAuditLog('OCR', 'FILE_UPLOADED', `Carga simulada: ${file.name}`);
      }, 800);
      return;
    }

    // Real API: generate schema if not configured
    if (!selectedType?.schema?.fields?.length && genSchema) {
      generateLetterTypeFromFile(file, selectedType?.nombre || selectedTypeId)
        .then(updated => {
          setSelectedType(updated);
          setLetterTypes(prev => prev.map(t => t.id === updated.id ? updated : t));
          startExtraction(file, updated.schema);
        })
        .catch(e => {
          setApiError(e.message);
          setIsUploading(false);
        });
    } else {
      startExtraction(file, activeSchema);
    }
  };

  const startExtraction = (file: File, schema: LetterSchema) => {
    const docId = `DOC-${Date.now()}`;
    const tipo = letterTypes.find(t => t.id === selectedTypeId) || letterTypes[0];

    const pendingDoc: LocalDocument = {
      id: docId,
      fileName: file.name,
      letraTipoId: selectedTypeId,
      letraTipoNombre: tipo.nombre,
      uploadDate: new Date().toLocaleString('es-MX'),
      user: currentUser.email.split('@')[0],
      estado: 'pendiente_ocr',
      fields: buildEmptyFields(schema),
      schema,
      detectedCount: 0,
      averageConfidence: 0,
    };
    setDocuments(prev => [pendingDoc, ...prev]);
    setActiveDocId(docId);
    setIsUploading(false);
    setIsProcessing(true);
    setProcessingMsg('Enviando archivo al servicio OCR...');

    streamAbortRef.current?.abort();
    streamAbortRef.current = extractReportStream(
      file,
      selectedTypeId,
      { usuario_carga: currentUser.email, area: '', turno: '' },
      {
        onProgress: msg => setProcessingMsg(msg),
        onDone: (result: ExtractionResult) => {
          setIsProcessing(false);
          setProcessingMsg('');
          setDocuments(prev => prev.map(d => {
            if (d.id !== docId) return d;
            return {
              ...d,
              estado: 'ocr_completado',
              fields: fieldsFromExtraction(schema, result.data),
              detectedCount: Object.values(result.data).filter(v => v != null && v !== '').length,
              averageConfidence: result.confianza_promedio || 0,
              reporteId: result.reporte_id,
              responsables: result.responsables_notificados,
              alerts: result.alerts,
            };
          }));
          addAuditLog('OCR', 'OCR_COMPLETED', `Extracción completada: ${file.name}. Confianza: ${result.confianza_promedio || 0}%`);
        },
        onError: err => {
          setIsProcessing(false);
          setProcessingMsg('');
          setApiError(err);
          setDocuments(prev => prev.map(d => d.id === docId ? { ...d, estado: 'pendiente_ocr' } : d));
        },
      },
    );
  };

  const handleDemoOcr = () => {
    if (!activeDoc || activeDoc.estado !== 'pendiente_ocr') return;
    setIsProcessing(true);
    setProcessingMsg('Procesando OCR simulado...');
    setTimeout(() => {
      setIsProcessing(false);
      setProcessingMsg('');
      const demoFields = buildDemoFields(activeDoc.letraTipoId, currentUser.email.split('@')[0]);
      setDocuments(prev => prev.map(d => {
        if (d.id !== activeDoc.id) return d;
        return { ...d, estado: 'ocr_completado', fields: demoFields, detectedCount: Object.keys(demoFields).length, averageConfidence: 87 };
      }));
      addAuditLog('OCR', 'OCR_ANALYSIS_COMPLETED', `OCR simulado para ${activeDoc.fileName}`);
    }, 1500);
  };

  const handleFieldChange = (fieldId: string, value: string) => {
    setDocuments(prev => prev.map(d => {
      if (d.id !== activeDocId) return d;
      return { ...d, fields: { ...d.fields, [fieldId]: { ...d.fields[fieldId], value } } };
    }));
  };

  const handleConfidenceChange = (fieldId: string, confidence: Confidence) => {
    setDocuments(prev => prev.map(d => {
      if (d.id !== activeDocId) return d;
      return { ...d, fields: { ...d.fields, [fieldId]: { ...d.fields[fieldId], confidence } } };
    }));
  };

  const handleSaveCorrections = async () => {
    if (!activeDoc?.reporteId) return;
    const correctedData: Record<string, string> = {};
    for (const [k, v] of Object.entries(activeDoc.fields) as [string, DynamicField][]) {
      correctedData[k] = v.value;
    }
    try {
      await updateReport(activeDoc.reporteId, { datos_corregidos: { data: correctedData, tables: {} } });
      addAuditLog('OCR_VALIDATION', 'CORRECTIONS_SAVED', `Correcciones guardadas para ${activeDoc.fileName}`);
    } catch (e: unknown) {
      setApiError((e as Error).message);
    }
  };

  const handleTransition = async (nuevoEstado: OcrStatus) => {
    if (!activeDoc) return;

    if (ocrEnabled && activeDoc.reporteId) {
      try {
        const result = await transitionReportState(activeDoc.reporteId, nuevoEstado, {
          aprobador: currentUser.email,
        });
        setDocuments(prev => prev.map(d =>
          d.id === activeDocId ? { ...d, estado: nuevoEstado, aprobador: nuevoEstado === 'aprobado' ? currentUser.email : d.aprobador, responsables: result.responsables_notificados } : d
        ));
        addAuditLog('OCR_VALIDATION', `STATE_${nuevoEstado.toUpperCase()}`, `Reporte ${activeDoc.fileName} → ${ESTADO_LABELS[nuevoEstado]}`);
      } catch (e: unknown) {
        setApiError((e as Error).message);
      }
    } else {
      setDocuments(prev => prev.map(d =>
        d.id === activeDocId ? { ...d, estado: nuevoEstado, aprobador: nuevoEstado === 'aprobado' ? currentUser.email : d.aprobador } : d
      ));
      addAuditLog('OCR_VALIDATION', `STATE_${nuevoEstado.toUpperCase()}`, `${activeDoc.fileName} → ${ESTADO_LABELS[nuevoEstado]}`);
    }
  };

  const allFields = activeSchema.fields || DEMO_FIELDS;
  const canTransitionTo = (estado: OcrStatus): boolean => {
    if (!activeDoc) return false;
    const transitions: Record<OcrStatus, OcrStatus[]> = {
      pendiente_ocr: ['ocr_completado'],
      ocr_completado: ['en_validacion', 'rechazado'],
      en_validacion: ['aprobado', 'rechazado', 'correccion_requerida'],
      correccion_requerida: ['en_validacion', 'rechazado'],
      aprobado: [],
      rechazado: [],
    };
    return transitions[activeDoc.estado]?.includes(estado) ?? false;
  };

  return (
    <div className="space-y-6">

      {/* API error banner */}
      {apiError && (
        <div className="bg-rose-50 border border-rose-300 rounded-lg p-3 flex items-center justify-between gap-3">
          <span className="text-xs text-rose-800 font-semibold">{apiError}</span>
          <button onClick={() => setApiError('')} className="text-rose-600 hover:text-rose-800"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Upload bar */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold font-mono text-blue-800 uppercase tracking-widest flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-blue-700 animate-pulse" />
              Consola Inteligente de Digitalización de Documentos
            </h3>
            <p className="text-xs text-slate-500 font-sans">
              Cargue reportes físicos para extraer datos con OCR + IA. Múltiples tipos de carta soportados.
            </p>
          </div>
          <div className={`rounded px-3.5 py-2 flex items-center gap-2 text-[11px] font-mono leading-tight max-w-md ${ocrEnabled ? 'bg-emerald-50 border border-emerald-200 text-emerald-900' : 'bg-blue-50 border border-blue-200 text-blue-900'}`}>
            <Sparkles className={`w-4 h-4 shrink-0 ${ocrEnabled ? 'text-emerald-600' : 'text-blue-700'}`} />
            <span>
              {ocrEnabled
                ? <><strong>Servicio OCR activo.</strong> Extracción real con Gemini + Document AI.</>
                : <><strong>Modo demo.</strong> OCR simulado. Configura VITE_OCR_SERVICE_URL para activar.</>
              }
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
          <div className="lg:col-span-4 flex flex-col justify-center space-y-3 p-4 bg-slate-905 rounded-lg border border-slate-800">
            <label className="text-[10px] font-extrabold tracking-wider uppercase font-mono text-slate-500">
              Paso 1: Tipo de Carta / Formato
            </label>
            <select
              value={selectedTypeId}
              onChange={e => setSelectedTypeId(e.target.value)}
              className="w-full bg-white border border-slate-700 rounded p-2 text-xs font-sans font-bold focus:outline-none focus:border-blue-600" style={{ color: '#1e293b' }}
            >
              {letterTypes.map(t => (
                <option key={t.id} value={t.id}>{t.nombre}</option>
              ))}
            </select>
            {ocrEnabled && (
              <label className="flex items-center gap-2 cursor-pointer text-[10px] text-slate-500">
                <input type="checkbox" checked={genSchema} onChange={e => setGenSchema(e.target.checked)}
                  className="w-3.5 h-3.5 accent-blue-600" />
                Auto-detectar campos si el tipo no tiene esquema
              </label>
            )}
          </div>

          <div className="lg:col-span-8 flex gap-3">
            {/* File picker input */}
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp,.tif,.tiff" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />
            {/* Camera capture input — opens native camera on mobile */}
            <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => { if (e.target.files?.[0]) handleFileSelect(e.target.files[0]); }} />

            {/* Upload drop zone */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isProcessing}
              className="flex-1 min-h-[110px] border-2 border-dashed border-slate-700 hover:border-blue-600 bg-slate-955 hover:bg-slate-850 rounded-lg p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none group outline-none"
            >
              {isUploading ? (
                <div className="space-y-2">
                  <RefreshCw className="w-7 h-7 text-blue-600 animate-spin mx-auto" />
                  <span className="text-xs font-mono font-bold text-blue-700 animate-pulse block">Subiendo archivo...</span>
                </div>
              ) : isProcessing ? (
                <div className="space-y-2">
                  <ScanLine className="w-7 h-7 text-indigo-600 animate-pulse mx-auto" />
                  <span className="text-xs font-mono font-bold text-indigo-700 animate-pulse block">{processingMsg || 'Extrayendo datos...'}</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-7 h-7 text-slate-400 group-hover:text-blue-600 transition-colors mx-auto" />
                  <span className="text-xs font-bold font-sans text-slate-900 group-hover:text-blue-700 transition-colors block">
                    Arrastra o selecciona archivo
                  </span>
                  <span className="text-[10px] text-slate-450 font-mono block">PDF, JPG, PNG, TIFF (máx 15 MB)</span>
                </div>
              )}
            </button>

            {/* Camera button */}
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={isUploading || isProcessing}
              title="Tomar foto con cámara"
              className="min-h-[110px] w-[90px] shrink-0 border-2 border-dashed border-slate-700 hover:border-cyan-600 bg-slate-955 hover:bg-slate-850 rounded-lg p-3 flex flex-col items-center justify-center text-center transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none group outline-none"
            >
              <Camera className="w-7 h-7 text-slate-400 group-hover:text-cyan-600 transition-colors mx-auto" />
              <span className="text-[10px] font-mono text-slate-450 group-hover:text-cyan-700 transition-colors mt-1.5 block leading-tight">
                Cámara
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Three-panel layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* Left: preview + metadata */}
        <div className="lg:col-span-3 bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4 min-h-[500px] flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-800 pb-2 mb-3">
              <h4 className="text-[10px] font-extrabold font-mono text-slate-450 uppercase tracking-widest">
                Vista Previa del Documento
              </h4>
            </div>

            <div className="relative border border-slate-700 rounded bg-slate-905 p-3 font-mono text-[9px] text-slate-500 min-h-[300px] overflow-hidden flex flex-col justify-between">
              {(isProcessing || isUploading) && (
                <div className="absolute inset-x-0 h-1 bg-cyan-600 opacity-90 animate-bounce shadow-[0_0_15px_#0e7490] z-20" />
              )}
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] rotate-45 pointer-events-none">
                <ScanLine className="w-48 h-48 text-slate-900" />
              </div>

              <div className="border-b border-slate-700 pb-2 space-y-1 z-10">
                <div className="flex justify-between items-center font-bold text-slate-700">
                  <span>PLASYECT IND.</span>
                  <span>FOLIO: {activeDoc?.id || '—'}</span>
                </div>
              </div>

              <div className="py-4 space-y-1 flex-1 z-10 text-slate-650">
                {!activeDoc ? (
                  <div className="py-12 text-center">
                    <Upload className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-slate-500 font-sans text-[10px]">Carga un archivo para comenzar.</p>
                  </div>
                ) : activeDoc.estado === 'pendiente_ocr' ? (
                  <div className="py-8 text-center space-y-2">
                    <FileSearch2 className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="font-sans font-bold text-slate-750">PENDIENTE DE OCR</p>
                    <p className="font-sans text-[8px] text-slate-500">Archivo cargado. Inicia el procesamiento OCR.</p>
                  </div>
                ) : (
                  <div className="space-y-1 text-[8px] leading-relaxed">
                    {(Object.entries(activeDoc.fields) as [string, DynamicField][]).slice(0, 12).map(([id, f]) => {
                      const def = allFields.find(d => d.id === id);
                      return f.value ? (
                        <div key={id} className="flex gap-1">
                          <span className="text-slate-400 shrink-0">{def?.label || id}:</span>
                          <span className="text-slate-700 truncate">{f.value}</span>
                        </div>
                      ) : null;
                    })}
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-slate-700 pt-2 flex justify-between text-[8px] text-slate-500 font-mono z-10">
                <span>ESTADO: {activeDoc ? ESTADO_LABELS[activeDoc.estado] : '—'}</span>
                <span className="font-bold">OCR v1.0</span>
              </div>
            </div>
          </div>

          {/* Metadata + trigger */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            {activeDoc && (
              <div className="bg-slate-905 border border-slate-800 rounded p-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between"><span className="text-slate-450 font-mono">Archivo:</span><span className="font-bold text-slate-200 truncate max-w-[130px] font-mono" title={activeDoc.fileName}>{activeDoc.fileName}</span></div>
                <div className="flex justify-between"><span className="text-slate-450 font-mono">Tipo:</span><span className="font-semibold text-slate-750 text-[10px] text-right truncate max-w-[130px]">{activeDoc.letraTipoNombre}</span></div>
                <div className="flex justify-between"><span className="text-slate-450 font-mono">Fecha:</span><span className="font-mono text-slate-200">{activeDoc.uploadDate}</span></div>
                <div className="flex justify-between"><span className="text-slate-450 font-mono">Usuario:</span><span className="font-semibold font-mono">{activeDoc.user}</span></div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-450 font-mono">Estado:</span>
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black ${ESTADO_COLORS[activeDoc.estado]}`}>{ESTADO_LABELS[activeDoc.estado]}</span>
                </div>
                {(activeDoc.averageConfidence ?? 0) > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-450 font-mono">Confianza:</span>
                    <span className={`font-mono font-bold text-xs ${activeDoc.averageConfidence >= 90 ? 'text-emerald-700' : activeDoc.averageConfidence >= 75 ? 'text-amber-700' : 'text-rose-700'}`}>
                      {activeDoc.averageConfidence}%
                    </span>
                  </div>
                )}
              </div>
            )}

            {activeDoc?.estado === 'pendiente_ocr' && (
              <button
                onClick={() => { if (ocrEnabled && fileInputRef.current) fileInputRef.current.click(); else handleDemoOcr(); }}
                disabled={isProcessing}
                className="w-full py-2 bg-indigo-650 hover:bg-indigo-750 text-white font-sans font-black tracking-wide text-xs uppercase rounded flex items-center justify-center gap-1.5 transition-all shadow"
              >
                {isProcessing ? <><RefreshCw className="w-4 h-4 animate-spin" /> Procesando...</> : <><Play className="w-4 h-4" /> Procesar OCR</>}
              </button>
            )}

            {activeDoc?.alerts && activeDoc.alerts.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded p-2.5 space-y-1">
                <span className="text-[9px] font-extrabold font-mono text-amber-700 flex items-center gap-1"><Bell className="w-3 h-3" /> ALERTAS OCR</span>
                {activeDoc.alerts.map((a, i) => <p key={i} className="text-[9px] text-amber-800">{a}</p>)}
              </div>
            )}

            {activeDoc?.responsables && activeDoc.responsables.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded p-2.5 space-y-1">
                <span className="text-[9px] font-extrabold font-mono text-blue-700 flex items-center gap-1"><Bell className="w-3 h-3" /> NOTIFICADOS</span>
                {activeDoc.responsables.map(r => (
                  <p key={r.id} className="text-[9px] text-blue-800">{r.nombre}{r.email ? ` (${r.email})` : ''}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Center: extracted fields */}
        <div className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
          <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
            <h4 className="text-[10px] font-extrabold font-mono text-slate-450 uppercase tracking-widest">
              Campos Detectados por IA
            </h4>
            {activeDoc && activeDoc.estado !== 'pendiente_ocr' && (
              <span className="text-[10px] bg-slate-850 px-2 py-0.5 rounded font-mono font-black text-slate-300">
                {activeDoc.detectedCount} campos · {activeDoc.averageConfidence || 0}% confianza
              </span>
            )}
          </div>

          {!activeDoc || activeDoc.estado === 'pendiente_ocr' ? (
            <div className="py-24 text-center space-y-3">
              <ScanLine className="w-12 h-12 text-slate-400 mx-auto animate-pulse" />
              <p className="text-sm font-sans font-bold text-slate-700">Campos en espera de extracción</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Carga un archivo y presiona <strong className="text-indigo-600">Procesar OCR</strong> para extraer los datos.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[11px] text-slate-500 italic">
                Los valores editados respecto al original se marcan como <span className="text-blue-700 font-bold font-mono">Modificado</span>.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {allFields.map(fieldDef => {
                  const field = activeDoc.fields[fieldDef.id] ?? { value: '', confidence: 'Baja' as Confidence, originalValue: '' };
                  return (
                    <DynamicFieldInput
                      key={fieldDef.id}
                      fieldDef={fieldDef}
                      field={field}
                      onChange={val => handleFieldChange(fieldDef.id, val)}
                      onConfidenceChange={conf => handleConfidenceChange(fieldDef.id, conf)}
                      disabled={activeDoc.estado === 'aprobado' || activeDoc.estado === 'rechazado'}
                    />
                  );
                })}
              </div>

              {activeDoc.estado !== 'aprobado' && activeDoc.estado !== 'rechazado' && (
                <button
                  onClick={handleSaveCorrections}
                  className="mt-2 px-4 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded flex items-center gap-1.5 transition"
                >
                  <Save className="w-3.5 h-3.5" /> Guardar correcciones
                </button>
              )}
            </div>
          )}
        </div>

        {/* Right: validation + responsables */}
        <div className="lg:col-span-3 bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">

          {/* Tabs */}
          <div className="flex border-b border-slate-800">
            <button
              onClick={() => setRightTab('validacion')}
              className={`flex-1 pb-2 text-[10px] font-extrabold font-mono uppercase tracking-wider flex items-center justify-center gap-1 transition ${rightTab === 'validacion' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-400 hover:text-slate-700'}`}
            >
              <Check className="w-3.5 h-3.5" /> Validación
            </button>
            <button
              onClick={() => setRightTab('responsables')}
              className={`flex-1 pb-2 text-[10px] font-extrabold font-mono uppercase tracking-wider flex items-center justify-center gap-1 transition ${rightTab === 'responsables' ? 'border-b-2 border-blue-600 text-blue-700' : 'text-slate-400 hover:text-slate-700'}`}
            >
              <Users className="w-3.5 h-3.5" /> Responsables
            </button>
          </div>

          {rightTab === 'responsables' ? (
            <ResponsablesPanel
              letraTipoId={selectedTypeId}
              responsables={responsables}
              onRefresh={loadResponsables}
            />
          ) : (
            <>
              {!activeDoc || activeDoc.estado === 'pendiente_ocr' ? (
                <div className="py-20 text-center space-y-2">
                  <Lock className="w-8 h-8 text-slate-400 mx-auto" />
                  <p className="text-xs font-sans font-bold text-slate-700">Controles bloqueados</p>
                  <p className="text-[10px] text-slate-500">Procese el OCR para habilitar la validación.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Correction count */}
                  <div className="bg-slate-905 border border-slate-800 rounded p-2.5 text-xs space-y-1.5">
                    <div className="flex justify-between">
                      <span className="text-slate-450 font-mono text-[10px]">Campos detectados:</span>
                      <span className="font-bold font-mono">{activeDoc.detectedCount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-450 font-mono text-[10px]">Campos corregidos:</span>
                      <span className={`font-bold font-mono ${countCorrected(activeDoc.fields) > 0 ? 'text-blue-700' : 'text-slate-400'}`}>
                        {countCorrected(activeDoc.fields)}
                      </span>
                    </div>
                    {activeDoc.aprobador && (
                      <div className="flex justify-between items-center pt-1 border-t border-slate-800">
                        <span className="text-slate-450 font-mono text-[10px]">Aprobador:</span>
                        <span className="font-bold font-mono text-emerald-700 flex items-center gap-1">
                          <UserCheck className="w-3 h-3" /> {activeDoc.aprobador}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="space-y-2">
                    {canTransitionTo('en_validacion') && (
                      <button onClick={() => handleTransition('en_validacion')}
                        className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition shadow">
                        <FileSearch className="w-4 h-4" /> Enviar a validación
                      </button>
                    )}
                    {canTransitionTo('aprobado') && (
                      <button onClick={() => handleTransition('aprobado')}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition shadow">
                        <CheckCircle2 className="w-4 h-4" /> Aprobar documento
                      </button>
                    )}
                    {canTransitionTo('correccion_requerida') && (
                      <button onClick={() => handleTransition('correccion_requerida')}
                        className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition">
                        <AlertTriangle className="w-4 h-4" /> Solicitar corrección
                      </button>
                    )}
                    {canTransitionTo('rechazado') && (
                      <button onClick={() => handleTransition('rechazado')}
                        className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition">
                        <X className="w-4 h-4" /> Rechazar documento
                      </button>
                    )}

                    {activeDoc.estado === 'aprobado' && (
                      <div className="bg-emerald-50 border border-emerald-300 rounded p-3 text-center text-xs text-emerald-800 font-semibold flex items-center justify-center gap-2">
                        <CheckCircle2 className="w-4 h-4" /> Documento aprobado
                      </div>
                    )}
                    {activeDoc.estado === 'rechazado' && (
                      <div className="bg-rose-50 border border-rose-300 rounded p-3 text-center text-xs text-rose-800 font-semibold flex items-center justify-center gap-2">
                        <X className="w-4 h-4" /> Documento rechazado
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* History table */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h4 className="text-sm font-extrabold font-mono text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            Historial de Documentos OCR
          </h4>
          <span className="text-[10px] font-mono bg-slate-905 border border-slate-800 text-slate-500 px-2.5 py-1 rounded font-bold">
            {documents.length} documentos
          </span>
        </div>

        {documents.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs">
            No hay documentos aún. Carga un archivo para comenzar.
          </div>
        ) : (
          <div className="overflow-x-auto w-full border border-slate-800 rounded-lg">
            <table className="w-full text-left border-collapse text-[11px] font-sans">
              <thead>
                <tr className="bg-slate-905 border-b border-slate-800 text-slate-500 font-mono text-[9px] uppercase tracking-wider font-bold">
                  <th className="py-2.5 px-3">Fecha Carga</th>
                  <th className="py-2.5 px-3">Tipo de Carta</th>
                  <th className="py-2.5 px-3">Archivo</th>
                  <th className="py-2.5 px-3">Usuario</th>
                  <th className="py-2.5 px-3 text-center">Campos</th>
                  <th className="py-2.5 px-3 text-center">Corregidos</th>
                  <th className="py-2.5 px-3 text-center">Confianza</th>
                  <th className="py-2.5 px-3 text-center">Estado</th>
                  <th className="py-2.5 px-3">Aprobador</th>
                  <th className="py-2.5 px-2 text-center">Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 whitespace-nowrap">
                {documents.map(doc => {
                  const isSelected = activeDocId === doc.id;
                  const corrected = countCorrected(doc.fields);
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => setActiveDocId(doc.id)}
                      className={`cursor-pointer transition-colors ${isSelected ? 'bg-blue-50/40 border-l-4 border-l-blue-600 font-medium' : 'hover:bg-slate-905 bg-white'}`}
                    >
                      <td className="py-2.5 px-3 font-mono text-slate-450">{doc.uploadDate}</td>
                      <td className="py-2.5 px-3 text-slate-200 font-semibold">{doc.letraTipoNombre}</td>
                      <td className="py-2.5 px-3 font-mono text-slate-750 flex items-center gap-1.5">
                        <FileText className="w-3.5 h-3.5 text-slate-500" />{doc.fileName}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-750">{doc.user}</td>
                      <td className="py-2.5 px-3 text-center font-mono text-slate-750">
                        {doc.estado === 'pendiente_ocr' ? '—' : doc.detectedCount}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {doc.estado === 'pendiente_ocr' ? '—' : corrected > 0
                          ? <span className="text-blue-700 bg-blue-50 px-1.5 rounded font-bold border border-blue-200">{corrected} corr.</span>
                          : <span className="text-slate-400">0</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono">
                        {doc.estado === 'pendiente_ocr' ? '—' : (
                          <span className={`font-semibold ${doc.averageConfidence >= 90 ? 'text-emerald-700' : doc.averageConfidence >= 75 ? 'text-amber-800' : 'text-rose-800'}`}>
                            {doc.averageConfidence}%
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide font-black ${ESTADO_COLORS[doc.estado]}`}>
                          {ESTADO_LABELS[doc.estado]}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-650">
                        {doc.aprobador
                          ? <span className="flex items-center gap-1 text-slate-200 font-bold"><UserCheck className="w-3.5 h-3.5 text-emerald-600" />{doc.aprobador}</span>
                          : <span className="text-slate-400 italic">No asignado</span>}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <button onClick={e => { e.stopPropagation(); setActiveDocId(doc.id); }}
                          className="p-1 text-indigo-600 hover:bg-slate-200 rounded transition">
                          <FileSearch className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

    </div>
  );
};
