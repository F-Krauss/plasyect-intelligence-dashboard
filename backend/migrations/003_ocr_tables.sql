-- Migration 003: OCR tables for plasyect-ocr-service

CREATE TABLE IF NOT EXISTS ocr_letra_tipos (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    schema JSONB NOT NULL DEFAULT '{"fields":[],"tables":[]}'::jsonb,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ocr_responsables (
    id SERIAL PRIMARY KEY,
    letra_tipo_id TEXT REFERENCES ocr_letra_tipos(id) ON DELETE CASCADE,
    area TEXT NOT NULL,
    turno TEXT NOT NULL DEFAULT '*',
    nombre TEXT NOT NULL,
    email TEXT,
    notificar BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE UNIQUE INDEX IF NOT EXISTS ocr_responsables_unique
    ON ocr_responsables (letra_tipo_id, area, turno, COALESCE(email, ''));

CREATE TABLE IF NOT EXISTS ocr_reportes (
    id TEXT PRIMARY KEY,
    letra_tipo_id TEXT REFERENCES ocr_letra_tipos(id),
    nombre_archivo TEXT,
    tipo_mime TEXT,
    fecha_carga TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    usuario_carga TEXT,
    estado TEXT NOT NULL DEFAULT 'pendiente_ocr',
    datos_extraidos JSONB NOT NULL DEFAULT '{}'::jsonb,
    datos_corregidos JSONB NOT NULL DEFAULT '{}'::jsonb,
    confianza_promedio FLOAT,
    alertas TEXT[] NOT NULL DEFAULT '{}',
    ocr_raw JSONB NOT NULL DEFAULT '{}'::jsonb,
    aprobador TEXT,
    fecha_aprobacion TIMESTAMPTZ,
    notas TEXT,
    creado_en TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ocr_reportes_letra_tipo_idx ON ocr_reportes (letra_tipo_id);
CREATE INDEX IF NOT EXISTS ocr_reportes_estado_idx ON ocr_reportes (estado);
CREATE INDEX IF NOT EXISTS ocr_reportes_creado_en_idx ON ocr_reportes (creado_en DESC);

-- Seed letter types comunes de Plasyect
INSERT INTO ocr_letra_tipos (id, nombre, descripcion, schema) VALUES
  ('inspeccion_calidad_inyeccion', 'Reporte de inspección de calidad en inyección',
   'Control de calidad para el proceso de inyección EVA',
   '{"fields":[],"tables":[]}'::jsonb),
  ('inspeccion_calidad_banda', 'Reporte de inspección de calidad en banda',
   'Control de calidad para la banda de acabado',
   '{"fields":[],"tables":[]}'::jsonb),
  ('liberacion_flujo_produccion', 'Liberación y flujo de producción',
   'Liberación de compuesto y aduana de calidad',
   '{"fields":[],"tables":[]}'::jsonb),
  ('producto_primeras', 'Producto primeras',
   'Registro de producto de primera calidad',
   '{"fields":[],"tables":[]}'::jsonb),
  ('producto_segundas', 'Producto segundas',
   'Registro de producto de segunda calidad',
   '{"fields":[],"tables":[]}'::jsonb),
  ('bitacora_produccion', 'Bitácora manual de producción',
   'Bitácora manuscrita de control físico de lote',
   '{"fields":[],"tables":[]}'::jsonb)
ON CONFLICT (id) DO NOTHING;
