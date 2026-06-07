import React, { useState } from 'react';
import { useDashboard } from '../../context/DashboardContext';
import { 
  ScanLine, 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  Play, 
  FileText, 
  Barcode, 
  Check, 
  X, 
  RefreshCw, 
  FileSpreadsheet, 
  UserCheck, 
  Save, 
  FileSearch,
  Plus,
  Trash2,
  FileSearch2,
  Lock,
  Sparkles
} from 'lucide-react';

// Formats representation type
interface OCRField {
  value: string;
  confidence: 'Alta' | 'Media' | 'Baja';
  originalValue: string;
}

interface OCRDocument {
  id: string;
  fileName: string;
  formatType: string;
  uploadDate: string;
  user: string;
  ocrStatus: 'Pendiente OCR' | 'OCR completado' | 'En validación' | 'Aprobado' | 'Rechazado' | 'Corrección requerida';
  fields: {
    fecha: OCRField;
    turno: OCRField;
    area: OCRField;
    inspector: OCRField;
    lider: OCRField;
    maquinaBanda: OCRField;
    cliente: OCRField;
    oc: OCRField;
    lote: OCRField;
    modelo: OCRField;
    color: OCRField;
    totalPares: OCRField;
    primeras: OCRField;
    segundas: OCRField;
    defectos: OCRField;
    observaciones: OCRField;
  };
  checklist: {
    clienteCorrecto: boolean;
    ocCorrecta: boolean;
    loteCorrecto: boolean;
    modeloCorrecto: boolean;
    colorCorrecto: boolean;
    totalesCorrectos: boolean;
    defectosRevisados: boolean;
    responsableConfirmado: boolean;
  };
  detectedCount: number;
  averageConfidence: number; // Percentage e.g. 92
  aprobador?: string;
  rawTextSimulated?: string;
}

export const OCRValidation: React.FC = () => {
  const { addAuditLog, currentUser, currentTenant } = useDashboard();

  // Selected format type state for the top bar dropdown
  const [selectedFormatType, setSelectedFormatType] = useState<string>(
    'Reporte de inspección de calidad en inyección'
  );

  // Simulation loading states
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isProcessingOCR, setIsProcessingOCR] = useState<boolean>(false);
  
  // Active document selected for inspection panels
  const [activeDocId, setActiveDocId] = useState<string>('DOC-004'); // default selection is the pending one

  // Initial list of document history logs in local state to allow mutations
  const [documents, setDocuments] = useState<OCRDocument[]>([
    {
      id: 'DOC-001',
      fileName: 'IN_CAL_20260520.pdf',
      formatType: 'Reporte de inspección de calidad en inyección',
      uploadDate: '2026-05-20 09:15',
      user: 'Ing. Hugo Martínez',
      ocrStatus: 'Aprobado',
      fields: {
        fecha: { value: '2026-05-20', confidence: 'Alta', originalValue: '2026-05-20' },
        turno: { value: 'Matutino', confidence: 'Alta', originalValue: 'Matutino' },
        area: { value: 'Inyección EVA', confidence: 'Alta', originalValue: 'Inyección EVA' },
        inspector: { value: 'Ing. Hugo Martínez', confidence: 'Alta', originalValue: 'Ing. Hugo Martínez' },
        lider: { value: 'Raúl Sánchez', confidence: 'Alta', originalValue: 'Raúl Sánchez' },
        maquinaBanda: { value: 'Inyectora EVA #3', confidence: 'Alta', originalValue: 'Inyectora EVA #3' },
        cliente: { value: 'Calzado Andrea', confidence: 'Alta', originalValue: 'Calzado Andrea' },
        oc: { value: 'OC-2026-4418', confidence: 'Alta', originalValue: 'OC-2026-4418' },
        lote: { value: 'LOTE-771-EVA', confidence: 'Alta', originalValue: 'LOTE-771-EVA' },
        modelo: { value: 'Zapatilla EVA Spring', confidence: 'Alta', originalValue: 'Zapatilla EVA Spring' },
        color: { value: 'Rosa Humo', confidence: 'Alta', originalValue: 'Rosa Humo' },
        totalPares: { value: '1250', confidence: 'Alta', originalValue: '1250' },
        primeras: { value: '1220', confidence: 'Alta', originalValue: '1220' },
        segundas: { value: '30', confidence: 'Alta', originalValue: '30' },
        defectos: { value: 'Marcas de desmolde en 12 pares', confidence: 'Alta', originalValue: 'Marcas de desmolde en 12 pares' },
        observaciones: { value: 'Parámetros de presión normales', confidence: 'Alta', originalValue: 'Parámetros de presión normales' },
      },
      checklist: {
        clienteCorrecto: true,
        ocCorrecta: true,
        loteCorrecto: true,
        modeloCorrecto: true,
        colorCorrecto: true,
        totalesCorrectos: true,
        defectosRevisados: true,
        responsableConfirmado: true,
      },
      detectedCount: 16,
      averageConfidence: 98,
      aprobador: 'lf.bedia@gmail.com',
      rawTextSimulated: 'PLASYECT S.A. DE C.V.\nREP INSPECCIÓN CALIDAD - INYECCIÓN\nFECHA: 2026-05-20 | TURNO: Matutino\nINSPECTOR: Ing. Hugo Martínez | LIDER: Raúl Sánchez\nMÁQUINA: Inyectora EVA #3\nCLIENTE: Calzado Andrea | OC: OC-2026-4418\nLOTE: LOTE-771-EVA | MODELO: Zapatilla EVA Spring\nCOLOR: Rosa Humo\nTOTAL PARES: 1250 | PRIMERAS: 1220 | SEGUNDAS: 30\nDEFECTO: Marcas de desmolde en 12 pares\nOBSERVACIONES: Parámetros de presión normales'
    },
    {
      id: 'DOC-002',
      fileName: 'REP_BAND_B2_QUALITY_0522.png',
      formatType: 'Reporte de inspección de calidad en banda',
      uploadDate: '2026-05-22 14:40',
      user: 'Lic. Sandra Peralta',
      ocrStatus: 'Aprobado',
      fields: {
        fecha: { value: '2026-05-22', confidence: 'Alta', originalValue: '2026-05-22' },
        turno: { value: 'Vespertino', confidence: 'Alta', originalValue: 'Vespertino' },
        area: { value: 'Banda de Acabado', confidence: 'Alta', originalValue: 'Banda de Acabado' },
        inspector: { value: 'Lic. Sandra Peralta', confidence: 'Alta', originalValue: 'Lic. Sandra Peralta' },
        lider: { value: 'Diana Cruz', confidence: 'Alta', originalValue: 'Diana Cruz' },
        maquinaBanda: { value: 'Banda de Concurrencia #2', confidence: 'Media', originalValue: 'Banda Concurrencia #2' },
        cliente: { value: 'Corporativo Flexi', confidence: 'Alta', originalValue: 'Corporativo Flexi' },
        oc: { value: 'OC-9902-FLE', confidence: 'Alta', originalValue: 'OC-9902-FLE' },
        lote: { value: 'LOTE-882-BND', confidence: 'Alta', originalValue: 'LOTE-882-BND' },
        modelo: { value: 'Classic Walker EVA', confidence: 'Alta', originalValue: 'Classic Walker EVA' },
        color: { value: 'Gris Oxford', confidence: 'Media', originalValue: 'Gris Oxf' },
        totalPares: { value: '2400', confidence: 'Alta', originalValue: '2400' },
        primeras: { value: '2350', confidence: 'Alta', originalValue: '2350' },
        segundas: { value: '50', confidence: 'Baja', originalValue: '5.0' }, // corrected during analysis
        defectos: { value: 'Rebaba en junta talón en 32 pares', confidence: 'Media', originalValue: 'Rebaba junta 32 p' },
        observaciones: { value: 'Velocidad de banda ajustada a 12m/min', confidence: 'Alta', originalValue: 'Velocidad de banda ajustada a 12m/min' },
      },
      checklist: {
        clienteCorrecto: true,
        ocCorrecta: true,
        loteCorrecto: true,
        modeloCorrecto: true,
        colorCorrecto: true,
        totalesCorrectos: true,
        defectosRevisados: true,
        responsableConfirmado: true,
      },
      detectedCount: 16,
      averageConfidence: 84,
      aprobador: 'Líder Administración',
      rawTextSimulated: 'CONTROL DE CALIDAD BANDA\nBanda de Concurrencia #2\nFECHA: 2026-05-22 | TURNO: Vespertino\nINSPECTOR: Lic. Sandra Peralta\nLIDER: Diana Cruz\nCLIENTE: Corporativo Flexi | OC: OC-9902-FLE\nLOTE: LOTE-882-BND | MODELO: Classic Walker EVA\nCOLOR: Gris Oxf\nTOTAL: 2400 | TEMP: 180C\nPRIMERAS: 2350 | SEGUNDAS: 5.0\nDEFECTO: Rebaba junta 32 p\nOBSERVACIONES: Velocidad de banda ajustada a 12m/min'
    },
    {
      id: 'DOC-003',
      fileName: 'LIB_PROD_B4_2405.pdf',
      formatType: 'Liberación y flujo de producción',
      uploadDate: '2026-05-24 18:02',
      user: 'Lic. Sandra Peralta',
      ocrStatus: 'Corrección requerida',
      fields: {
        fecha: { value: '2026-05-24', confidence: 'Alta', originalValue: '2026-05-24' },
        turno: { value: 'Nocturno', confidence: 'Alta', originalValue: 'Nocturno' },
        area: { value: 'Aduana de Calidad', confidence: 'Alta', originalValue: 'Aduana de Calidad' },
        inspector: { value: 'Lic. Sandra Peralta', confidence: 'Alta', originalValue: 'Lic. Sandra Peralta' },
        lider: { value: 'Líder Administración', confidence: 'Alta', originalValue: 'Líder Administración' },
        maquinaBanda: { value: 'Estación de Muestreo A', confidence: 'Alta', originalValue: 'Estación de Muestreo A' },
        cliente: { value: 'Suelas del Bajío', confidence: 'Alta', originalValue: 'Suelas del Bajío' },
        oc: { value: 'OC-SUEL-4820', confidence: 'Baja', originalValue: '[ILEGIBLE]' },
        lote: { value: 'LOTE-303-SLS', confidence: 'Alta', originalValue: 'LOTE-303-SLS' },
        modelo: { value: 'Suela Trekking EVA', confidence: 'Alta', originalValue: 'Suela Trekking EVA' },
        color: { value: 'Blanco Óptico', confidence: 'Alta', originalValue: 'Blanco Óptico' },
        totalPares: { value: '3500', confidence: 'Alta', originalValue: '3500' },
        primeras: { value: '3480', confidence: 'Alta', originalValue: '3480' },
        segundas: { value: '20', confidence: 'Media', originalValue: '20' },
        defectos: { value: 'Ninguno detectado', confidence: 'Alta', originalValue: 'Ninguno detectado' },
        observaciones: { value: 'Liberado completo rumbo a embarque', confidence: 'Alta', originalValue: 'Liberado completo rumbo a embarque' },
      },
      checklist: {
        clienteCorrecto: true,
        ocCorrecta: false,
        loteCorrecto: true,
        modeloCorrecto: true,
        colorCorrecto: true,
        totalesCorrectos: true,
        defectosRevisados: true,
        responsableConfirmado: false,
      },
      detectedCount: 15,
      averageConfidence: 76,
      rawTextSimulated: 'LIBERACIÓN DE COMPUESTO PLASYECT\nÁrea: Aduana de Calidad\nInspector: Lic. Sandra Peralta | Fecha: 24/05/2026\nTurno: Nocturno\nCliente: Suelas del Bajío\nOC: [MANCHA DE GRASA - ILEGIBLE]\nLote: LOTE-303-SLS\nModelo: Suela Trekking EVA\nColor: Blanco Óptico\nQty: 3500 (3480 Prim / 20 Seg)\nObservaciones: Liberado completo rumbo a embarque'
    },
    {
      id: 'DOC-004',
      fileName: 'BIT_MANUAL_M3_2505.jpg',
      formatType: 'Bitácora manual de producción',
      uploadDate: '2026-05-25 11:30',
      user: 'Ing. Hugo Martínez',
      ocrStatus: 'En validación',
      fields: {
        fecha: { value: '2026-05-25', confidence: 'Alta', originalValue: '2026-05-25' },
        turno: { value: 'Matutino', confidence: 'Alta', originalValue: 'Matutino' },
        area: { value: 'Inyección EVA', confidence: 'Alta', originalValue: 'Inyección EVA' },
        inspector: { value: 'Ing. Hugo Martínez', confidence: 'Alta', originalValue: 'Ing. Hugo Martínez' },
        lider: { value: 'Raúl Sánchez', confidence: 'Media', originalValue: 'R. Sanchez' },
        maquinaBanda: { value: 'Inyectora EVA #1', confidence: 'Alta', originalValue: 'Inyectora EVA #1' },
        cliente: { value: 'Calzado Andrea', confidence: 'Baja', originalValue: 'Cala. andr' },
        oc: { value: 'OC-2026-4418', confidence: 'Media', originalValue: 'OC-2026-441B' },
        lote: { value: 'LOTE-772-EVA', confidence: 'Alta', originalValue: 'LOTE-772-EVA' },
        modelo: { value: 'Muck Boots Comfort', confidence: 'Baja', originalValue: 'Muck Comfort' },
        color: { value: 'Verde Militar', confidence: 'Alta', originalValue: 'Verde Militar' },
        totalPares: { value: '900', confidence: 'Media', originalValue: '90o' },
        primeras: { value: '870', confidence: 'Baja', originalValue: '87' },
        segundas: { value: '30', confidence: 'Baja', originalValue: '3' },
        defectos: { value: 'Contaminación por viruta metálica', confidence: 'Media', originalValue: 'virtual metalica' },
        observaciones: { value: 'Calibración de molde realizada a mediodía', confidence: 'Alta', originalValue: 'Calibracion molde mediodia' },
      },
      checklist: {
        clienteCorrecto: false,
        ocCorrecta: false,
        loteCorrecto: false,
        modeloCorrecto: false,
        colorCorrecto: false,
        totalesCorrectos: false,
        defectosRevisados: false,
        responsableConfirmado: false,
      },
      detectedCount: 16,
      averageConfidence: 62,
      rawTextSimulated: 'BITÁCORA DE CONTROL FISICO DE LOTE\nInyectora EVA #1 | Turno M\nInspector: Ing. Hugo Martínez | 25-05-2026\nCliente: Cala. andr | OC: OC-2026-441B\nLote: LOTE-772-EVA | Mod: Muck Comfort - Verde Militar\nCant: 90o p (Prim: 87 / Seg: 3)\nDefecto registrado: virtual metalica\nObs: Calibracion molde mediodia'
    }
  ]);

  // Find currently selected document
  const activeDoc = documents.find(d => d.id === activeDocId) || documents[0];

  // List of format types for selection dropdown
  const formatTypesList = [
    'Reporte de inspección de calidad en inyección',
    'Reporte de inspección de calidad en banda',
    'Liberación y flujo de producción',
    'Producto primeras',
    'Producto segundas',
    'Bitácora manual de producción'
  ];

  // Helper dictionary of realistic mock mockups to populate on brand-new loads
  const mockTemplates: Record<string, Partial<OCRDocument['fields']>> = {
    'Reporte de inspección de calidad en inyección': {
      fecha: { value: '2026-05-25', confidence: 'Alta', originalValue: '2026-05-25' },
      turno: { value: 'Matutino', confidence: 'Alta', originalValue: 'Matutino' },
      area: { value: 'Inyección EVA', confidence: 'Alta', originalValue: 'Inyección EVA' },
      inspector: { value: currentUser.email.split('@')[0], confidence: 'Alta', originalValue: currentUser.email.split('@')[0] },
      lider: { value: 'Raúl Sánchez', confidence: 'Alta', originalValue: 'Raúl Sánchez' },
      maquinaBanda: { value: 'Inyectora EVA #3', confidence: 'Alta', originalValue: 'Inyectora EVA #3' },
      cliente: { value: 'Calzado Andrea', confidence: 'Alta', originalValue: 'Calzado Andrea' },
      oc: { value: 'OC-2026-4418', confidence: 'Alta', originalValue: 'OC-2026-4418' },
      lote: { value: 'LOTE-771-EVA', confidence: 'Alta', originalValue: 'LOTE-771-EVA' },
      modelo: { value: 'Zapatilla EVA Spring', confidence: 'Alta', originalValue: 'Zapatilla EVA Spring' },
      color: { value: 'Rosa Humo', confidence: 'Alta', originalValue: 'Rosa Humo' },
      totalPares: { value: '1250', confidence: 'Alta', originalValue: '1250' },
      primeras: { value: '1220', confidence: 'Alta', originalValue: '1220' },
      segundas: { value: '30', confidence: 'Alta', originalValue: '30' },
      defectos: { value: 'Marcas de desmolde en 12 pares', confidence: 'Media', originalValue: 'Marcas de desmolde en 12 pares' },
      observaciones: { value: 'Estabilidad térmica normal.', confidence: 'Alta', originalValue: 'Estabilidad térmica normal' }
    },
    'Reporte de inspección de calidad en banda': {
      fecha: { value: '2026-05-25', confidence: 'Alta', originalValue: '2026-05-25' },
      turno: { value: 'Vespertino', confidence: 'Alta', originalValue: 'Vespertino' },
      area: { value: 'Banda de Acabado', confidence: 'Alta', originalValue: 'Banda de Acabado' },
      inspector: { value: currentUser.email.split('@')[0], confidence: 'Alta', originalValue: currentUser.email.split('@')[0] },
      lider: { value: 'Diana Cruz', confidence: 'Alta', originalValue: 'Diana Cruz' },
      maquinaBanda: { value: 'Banda de Concurrencia #2', confidence: 'Media', originalValue: 'Banda de Concurrencia #2' },
      cliente: { value: 'Corporativo Flexi', confidence: 'Alta', originalValue: 'Corporativo Flexi' },
      oc: { value: 'OC-9902-FLE', confidence: 'Alta', originalValue: 'OC-9902-FLE' },
      lote: { value: 'LOTE-882-BND', confidence: 'Alta', originalValue: 'LOTE-882-BND' },
      modelo: { value: 'Classic Walker EVA', confidence: 'Alta', originalValue: 'Classic Walker EVA' },
      color: { value: 'Gris Oxford', confidence: 'Media', originalValue: 'Gris Oxf' },
      totalPares: { value: '2400', confidence: 'Alta', originalValue: '2400' },
      primeras: { value: '2350', confidence: 'Alta', originalValue: '2350' },
      segundas: { value: '50', confidence: 'Baja', originalValue: '5.0' },
      defectos: { value: 'Rebaba en junta de talón', confidence: 'Media', originalValue: 'Rebaba junta' },
      observaciones: { value: 'Ajuste de velocidad operado oportunamente.', confidence: 'Alta', originalValue: 'Ajuste velocidad' }
    },
    'Liberación y flujo de producción': {
      fecha: { value: '2026-05-25', confidence: 'Alta', originalValue: '2026-05-25' },
      turno: { value: 'Nocturno', confidence: 'Alta', originalValue: 'Nocturno' },
      area: { value: 'Aduana de Calidad', confidence: 'Alta', originalValue: 'Aduana de Calidad' },
      inspector: { value: currentUser.email.split('@')[0], confidence: 'Alta', originalValue: currentUser.email.split('@')[0] },
      lider: { value: 'Soporte Técnico', confidence: 'Alta', originalValue: 'Soporte' },
      maquinaBanda: { value: 'Estación de Muestreo A', confidence: 'Alta', originalValue: 'Muestreo A' },
      cliente: { value: 'Suelas del Bajío', confidence: 'Alta', originalValue: 'Suelas del Bajío' },
      oc: { value: 'OC-SUEL-4820', confidence: 'Alta', originalValue: 'OC-SUEL-4820' },
      lote: { value: 'LOTE-303-SLS', confidence: 'Alta', originalValue: 'LOTE-303-SLS' },
      modelo: { value: 'Suela Trekking EVA', confidence: 'Alta', originalValue: 'Suela Trekking EVA' },
      color: { value: 'Blanco Óptico', confidence: 'Alta', originalValue: 'Blanco Óptico' },
      totalPares: { value: '3500', confidence: 'Alta', originalValue: '3500' },
      primeras: { value: '3480', confidence: 'Alta', originalValue: '3480' },
      segundas: { value: '20', confidence: 'Alta', originalValue: '20' },
      defectos: { value: 'Ninguno reportado', confidence: 'Alta', originalValue: 'Ninguno' },
      observaciones: { value: 'Liberación completa física ejecutada.', confidence: 'Alta', originalValue: 'Liberada física' }
    },
    'Producto primeras': {
      fecha: { value: '2026-05-25', confidence: 'Alta', originalValue: '2026-05-25' },
      turno: { value: 'Matutino', confidence: 'Alta', originalValue: 'Matutino' },
      area: { value: 'Inyección EVA', confidence: 'Alta', originalValue: 'Inyección' },
      inspector: { value: currentUser.email.split('@')[0], confidence: 'Alta', originalValue: currentUser.email.split('@')[0] },
      lider: { value: 'Raúl Sánchez', confidence: 'Alta', originalValue: 'Raúl Sánchez' },
      maquinaBanda: { value: 'Muck Extrusion Machine #5', confidence: 'Alta', originalValue: 'Extrusion #5' },
      cliente: { value: 'Calzado Andrea', confidence: 'Alta', originalValue: 'Calzado Andrea' },
      oc: { value: 'OC-2026-4418', confidence: 'Alta', originalValue: 'OC-2026-4418' },
      lote: { value: 'LOTE-771-EVA', confidence: 'Alta', originalValue: 'LOTE-771-EVA' },
      modelo: { value: 'Zapatilla EVA Spring', confidence: 'Alta', originalValue: 'Zapatilla EVA Spring' },
      color: { value: 'Rosa Humo', confidence: 'Alta', originalValue: 'Rosa Humo' },
      totalPares: { value: '1220', confidence: 'Alta', originalValue: '1220' },
      primeras: { value: '1220', confidence: 'Alta', originalValue: '1220' },
      segundas: { value: '0', confidence: 'Alta', originalValue: '0' },
      defectos: { value: 'Ninguno', confidence: 'Alta', originalValue: 'Ninguno' },
      observaciones: { value: 'Cumplimiento excelente de calidad.', confidence: 'Alta', originalValue: 'Calidad OK' }
    },
    'Producto segundas': {
      fecha: { value: '2026-05-25', confidence: 'Alta', originalValue: '2026-05-25' },
      turno: { value: 'Vespertino', confidence: 'Alta', originalValue: 'Vespertino' },
      area: { value: 'Banda Acabado', confidence: 'Alta', originalValue: 'Acabado' },
      inspector: { value: currentUser.email.split('@')[0], confidence: 'Alta', originalValue: currentUser.email.split('@')[0] },
      lider: { value: 'Diana Cruz', confidence: 'Alta', originalValue: 'Diana Cruz' },
      maquinaBanda: { value: 'Banda Concurrencia', confidence: 'Alta', originalValue: 'Banda' },
      cliente: { value: 'Suelas del Bajío', confidence: 'Alta', originalValue: 'Suelas del Bajío' },
      oc: { value: 'OC-SUEL-4820', confidence: 'Alta', originalValue: 'OC-SUEL-4820' },
      lote: { value: 'LOTE-303-SLS', confidence: 'Alta', originalValue: 'LOTE-303-SLS' },
      modelo: { value: 'Suela Trekking EVA', confidence: 'Alta', originalValue: 'Suela Trekking' },
      color: { value: 'Gris Oxford', confidence: 'Alta', originalValue: 'Gris' },
      totalPares: { value: '50', confidence: 'Alta', originalValue: '50' },
      primeras: { value: '0', confidence: 'Alta', originalValue: '0' },
      segundas: { value: '50', confidence: 'Alta', originalValue: '50' },
      defectos: { value: 'Porosidad e imperfección visual de tacón', confidence: 'Baja', originalValue: 'Porosidad tacón' },
      observaciones: { value: 'Venta autorizada para canal outlet.', confidence: 'Media', originalValue: 'Venta outlet' }
    },
    'Bitácora manual de producción': {
      fecha: { value: '2026-05-25', confidence: 'Alta', originalValue: '2026-05-25' },
      turno: { value: 'Matutino', confidence: 'Alta', originalValue: 'Matutino' },
      area: { value: 'Inyección EVA', confidence: 'Alta', originalValue: 'Inyección EVA' },
      inspector: { value: currentUser.email.split('@')[0], confidence: 'Alta', originalValue: currentUser.email.split('@')[0] },
      lider: { value: 'Raúl Sánchez', confidence: 'Alta', originalValue: 'Raúl Sánchez' },
      maquinaBanda: { value: 'Inyectora EVA #1', confidence: 'Alta', originalValue: 'Inyectora EVA #1' },
      cliente: { value: 'Calzado Andrea', confidence: 'Baja', originalValue: 'Calz. Andr' },
      oc: { value: 'OC-2505-ABC', confidence: 'Media', originalValue: 'OC-2505-A' },
      lote: { value: 'LOTE-404-MCL', confidence: 'Alta', originalValue: 'LOTE-404' },
      modelo: { value: 'Muck Boots Comfort', confidence: 'Media', originalValue: 'Muck Comfort' },
      color: { value: 'Plata Metálico', confidence: 'Alta', originalValue: 'Plata Met' },
      totalPares: { value: '1800', confidence: 'Media', originalValue: '1800' },
      primeras: { value: '1780', confidence: 'Baja', originalValue: '1780' },
      segundas: { value: '20', confidence: 'Baja', originalValue: '20' },
      defectos: { value: 'Salpicado menor de mezcla', confidence: 'Baja', originalValue: 'Salpicado' },
      observaciones: { value: 'Bitácora manuscrita re-escaneada a lote digital.', confidence: 'Alta', originalValue: 'Manuscrita rescan' }
    }
  };

  // Click handler: Cargar documento (Simulation)
  const handleCargarDocumento = () => {
    setIsUploading(true);

    setTimeout(() => {
      setIsUploading(false);
      
      const fileIdNum = documents.length + 1;
      const docId = `DOC-00${fileIdNum}`;
      const extension = selectedFormatType.includes('Reporte') || selectedFormatType.includes('flujo') ? 'pdf' : 'png';
      const fName = `${selectedFormatType.replace(/\s+/g, '_').substring(0, 15).toUpperCase()}_${fileIdNum}_VAL.${extension}`;
      
      // Build a realistic raw flat text representational layout
      const generatedRawSim = `=== PLASYECT INDUSTRIAL RECORD ===\n[TENANT IDENTIFIER: ${currentTenant.id}]\nFILE TYPE: ${selectedFormatType}\nUPLOADED BY: ${currentUser.email}\nTIMESTAMP: 2026-05-25 19:30\n---------------------------------------\nDETECTING CHARACTERS IN PHYSICAL CANVAS...\nSTATUS: COMPLETED`

      // Initial blank fields for a brand-new uploaded physical sheet before "Procesar OCR" is clicked
      const template = mockTemplates[selectedFormatType] || mockTemplates['Reporte de inspección de calidad en inyección'];
      
      const newDoc: OCRDocument = {
        id: docId,
        fileName: fName,
        formatType: selectedFormatType,
        uploadDate: '2026-05-25 19:30',
        user: currentUser.email.split('@')[0],
        ocrStatus: 'Pendiente OCR', // Starting status as required by the state flow
        fields: {
          fecha: { value: '', confidence: 'Baja', originalValue: '' },
          turno: { value: '', confidence: 'Baja', originalValue: '' },
          area: { value: '', confidence: 'Baja', originalValue: '' },
          inspector: { value: '', confidence: 'Baja', originalValue: '' },
          lider: { value: '', confidence: 'Baja', originalValue: '' },
          maquinaBanda: { value: '', confidence: 'Baja', originalValue: '' },
          cliente: { value: '', confidence: 'Baja', originalValue: '' },
          oc: { value: '', confidence: 'Baja', originalValue: '' },
          lote: { value: '', confidence: 'Baja', originalValue: '' },
          modelo: { value: '', confidence: 'Baja', originalValue: '' },
          color: { value: '', confidence: 'Baja', originalValue: '' },
          totalPares: { value: '', confidence: 'Baja', originalValue: '' },
          primeras: { value: '', confidence: 'Baja', originalValue: '' },
          segundas: { value: '', confidence: 'Baja', originalValue: '' },
          defectos: { value: '', confidence: 'Baja', originalValue: '' },
          observaciones: { value: '', confidence: 'Baja', originalValue: '' },
        },
        checklist: {
          clienteCorrecto: false,
          ocCorrecta: false,
          loteCorrecto: false,
          modeloCorrecto: false,
          colorCorrecto: false,
          totalesCorrectos: false,
          defectosRevisados: false,
          responsableConfirmado: false,
        },
        detectedCount: 0,
        averageConfidence: 0,
        rawTextSimulated: generatedRawSim
      };

      setDocuments(prev => [newDoc, ...prev]);
      setActiveDocId(docId);
      addAuditLog('OCR', 'FILE_UPLOADED_SIM', `Carga física simulada para archivo: ${fName} (${selectedFormatType})`);
    }, 1200);
  };

  // Click handler: Procesar OCR (Simulation)
  const handleProcesarOCR = () => {
    if (!activeDoc || activeDoc.ocrStatus !== 'Pendiente OCR') return;
    
    setIsProcessingOCR(true);

    setTimeout(() => {
      setIsProcessingOCR(false);
      
      const template = mockTemplates[activeDoc.formatType] || mockTemplates['Reporte de inspección de calidad en inyección'];
      
      // Calculate overall average confidence percentage based on the fields template
      const lowCount = Object.values(template).filter(f => f?.confidence === 'Baja').length;
      const medCount = Object.values(template).filter(f => f?.confidence === 'Media').length;
      const highCount = Object.values(template).filter(f => f?.confidence === 'Alta').length;
      const avgConf = Math.round(((lowCount * 50) + (medCount * 78) + (highCount * 97)) / 16);

      // Deep copy fields
      const processedFields = JSON.parse(JSON.stringify(template));

      // Build realistic raw simulated text
      const rawText = `=== PLASYECT DOCUMENT EXTRACT ===\nFORMAT: ${activeDoc.formatType}\nID: ${activeDoc.id}\nDATE: ${template.fecha?.value}\nCLIENTE: ${template.cliente?.value}\nOC: ${template.oc?.value}\nLOTE: ${template.lote?.value}\nMODELO: ${template.modelo?.value}\nCOLOR: ${template.color?.value}\nPARES DETECTADOS: ${template.totalPares?.value} [1ra: ${template.primeras?.value} / 2da: ${template.segundas?.value}]\nINSPECTOR: ${template.inspector?.value}\nDEFECTO EXTRAÍDO: ${template.defectos?.value}\nOBSERVACIONES: ${template.observaciones?.value}`;

      setDocuments(prev => prev.map(d => {
        if (d.id === activeDoc.id) {
          return {
            ...d,
            ocrStatus: 'OCR completado',
            fields: processedFields,
            averageConfidence: avgConf,
            detectedCount: 16,
            rawTextSimulated: rawText
          };
        }
        return d;
      }));

      addAuditLog('OCR', 'OCR_ANALYSIS_COMPLETED', `Análisis neural completado para el folio ${activeDoc.id}. Confianza general: ${avgConf}%`);
    }, 1500);
  };

  // Handle manual field change inside central panel
  const handleFieldChange = (fieldKey: keyof OCRDocument['fields'], newValue: string) => {
    setDocuments(prev => prev.map(d => {
      if (d.id === activeDocId) {
        const updatedFields = { ...d.fields };
        updatedFields[fieldKey] = {
          ...updatedFields[fieldKey],
          value: newValue
        };
        return {
          ...d,
          fields: updatedFields
        };
      }
      return d;
    }));
  };

  // Handle change in field confidence levels
  const handleFieldConfidenceChange = (fieldKey: keyof OCRDocument['fields'], newConfidence: 'Alta' | 'Media' | 'Baja') => {
    setDocuments(prev => prev.map(d => {
      if (d.id === activeDocId) {
        const updatedFields = { ...d.fields };
        updatedFields[fieldKey] = {
          ...updatedFields[fieldKey],
          confidence: newConfidence
        };
        return {
          ...d,
          fields: updatedFields
        };
      }
      return d;
    }));
  };

  // Toggle checklist checkbox items
  const handleChecklistToggle = (checkKey: keyof OCRDocument['checklist']) => {
    setDocuments(prev => prev.map(d => {
      if (d.id === activeDocId) {
        return {
          ...d,
          checklist: {
            ...d.checklist,
            [checkKey]: !d.checklist[checkKey]
          }
        };
      }
      return d;
    }));
  };

  // Change active doc OCR State
  const changeDocStatus = (newStatus: OCRDocument['ocrStatus'], logMsg: string) => {
    // Determine corrected field count by comparing active fields to their originalValue
    let corrCount = 0;
    if (activeDoc && activeDoc.fields) {
      Object.keys(activeDoc.fields).forEach(key => {
        const k = key as keyof OCRDocument['fields'];
        if (activeDoc.fields[k].value !== activeDoc.fields[k].originalValue) {
          corrCount++;
        }
      });
    }

    setDocuments(prev => prev.map(d => {
      if (d.id === activeDocId) {
        return {
          ...d,
          ocrStatus: newStatus,
          aprobador: newStatus === 'Aprobado' ? currentUser.email : d.aprobador
        };
      }
      return d;
    }));

    addAuditLog('OCR_VALIDATION', `OCR_STATE_${newStatus.replace(/\s+/g, '_').toUpperCase()}`, `Documento ${activeDoc.id} transicionado a '${newStatus}'. ${corrCount} correcciones aplicadas.`);
  };

  // Helper calculating count of corrected fields current document has
  const countCorrectedFields = (doc: OCRDocument): number => {
    if (doc.ocrStatus === 'Pendiente OCR') return 0;
    let count = 0;
    Object.keys(doc.fields).forEach(k => {
      const fieldKey = k as keyof OCRDocument['fields'];
      if (doc.fields[fieldKey].value !== doc.fields[fieldKey].originalValue) {
        count++;
      }
    });
    return count;
  };

  const getConfidenceBadgeColor = (conf: 'Alta' | 'Media' | 'Baja') => {
    switch (conf) {
      case 'Alta': return 'text-emerald-750 bg-emerald-50 border border-emerald-250';
      case 'Media': return 'text-amber-850 bg-amber-50 border border-amber-250';
      case 'Baja': return 'text-rose-850 bg-rose-50 border border-rose-250';
    }
  };

  const getStatusBadgeColor = (status: OCRDocument['ocrStatus']) => {
    switch (status) {
      case 'Pendiente OCR': return 'bg-slate-100 text-slate-700 border border-slate-300';
      case 'OCR completado': return 'bg-cyan-50 text-cyan-800 border border-cyan-300';
      case 'En validación': return 'bg-blue-50 text-blue-800 border border-blue-300';
      case 'Aprobado': return 'bg-emerald-50 text-emerald-800 border border-emerald-300';
      case 'Rechazado': return 'bg-rose-50 text-rose-800 border border-rose-300';
      case 'Corrección requerida': return 'bg-amber-50 text-amber-800 border border-amber-300';
    }
  };

  return (
    <div className="space-y-6">
      
      {/* 1. PARTE SUPERIOR: Controles de Carga y Drag and Drop */}
      <div id="ocr_upper_control" className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-extrabold font-mono text-blue-800 uppercase tracking-widest flex items-center gap-2">
              <ScanLine className="w-5 h-5 text-blue-700 animate-pulse" />
              Consola Inteligente de Digitalización de Documentos
            </h3>
            <p className="text-xs text-slate-500 font-sans leading-relaxed">
              Cargue reportes impresos de inyección, bitácoras de banda o certificaciones para procesar con lectura de visión artificial OCR.
            </p>
          </div>
          
          <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded px-3.5 py-2 flex items-center gap-2 text-[11px] font-mono leading-tight max-w-md">
            <Sparkles className="w-4 h-4 text-blue-700 shrink-0" />
            <span>
              <strong>Nota Prototipo:</strong> OCR simulado para fines del flujo de datos de Plasyect. En producción se integrará con API Neural de Google Cloud Document AI.
            </span>
          </div>
        </div>

        {/* Upload Row: Dropdown format + Clickable area */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 pt-2">
          
          {/* Format selector panel */}
          <div className="lg:col-span-4 flex flex-col justify-center space-y-3 p-4 bg-slate-905 rounded-lg border border-slate-800">
            <label className="text-[10px] font-extrabold tracking-wider uppercase font-mono text-slate-500">
              Paso 1: Seleccionar Tipo de Formato Físico
            </label>
            <select
              value={selectedFormatType}
              onChange={(e) => setSelectedFormatType(e.target.value)}
              className="w-full bg-white border border-slate-700 rounded p-2 text-xs font-sans text-slate-900 font-bold focus:outline-none focus:border-blue-600 focus:ring-1 focus:ring-blue-600 transition-all cursor-pointer"
            >
              {formatTypesList.map((format, idx) => (
                <option key={idx} value={format}>
                  {idx + 1}. {format}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 italic">
              * El procesador ajustará las regex de validación según el formato del documento seleccionado.
            </p>
          </div>

          {/* Dotted Drag & Drop simulation container */}
          <div className="lg:col-span-8">
            <button
              onClick={handleCargarDocumento}
              disabled={isUploading || isProcessingOCR}
              className="w-full h-full min-h-[110px] border-2 border-dashed border-slate-700 hover:border-blue-600 bg-slate-955 hover:bg-slate-850 rounded-lg p-5 flex flex-col items-center justify-center text-center transition-all cursor-pointer disabled:opacity-40 disabled:pointer-events-none group outline-none"
            >
              {isUploading ? (
                <div className="space-y-2">
                  <RefreshCw className="w-7 h-7 text-blue-600 animate-spin mx-auto" />
                  <span className="text-xs font-mono font-bold text-blue-700 animate-pulse block">CARGANDO ARCHIVO FÍSICO Y PRE-PROCESANDO...</span>
                </div>
              ) : (
                <div className="space-y-1">
                  <Upload className="w-7 h-7 text-slate-400 group-hover:text-blue-600 transition-colors mx-auto" />
                  <span className="text-xs font-bold font-sans text-slate-900 group-hover:text-blue-700 transition-colors block">
                    Arrastra el archivo escaneado PDF/Imágenes aquí o haz clic para cargar simulación
                  </span>
                  <span className="text-[10px] text-slate-450 font-mono block">
                    Formatos soportados: PDF, JPG, PNG de alta densidad fotográfica (Máx 15MB)
                  </span>
                </div>
              )}
            </button>
          </div>

        </div>

      </div>

      {/* THREE PANEL GRID LAYOUT: LEFT (PREVIEW), CENTER (EXTRACTED), RIGHT (HUMAN CHECK) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* 2. PANEL IZQUIERDO: Vista Previa Simulada */}
        <div id="ocr_left_preview_panel" className="lg:col-span-3 bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4 min-h-[500px] flex flex-col justify-between">
          <div>
            <div className="border-b border-slate-800 pb-2 mb-3">
              <h4 className="text-[10px] font-extrabold font-mono text-slate-450 uppercase tracking-widest select-none">
                VISTA PREVIA DEL DOCUMENTO
              </h4>
            </div>

            {/* Document sheet style display */}
            <div className="relative border border-slate-700 rounded bg-slate-905 p-3 font-mono text-[9px] text-slate-500 min-h-[300px] overflow-hidden select-none flex flex-col justify-between">
              
              {/* Laser Line Animation Effect for scanning */}
              {(isProcessingOCR || isUploading) && (
                <div className="absolute inset-x-0 h-1 bg-cyan-600 opacity-90 animate-bounce shadow-[0_0_15px_#0e7490] z-20"></div>
              )}

              {/* Watermarked stamp logo behind text */}
              <div className="absolute inset-0 flex items-center justify-center opacity-[0.03] rotate-45 pointer-events-none">
                <ScanLine className="w-48 h-48 text-slate-900" />
              </div>

              {/* Simulated Paper Header */}
              <div className="border-b border-slate-700 pb-2 space-y-1 z-10">
                <div className="flex justify-between items-center font-bold text-slate-700">
                  <span>PLASYECT IND. CO.</span>
                  <span>FOLIO: {activeDoc.id}</span>
                </div>
                <div className="text-[8px] text-slate-450">
                  SYSTEM ENGINE TRACE ID: {activeDoc.id}-{activeDoc.fileName.substring(0, 4)}
                </div>
              </div>

              {/* Simulated Paper Body */}
              <div className="py-4 space-y-2 whitespace-pre-line leading-relaxed flex-1 z-10 text-slate-650">
                {activeDoc.ocrStatus === 'Pendiente OCR' ? (
                  <div className="py-12 text-center space-y-2">
                    <FileSearch2 className="w-8 h-8 text-slate-400 mx-auto" />
                    <p className="font-sans font-bold text-slate-750">PENDIENTE DE PROCESAMIENTO OCR</p>
                    <p className="font-sans text-[8px] text-slate-500">Se requiere pulsar el botón "Procesar OCR" para gatillar la lectura de caracteres.</p>
                  </div>
                ) : (
                  activeDoc.rawTextSimulated || 'Ningún dato plano registrado'
                )}
              </div>

              {/* Simulated Paper Stamp */}
              <div className="border-t border-dashed border-slate-700 pt-2 flex justify-between items-center text-[8px] text-slate-500 font-mono z-10">
                <span>ESTADO: {activeDoc.ocrStatus}</span>
                <span className="font-bold">VERSIÓN PROTOTIPO v2.5</span>
              </div>

            </div>
          </div>

          {/* Trigger action or metadata */}
          <div className="space-y-3 pt-3 border-t border-slate-800">
            {/* Metadata Card */}
            <div className="bg-slate-905 border border-slate-800 rounded p-2.5 space-y-1.5 text-xs text-slate-650">
              <div className="flex justify-between">
                <span className="text-slate-450 font-mono">Archivo:</span>
                <span className="font-bold text-slate-900 truncate max-w-[130px] font-mono" title={activeDoc.fileName}>
                  {activeDoc.fileName}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450 font-mono">Formato:</span>
                <span className="font-semibold text-slate-750 text-[10px] text-right truncate max-w-[130px]" title={activeDoc.formatType}>
                  {activeDoc.formatType}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450 font-mono">Fecha carga:</span>
                <span className="font-mono text-slate-900">{activeDoc.uploadDate}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-450 font-mono">Usuario:</span>
                <span className="font-semibold text-slate-750 font-mono">{activeDoc.user}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-450 font-mono">Estado:</span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-mono font-black ${getStatusBadgeColor(activeDoc.ocrStatus)}`}>
                  {activeDoc.ocrStatus}
                </span>
              </div>
            </div>

            {/* Iniciar OCR trigger button */}
            {activeDoc.ocrStatus === 'Pendiente OCR' && (
              <button
                onClick={handleProcesarOCR}
                disabled={isProcessingOCR}
                className="w-full py-2 bg-indigo-650 hover:bg-indigo-750 text-white font-sans font-black tracking-wide text-xs uppercase rounded flex items-center justify-center gap-1.5 transition-all outline-none cursor-pointer shadow"
              >
                {isProcessingOCR ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Transcribiendo...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Procesar OCR</span>
                  </>
                )}
              </button>
            )}
          </div>

        </div>

        {/* 3. PANEL CENTRAL: Datos Extraídos Editables con Niveles de Confianza */}
        <div id="ocr_center_extracted_fields" className="lg:col-span-6 bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
          
          <div className="border-b border-slate-800 pb-2 flex items-center justify-between">
            <h4 className="text-[10px] font-extrabold font-mono text-slate-450 uppercase tracking-widest select-none">
              MATEO / CAMPOS DETECTADOS POR IA Y DATOS COMPLEMENTARIOS
            </h4>
            {activeDoc.ocrStatus !== 'Pendiente OCR' && (
              <span className="text-[10px] bg-slate-850 px-2 py-0.5 rounded font-mono font-black text-slate-300">
                Confianza Promedio: {activeDoc.averageConfidence}%
              </span>
            )}
          </div>

          {activeDoc.ocrStatus === 'Pendiente OCR' ? (
            <div className="py-24 text-center space-y-3">
              <ScanLine className="w-12 h-12 text-slate-400 mx-auto animate-pulse" />
              <p className="text-sm font-sans font-bold text-slate-700">CAMPOS EN ESPERA DE EXTRACCIÓN</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Los campos aún no se han extraído del soporte físico. Presione el botón <strong className="text-indigo-600">"Procesar OCR"</strong> en el panel izquierdo para transcribir el formulario.
              </p>
              <button
                onClick={handleProcesarOCR}
                disabled={isProcessingOCR}
                className="mt-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-750 text-white font-mono text-xs uppercase font-bold rounded shadow transition-all cursor-pointer inline-flex items-center gap-1.5"
              >
                <Play className="w-3.5 h-3.5" /> Iniciar Lectura OCR
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-[11px] text-slate-500 italic">
                * Revise detalladamente los campos. Los valores editados respecto al original se marcarán automáticamente como <span className="text-blue-700 font-bold font-mono">Modificados</span>.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                
                {/* FECHA */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Fecha</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.fecha.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('fecha', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.fecha.confidence)}`}>
                        {activeDoc.fields.fecha.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="date"
                      value={activeDoc.fields.fecha.value}
                      onChange={(e) => handleFieldChange('fecha', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.fecha.value !== activeDoc.fields.fecha.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.fecha.value !== activeDoc.fields.fecha.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* TURNO */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Turno</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.turno.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('turno', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.turno.confidence)}`}>
                        {activeDoc.fields.turno.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.turno.value}
                      onChange={(e) => handleFieldChange('turno', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.turno.value !== activeDoc.fields.turno.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.turno.value !== activeDoc.fields.turno.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* AREA */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Área</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.area.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('area', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.area.confidence)}`}>
                        {activeDoc.fields.area.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.area.value}
                      onChange={(e) => handleFieldChange('area', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.area.value !== activeDoc.fields.area.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.area.value !== activeDoc.fields.area.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* INSPECTOR */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Inspector</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.inspector.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('inspector', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.inspector.confidence)}`}>
                        {activeDoc.fields.inspector.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.inspector.value}
                      onChange={(e) => handleFieldChange('inspector', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.inspector.value !== activeDoc.fields.inspector.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.inspector.value !== activeDoc.fields.inspector.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* LIDER */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Líder</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.lider.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('lider', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.lider.confidence)}`}>
                        {activeDoc.fields.lider.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.lider.value}
                      onChange={(e) => handleFieldChange('lider', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.lider.value !== activeDoc.fields.lider.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.lider.value !== activeDoc.fields.lider.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* MAQUINA / BANDA */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Máquina / Banda</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.maquinaBanda.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('maquinaBanda', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.maquinaBanda.confidence)}`}>
                        {activeDoc.fields.maquinaBanda.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.maquinaBanda.value}
                      onChange={(e) => handleFieldChange('maquinaBanda', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.maquinaBanda.value !== activeDoc.fields.maquinaBanda.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.maquinaBanda.value !== activeDoc.fields.maquinaBanda.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* CLIENTE */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Cliente</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.cliente.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('cliente', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.cliente.confidence)}`}>
                        {activeDoc.fields.cliente.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.cliente.value}
                      onChange={(e) => handleFieldChange('cliente', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.cliente.value !== activeDoc.fields.cliente.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.cliente.value !== activeDoc.fields.cliente.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* OC */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">OC (Orden de Compra)</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.oc.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('oc', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.oc.confidence)}`}>
                        {activeDoc.fields.oc.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.oc.value}
                      onChange={(e) => handleFieldChange('oc', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.oc.value !== activeDoc.fields.oc.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.oc.value !== activeDoc.fields.oc.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* LOTE */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Lote</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.lote.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('lote', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.lote.confidence)}`}>
                        {activeDoc.fields.lote.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.lote.value}
                      onChange={(e) => handleFieldChange('lote', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.lote.value !== activeDoc.fields.lote.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.lote.value !== activeDoc.fields.lote.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* MODELO */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Modelo</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.modelo.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('modelo', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.modelo.confidence)}`}>
                        {activeDoc.fields.modelo.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.modelo.value}
                      onChange={(e) => handleFieldChange('modelo', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.modelo.value !== activeDoc.fields.modelo.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.modelo.value !== activeDoc.fields.modelo.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* COLOR */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Color</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.color.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('color', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.color.confidence)}`}>
                        {activeDoc.fields.color.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.color.value}
                      onChange={(e) => handleFieldChange('color', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.color.value !== activeDoc.fields.color.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.color.value !== activeDoc.fields.color.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* TOTAL PARES */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Total Pares</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.totalPares.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('totalPares', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.totalPares.confidence)}`}>
                        {activeDoc.fields.totalPares.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="number"
                      value={activeDoc.fields.totalPares.value}
                      onChange={(e) => handleFieldChange('totalPares', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.totalPares.value !== activeDoc.fields.totalPares.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.totalPares.value !== activeDoc.fields.totalPares.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* PRIMERAS */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Primeras</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.primeras.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('primeras', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.primeras.confidence)}`}>
                        {activeDoc.fields.primeras.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="number"
                      value={activeDoc.fields.primeras.value}
                      onChange={(e) => handleFieldChange('primeras', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.primeras.value !== activeDoc.fields.primeras.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.primeras.value !== activeDoc.fields.primeras.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* SEGUNDAS */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Segundas</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.segundas.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('segundas', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.segundas.confidence)}`}>
                        {activeDoc.fields.segundas.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="number"
                      value={activeDoc.fields.segundas.value}
                      onChange={(e) => handleFieldChange('segundas', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.segundas.value !== activeDoc.fields.segundas.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.segundas.value !== activeDoc.fields.segundas.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

                {/* DEFECTOS */}
                <div className="space-y-1 md:col-span-2">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Defectos</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.defectos.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('defectos', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.defectos.confidence)}`}>
                        {activeDoc.fields.defectos.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <input 
                      type="text"
                      value={activeDoc.fields.defectos.value}
                      onChange={(e) => handleFieldChange('defectos', e.target.value)}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.defectos.value !== activeDoc.fields.defectos.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.defectos.value !== activeDoc.fields.defectos.originalValue && (
                      <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded bg-blue-150 inline-block">Modificado</span>
                    )}
                  </div>
                </div>

                {/* OBSERVACIONES */}
                <div className="space-y-1 md:col-span-2">
                  <div className="flex justify-between items-center text-[10px] font-mono leading-tight">
                    <span className="font-bold text-slate-450 uppercase">Observaciones</span>
                    <div className="flex items-center gap-1">
                      <select 
                        value={activeDoc.fields.observaciones.confidence} 
                        onChange={(e) => handleFieldConfidenceChange('observaciones', e.target.value as any)}
                        className="text-[9px] bg-transparent font-bold cursor-pointer hover:underline text-slate-450 focus:outline-none"
                      >
                        <option value="Alta">Alta</option>
                        <option value="Media">Media</option>
                        <option value="Baja">Baja</option>
                      </select>
                      <span className={`px-1 rounded-sm text-[8px] font-black ${getConfidenceBadgeColor(activeDoc.fields.observaciones.confidence)}`}>
                        {activeDoc.fields.observaciones.confidence}
                      </span>
                    </div>
                  </div>
                  <div className="relative">
                    <textarea 
                      value={activeDoc.fields.observaciones.value}
                      onChange={(e) => handleFieldChange('observaciones', e.target.value)}
                      rows={2}
                      className={`w-full bg-slate-905 border ${activeDoc.fields.observaciones.value !== activeDoc.fields.observaciones.originalValue ? 'border-blue-500 text-blue-900 bg-blue-50/20' : 'border-slate-800 text-slate-900'} rounded p-1.5 text-xs font-sans font-semibold resize-none focus:outline-none focus:border-blue-700`}
                    />
                    {activeDoc.fields.observaciones.value !== activeDoc.fields.observaciones.originalValue && (
                      <span className="absolute right-1.5 bottom-1.5 text-[8px] text-blue-700 font-mono font-bold bg-blue-100 px-1 rounded">Modificado</span>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

        </div>

        {/* 4. PANEL DERECHO: Validación Humana Checklist & Acciones */}
        <div id="ocr_right_validation_actions" className="lg:col-span-3 bg-slate-950 border border-slate-800 rounded-xl p-4 shadow-sm space-y-4">
          
          <div className="border-b border-slate-800 pb-2">
            <h4 className="text-[10px] font-extrabold font-mono text-slate-450 uppercase tracking-widest select-none">
              VALIDACIÓN / CONTROL DE SEGUIDAD CRM
            </h4>
          </div>

          {activeDoc.ocrStatus === 'Pendiente OCR' ? (
            <div className="py-20 text-center space-y-2">
              <Lock className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-xs font-sans font-bold text-slate-700">CONTROLES BLOQUEADOS</p>
              <p className="text-[10px] text-slate-500">Primero procese el OCR para habilitar la firma de conformidad.</p>
            </div>
          ) : (
            <div className="space-y-4 flex flex-col justify-between min-h-[400px]">
              
              {/* Checklist Group */}
              <div className="space-y-2.5">
                <span className="text-[10px] font-extrabold font-mono text-slate-450 uppercase block tracking-wider">
                  Checklist Humano Obligatorio:
                </span>
                
                <div className="space-y-1.5 bg-slate-905 border border-slate-800 rounded p-3 text-[11px] text-slate-705">
                  <label className="flex items-center gap-2 cursor-pointer py-0.5 hover:text-slate-900">
                    <input 
                      type="checkbox"
                      checked={activeDoc.checklist.clienteCorrecto}
                      onChange={() => handleChecklistToggle('clienteCorrecto')}
                      className="w-3.5 h-3.5 accent-blue-600 rounded bg-white border border-slate-700 focus:outline-none"
                    />
                    <span className={activeDoc.checklist.clienteCorrecto ? 'line-through text-slate-400' : 'font-semibold'}>Cliente correcto</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer py-0.5 hover:text-slate-900">
                    <input 
                      type="checkbox"
                      checked={activeDoc.checklist.ocCorrecta}
                      onChange={() => handleChecklistToggle('ocCorrecta')}
                      className="w-3.5 h-3.5 accent-blue-600 rounded bg-white border border-slate-700 focus:outline-none"
                    />
                    <span className={activeDoc.checklist.ocCorrecta ? 'line-through text-slate-400' : 'font-semibold'}>OC correcta</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer py-0.5 hover:text-slate-900">
                    <input 
                      type="checkbox"
                      checked={activeDoc.checklist.loteCorrecto}
                      onChange={() => handleChecklistToggle('loteCorrecto')}
                      className="w-3.5 h-3.5 accent-blue-600 rounded bg-white border border-slate-700 focus:outline-none"
                    />
                    <span className={activeDoc.checklist.loteCorrecto ? 'line-through text-slate-400' : 'font-semibold'}>Lote correcto</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer py-0.5 hover:text-slate-900">
                    <input 
                      type="checkbox"
                      checked={activeDoc.checklist.modeloCorrecto}
                      onChange={() => handleChecklistToggle('modeloCorrecto')}
                      className="w-3.5 h-3.5 accent-blue-600 rounded bg-white border border-slate-700 focus:outline-none"
                    />
                    <span className={activeDoc.checklist.modeloCorrecto ? 'line-through text-slate-400' : 'font-semibold'}>Modelo correcto</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer py-0.5 hover:text-slate-900">
                    <input 
                      type="checkbox"
                      checked={activeDoc.checklist.colorCorrecto}
                      onChange={() => handleChecklistToggle('colorCorrecto')}
                      className="w-3.5 h-3.5 accent-blue-600 rounded bg-white border border-slate-700 focus:outline-none"
                    />
                    <span className={activeDoc.checklist.colorCorrecto ? 'line-through text-slate-400' : 'font-semibold'}>Color correcto</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer py-0.5 hover:text-slate-900">
                    <input 
                      type="checkbox"
                      checked={activeDoc.checklist.totalesCorrectos}
                      onChange={() => handleChecklistToggle('totalesCorrectos')}
                      className="w-3.5 h-3.5 accent-blue-600 rounded bg-white border border-slate-700 focus:outline-none"
                    />
                    <span className={activeDoc.checklist.totalesCorrectos ? 'line-through text-slate-400' : 'font-semibold'}>Totales correctos</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer py-0.5 hover:text-slate-900">
                    <input 
                      type="checkbox"
                      checked={activeDoc.checklist.defectosRevisados}
                      onChange={() => handleChecklistToggle('defectosRevisados')}
                      className="w-3.5 h-3.5 accent-blue-600 rounded bg-white border border-slate-700 focus:outline-none"
                    />
                    <span className={activeDoc.checklist.defectosRevisados ? 'line-through text-slate-400' : 'font-semibold'}>Defectos revisados</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer py-0.5 hover:text-slate-900">
                    <input 
                      type="checkbox"
                      checked={activeDoc.checklist.responsableConfirmado}
                      onChange={() => handleChecklistToggle('responsableConfirmado')}
                      className="w-3.5 h-3.5 accent-blue-600 rounded bg-white border border-slate-700 focus:outline-none"
                    />
                    <span className={activeDoc.checklist.responsableConfirmado ? 'line-through text-slate-400' : 'font-semibold'}>Responsable confirmado</span>
                  </label>
                </div>

                <div className="text-[10px] text-slate-500 italic mt-1 leading-normal">
                  * Al marcar todos los campos, consiente que la lectura es fiel y los márgenes están acreditados por su rol.
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-4 border-t border-slate-800">
                <button
                  onClick={() => changeDocStatus('Aprobado', 'Documento OCR aprobado e integrado')}
                  className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition-all outline-none cursor-pointer shadow-md"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Aprobar documento</span>
                </button>

                <button
                  onClick={() => changeDocStatus('Rechazado', 'Documento OCR rechazado por auditoría')}
                  className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black uppercase tracking-wider rounded flex items-center justify-center gap-1.5 transition-all outline-none cursor-pointer"
                >
                  <X className="w-4 h-4" />
                  <span>Rechazar documento</span>
                </button>

                <button
                  onClick={() => changeDocStatus('Corrección requerida', 'Retroalimentación enviada al inspector')}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black tracking-wider uppercase rounded flex items-center justify-center gap-1.5 transition-all outline-none cursor-pointer"
                >
                  <AlertTriangle className="w-4 h-4" />
                  <span>Enviar a corrección</span>
                </button>

                <button
                  onClick={() => changeDocStatus('En validación', 'Borrador de reconciliación guardado')}
                  className="w-full py-2 bg-slate-905 border border-slate-700 hover:bg-slate-850 text-slate-900 text-xs font-black tracking-wider uppercase rounded flex items-center justify-center gap-1.5 transition-all outline-none cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  <span>Guardar borrador</span>
                </button>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* 5. TABLA INFERIOR: Historial de Documentos OCR */}
      <div id="ocr_lower_history_section" className="bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-sm space-y-3">
        
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <h4 className="text-sm font-extrabold font-mono text-slate-800 uppercase tracking-widest flex items-center gap-1.5">
            <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
            Registro Histórico y Bitácora General de Validación OCR
          </h4>
          <span className="text-[10px] font-mono bg-slate-905 border border-slate-800 text-slate-500 px-2.5 py-1 rounded font-bold">
            Total Lector: {documents.length} Documentos
          </span>
        </div>

        <div className="overflow-x-auto w-full border border-slate-800 rounded-lg">
          <table className="w-full text-left border-collapse text-[11px] font-sans">
            <thead>
              <tr className="bg-slate-905 border-b border-slate-800 text-slate-500 font-mono text-[9px] uppercase tracking-wider select-none font-bold">
                <th className="py-2.5 px-3">Fecha Carga</th>
                <th className="py-2.5 px-3">Tipo Documento</th>
                <th className="py-2.5 px-3">Archivo Escándalo</th>
                <th className="py-2.5 px-3">Usuario Carga</th>
                <th className="py-2.5 px-3 text-center">Campos Detectados</th>
                <th className="py-2.5 px-3 text-center">Campos Corregidos</th>
                <th className="py-2.5 px-3 text-center">Confianza Promedio</th>
                <th className="py-2.5 px-3 text-center">Estado de Flujo</th>
                <th className="py-2.5 px-3">Aprobador / Validador</th>
                <th className="py-2.5 px-2 text-center col-span-1">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 whitespace-nowrap">
              {documents.map((doc) => {
                const isSelected = activeDocId === doc.id;
                const correctedFields = countCorrectedFields(doc);
                
                return (
                  <tr
                    key={doc.id}
                    onClick={() => setActiveDocId(doc.id)}
                    className={`cursor-pointer transition-colors ${
                      isSelected 
                        ? 'bg-blue-50/40 border-l-4 border-l-blue-600 font-medium' 
                        : 'hover:bg-slate-905 bg-white'
                    }`}
                  >
                    <td className="py-2.5 px-3 font-mono text-slate-450">{doc.uploadDate}</td>
                    <td className="py-2.5 px-3 text-slate-900 font-semibold">{doc.formatType}</td>
                    <td className="py-2.5 px-3 font-mono text-slate-750 flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-slate-500" />
                      {doc.fileName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-750">{doc.user}</td>
                    <td className="py-2.5 px-3 text-center font-mono text-slate-750">
                      {doc.ocrStatus === 'Pendiente OCR' ? '-' : `${doc.detectedCount} / 16`}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">
                      {doc.ocrStatus === 'Pendiente OCR' ? (
                        '-'
                      ) : correctedFields > 0 ? (
                        <span className="text-blue-700 bg-blue-50 px-1.5 py-0.2 rounded font-bold border border-blue-200">
                          {correctedFields} corr.
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center font-mono">
                      {doc.ocrStatus === 'Pendiente OCR' ? (
                        '-'
                      ) : (
                        <span className={`font-semibold ${
                          doc.averageConfidence >= 90 ? 'text-emerald-700' :
                          doc.averageConfidence >= 75 ? 'text-amber-800' : 'text-rose-800'
                        }`}>
                          {doc.averageConfidence}%
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`inline-block px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wide font-black ${getStatusBadgeColor(doc.ocrStatus)}`}>
                        {doc.ocrStatus}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-650">
                      {doc.aprobador ? (
                        <span className="flex items-center gap-1 text-slate-900 font-bold">
                          <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                          {doc.aprobador}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">No asignado</span>
                      )}
                    </td>
                    <td className="py-1 px-2 text-center">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveDocId(doc.id);
                        }}
                        className="p-1 text-indigo-600 hover:bg-slate-200 rounded transition"
                        title="Ver detalle de auditoría"
                      >
                        <FileSearch className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

      </div>

    </div>
  );
};
