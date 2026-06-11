import io
import json
import os
import re
import asyncio
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

import cv2
import numpy as np
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image

try:
    import pypdfium2 as pdfium
except Exception:
    pdfium = None
try:
    from pypdf import PdfReader
except Exception:
    PdfReader = None

import vertexai
from google.cloud import documentai_v1 as documentai
from vertexai.generative_models import GenerativeModel, Part

DATABASE_URL = os.getenv("DATABASE_URL") or os.getenv("DATABASE_URL_DIRECT")

PROJECT_ID = os.getenv("VERTEX_PROJECT_ID") or os.getenv("GOOGLE_CLOUD_PROJECT")
LOCATION = os.getenv("VERTEX_LOCATION", "us-central1")
TEMPLATE_MODEL = os.getenv("OCR_TEMPLATE_MODEL", "gemini-2.5-flash")
EXTRACTION_MODEL = os.getenv("OCR_EXTRACTION_MODEL", "gemini-2.5-flash")

DOC_AI_PROJECT_ID = os.getenv("DOCUMENT_AI_PROJECT_ID") or PROJECT_ID
DOC_AI_LOCATION = os.getenv("DOCUMENT_AI_LOCATION", "us")
DOC_AI_PROCESSOR_ID = os.getenv("DOCUMENT_AI_PROCESSOR_ID")
DOC_AI_PROCESSOR_VERSION = os.getenv("DOCUMENT_AI_PROCESSOR_VERSION")
DOC_AI_MIN_CONFIDENCE = float(os.getenv("DOCUMENT_AI_MIN_CONFIDENCE", "0.75"))

app = FastAPI(title="Plasyect OCR Service")

IS_PRODUCTION = os.getenv("NODE_ENV", "").strip().lower() == "production"
PROD_DEFAULT_CORS_ORIGINS = ["https://plasyect.com", "https://www.plasyect.com"]
DEV_DEFAULT_CORS_ORIGINS = ["http://localhost:5173", "http://localhost:3000"]


def resolve_cors_settings() -> tuple[List[str], Optional[str]]:
    raw_origins = os.getenv("CORS_ORIGINS", "").strip()
    configured_origins = [
        o.strip() for o in raw_origins.split(",") if o.strip()
    ] if raw_origins else []

    if "*" in configured_origins:
        return ["*"], None

    base_origins = configured_origins or PROD_DEFAULT_CORS_ORIGINS
    if not IS_PRODUCTION:
        base_origins = [*base_origins, *DEV_DEFAULT_CORS_ORIGINS]

    merged: List[str] = []
    seen: set = set()
    for o in base_origins:
        if o not in seen:
            merged.append(o)
            seen.add(o)

    raw_regex = os.getenv("CORS_ORIGIN_REGEX", "").strip()
    return merged, raw_regex or None


allowed_origins, allow_origin_regex = resolve_cors_settings()
cors_opts: Dict[str, Any] = {
    "allow_origins": allowed_origins,
    "allow_credentials": "*" not in allowed_origins,
    "allow_methods": ["*"],
    "allow_headers": ["*"],
}
if allow_origin_regex and "*" not in allowed_origins:
    cors_opts["allow_origin_regex"] = allow_origin_regex

app.add_middleware(CORSMiddleware, **cors_opts)


# ─────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────

def get_db_conn():
    if not DATABASE_URL:
        raise HTTPException(status_code=500, detail="DATABASE_URL no configurado")
    import psycopg2
    return psycopg2.connect(DATABASE_URL)


def db_execute(query: str, params=None, fetch: str = "none"):
    conn = get_db_conn()
    try:
        cur = conn.cursor()
        cur.execute(query, params or ())
        if fetch == "one":
            row = cur.fetchone()
            cols = [d[0] for d in cur.description] if cur.description else []
            conn.commit()
            return dict(zip(cols, row)) if row else None
        if fetch == "all":
            rows = cur.fetchall()
            cols = [d[0] for d in cur.description] if cur.description else []
            conn.commit()
            return [dict(zip(cols, r)) for r in rows]
        conn.commit()
        return None
    finally:
        conn.close()


# ─────────────────────────────────────────────
# Vertex AI init
# ─────────────────────────────────────────────

def init_vertex() -> None:
    if not PROJECT_ID:
        raise HTTPException(status_code=500, detail="VERTEX_PROJECT_ID no configurado")
    vertexai.init(project=PROJECT_ID, location=LOCATION)


# ─────────────────────────────────────────────
# JSON utilities
# ─────────────────────────────────────────────

def extract_json_block(text: str) -> Any:
    cleaned = text.strip().replace("```json", "").replace("```", "").strip()
    match = re.search(r"(\{.*\}|\[.*\])", cleaned, re.DOTALL)
    if match:
        cleaned = match.group(1)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=502, detail=f"El modelo devolvió JSON inválido: {exc}")


def to_number(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        cleaned = value.replace("%", "").replace(",", ".").strip()
        if not cleaned:
            return None
        try:
            return float(cleaned)
        except ValueError:
            return None
    return None


def to_positive_int(value: Any, fallback: int = 1) -> int:
    try:
        parsed = int(float(value))
        return parsed if parsed > 0 else fallback
    except (TypeError, ValueError):
        return fallback


# ─────────────────────────────────────────────
# Image processing
# ─────────────────────────────────────────────

def _decode_image(contents: bytes) -> np.ndarray:
    arr = np.frombuffer(contents, dtype=np.uint8)
    img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("No se pudo decodificar la imagen")
    return img


def _encode_png(img_bgr: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", img_bgr)
    if not ok:
        raise ValueError("No se pudo codificar PNG")
    return buf.tobytes()


def _deskew(gray: np.ndarray) -> np.ndarray:
    blur = cv2.GaussianBlur(gray, (5, 5), 0)
    th = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(th > 0))
    if coords.size == 0:
        return gray
    angle = cv2.minAreaRect(coords)[-1]
    if angle < -45:
        angle = -(90 + angle)
    else:
        angle = -angle
    (h, w) = gray.shape[:2]
    matrix = cv2.getRotationMatrix2D((w // 2, h // 2), angle, 1.0)
    return cv2.warpAffine(gray, matrix, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)


def _enhance_for_handwriting(gray: np.ndarray) -> np.ndarray:
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    gray = cv2.fastNlMeansDenoising(gray, None, h=10, templateWindowSize=7, searchWindowSize=21)
    bw = cv2.adaptiveThreshold(
        gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, blockSize=31, C=10,
    )
    kernel = np.ones((2, 2), np.uint8)
    return cv2.morphologyEx(bw, cv2.MORPH_OPEN, kernel, iterations=1)


def preprocess_for_ocr(contents: bytes) -> tuple[bytes, str]:
    img = _decode_image(contents)
    try:
        pil = Image.open(io.BytesIO(contents)).convert("RGB")
        img = cv2.cvtColor(np.array(pil), cv2.COLOR_RGB2BGR)
    except Exception:
        pass
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = _deskew(gray)
    bw = _enhance_for_handwriting(gray)
    return _encode_png(cv2.cvtColor(bw, cv2.COLOR_GRAY2BGR)), "image/png"


def build_image_parts(contents: bytes, content_type: Optional[str], filename: Optional[str] = None) -> List[Part]:
    mime_type = content_type or "application/octet-stream"
    ext = os.path.splitext(filename or "")[1].lower()
    is_pdf = mime_type == "application/pdf" or ext == ".pdf"
    is_image = mime_type.startswith("image/") or ext in {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tif", ".tiff"}
    if is_pdf:
        rendered = render_pdf_parts(contents)
        raw = Part.from_data(contents, mime_type="application/pdf")
        return [*rendered, raw] if rendered else [raw]
    if not is_image:
        return [Part.from_data(contents, mime_type=mime_type)]
    try:
        processed_bytes, processed_mime = preprocess_for_ocr(contents)
        orig = Part.from_data(contents, mime_type=mime_type if mime_type.startswith("image/") else "image/jpeg")
        proc = Part.from_data(processed_bytes, mime_type=processed_mime)
        return [orig, proc]
    except Exception:
        return [Part.from_data(contents, mime_type="image/jpeg")]


def render_pdf_parts(contents: bytes, max_pages: int = 10) -> List[Part]:
    if pdfium is None:
        return []
    parts: List[Part] = []
    pdf = None
    try:
        try:
            pdf = pdfium.PdfDocument(io.BytesIO(contents))
        except Exception:
            pdf = pdfium.PdfDocument(contents)
        for page_index in range(min(len(pdf), max_pages)):
            page = pdf[page_index]
            try:
                bitmap = page.render(scale=2)
                buf = io.BytesIO()
                bitmap.to_pil().save(buf, format="PNG")
                parts.append(Part.from_data(buf.getvalue(), mime_type="image/png"))
            finally:
                getattr(page, "close", lambda: None)()
        return parts
    except Exception:
        return []
    finally:
        getattr(pdf, "close", lambda: None)() if pdf else None


def render_pdf_page_images(contents: bytes, max_pages: int = 10) -> List[np.ndarray]:
    if pdfium is None:
        return []
    images: List[np.ndarray] = []
    pdf = None
    try:
        try:
            pdf = pdfium.PdfDocument(io.BytesIO(contents))
        except Exception:
            pdf = pdfium.PdfDocument(contents)
        for page_index in range(min(len(pdf), max_pages)):
            page = pdf[page_index]
            try:
                pil_image = page.render(scale=2).to_pil().convert("RGB")
                images.append(cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR))
            finally:
                getattr(page, "close", lambda: None)()
        return images
    except Exception:
        return []
    finally:
        getattr(pdf, "close", lambda: None)() if pdf else None


def render_document_images(contents: bytes, content_type: Optional[str], filename: Optional[str] = None) -> List[np.ndarray]:
    mime = (content_type or "").lower()
    ext = os.path.splitext(filename or "")[1].lower()
    if mime == "application/pdf" or ext == ".pdf":
        return render_pdf_page_images(contents)
    try:
        return [_decode_image(contents)]
    except Exception:
        return []


def normalize_mapping(raw: Any) -> Optional[Dict[str, float]]:
    if not isinstance(raw, dict):
        return None
    try:
        x, y, w, h = float(raw.get("x", 0)), float(raw.get("y", 0)), float(raw.get("w", 0)), float(raw.get("h", 0))
    except (TypeError, ValueError):
        return None
    if w <= 0 or h <= 0:
        return None
    x = max(0.0, min(100.0, x))
    y = max(0.0, min(100.0, y))
    w = max(0.1, min(100.0 - x, w))
    h = max(0.1, min(100.0 - y, h))
    return {"x": round(x, 2), "y": round(y, 2), "w": round(w, 2), "h": round(h, 2)}


def crop_from_mapping(page_image: np.ndarray, mapping: Dict[str, Any], *, padding_ratio: float = 0.015) -> Optional[np.ndarray]:
    if page_image is None or page_image.size == 0:
        return None
    height, width = page_image.shape[:2]
    n = normalize_mapping(mapping)
    if not n:
        return None
    px, py = int(width * padding_ratio), int(height * padding_ratio)
    x1 = max(0, int((n["x"] / 100) * width) - px)
    y1 = max(0, int((n["y"] / 100) * height) - py)
    x2 = min(width, int(((n["x"] + n["w"]) / 100) * width) + px)
    y2 = min(height, int(((n["y"] + n["h"]) / 100) * height) + py)
    if x2 <= x1 or y2 <= y1:
        return None
    return page_image[y1:y2, x1:x2].copy()


def make_crop_sheet_part(crops: List[tuple[str, np.ndarray]], start_index: int) -> Optional[Part]:
    if not crops:
        return None
    sheet_width = 1600
    label_height = 34
    gap = 14
    margin = 20
    rows: List[np.ndarray] = []
    font = cv2.FONT_HERSHEY_SIMPLEX
    for offset, (field_id, crop) in enumerate(crops):
        if crop is None or crop.size == 0:
            continue
        ch, cw = crop.shape[:2]
        scale = min(1.0, (sheet_width - margin * 2) / max(1, cw))
        resized = cv2.resize(crop, (max(1, int(cw * scale)), max(1, int(ch * scale))), interpolation=cv2.INTER_AREA)
        row = np.full((label_height + resized.shape[0] + gap, sheet_width, 3), 255, dtype=np.uint8)
        cv2.putText(row, f"{start_index + offset}. field_id={field_id}"[:120], (margin, 24), font, 0.7, (0, 0, 0), 2, cv2.LINE_AA)
        row[label_height:label_height + resized.shape[0], margin:margin + resized.shape[1]] = resized
        rows.append(row)
    if not rows:
        return None
    sheet = np.vstack(rows)
    ok, buf = cv2.imencode(".png", sheet)
    return Part.from_data(buf.tobytes(), mime_type="image/png") if ok else None


def build_mapping_crop_parts(
    contents: bytes,
    content_type: Optional[str],
    filename: Optional[str],
    fields: List[Dict[str, Any]],
    tables: List[Dict[str, Any]],
    *,
    max_crops: int = 80,
    crops_per_sheet: int = 12,
) -> List[Part]:
    capture_fields = [
        f for f in _iter_capture_fields(fields, tables)
        if f.get("id") and normalize_mapping(f.get("mapping"))
    ][:max_crops]
    if not capture_fields:
        return []
    images = render_document_images(contents, content_type, filename)
    if not images:
        return []
    crops: List[tuple[str, np.ndarray]] = []
    for field in capture_fields:
        page_index = min(max(to_positive_int(field.get("pageNumber")) - 1, 0), len(images) - 1)
        crop = crop_from_mapping(images[page_index], field.get("mapping") or {})
        if crop is not None:
            crops.append((str(field["id"]), crop))
    parts: List[Part] = []
    for start in range(0, len(crops), crops_per_sheet):
        part = make_crop_sheet_part(crops[start:start + crops_per_sheet], start + 1)
        if part:
            parts.append(part)
    return parts


def _iter_capture_fields(fields: List[Dict[str, Any]], tables: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    result = list(fields)
    for table in tables:
        if isinstance(table, dict):
            result.extend(table.get("columns") or [])
    return result


# ─────────────────────────────────────────────
# Document AI
# ─────────────────────────────────────────────

def process_document_ai(contents: bytes, content_type: Optional[str]) -> Optional[Dict[str, Any]]:
    if not DOC_AI_PROCESSOR_ID or not DOC_AI_PROJECT_ID:
        return None
    client = documentai.DocumentProcessorServiceClient()
    name = (
        client.processor_version_path(DOC_AI_PROJECT_ID, DOC_AI_LOCATION, DOC_AI_PROCESSOR_ID, DOC_AI_PROCESSOR_VERSION)
        if DOC_AI_PROCESSOR_VERSION
        else client.processor_path(DOC_AI_PROJECT_ID, DOC_AI_LOCATION, DOC_AI_PROCESSOR_ID)
    )
    result = client.process_document(request=documentai.ProcessRequest(
        name=name,
        raw_document=documentai.RawDocument(content=contents, mime_type=content_type or "application/pdf"),
    ))
    doc = result.document
    if not doc or not doc.text:
        return {"text": "", "fields": [], "low_confidence": []}
    fields: List[Dict[str, Any]] = []
    low_confidence: List[Dict[str, Any]] = []
    for page_idx, page in enumerate(doc.pages):
        for field in page.form_fields:
            def anchor_text(anchor):
                return "".join(
                    doc.text[int(seg.start_index or 0):int(seg.end_index or 0)]
                    for seg in anchor.text_segments
                ).strip()
            item = {
                "label": anchor_text(field.field_name.text_anchor),
                "value": anchor_text(field.field_value.text_anchor),
                "label_confidence": float(field.field_name.confidence or 0.0),
                "value_confidence": float(field.field_value.confidence or 0.0),
                "pageNumber": page_idx + 1,
            }
            fields.append(item)
            if item["value_confidence"] < DOC_AI_MIN_CONFIDENCE:
                low_confidence.append(item)
    return {"text": doc.text, "fields": fields, "low_confidence": low_confidence, "min_confidence": DOC_AI_MIN_CONFIDENCE}


# ─────────────────────────────────────────────
# Template schema (reused from MIA)
# ─────────────────────────────────────────────

def normalize_identifier(value: str, fallback: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", value.lower()).strip("_") or fallback


def make_field(field_id: str, label: str, field_type: str = "string", *, page_number: int = 1, mapping: Optional[Dict] = None, validation_rules: Optional[Dict] = None) -> Dict[str, Any]:
    field: Dict[str, Any] = {
        "id": normalize_identifier(field_id, "field"),
        "label": label,
        "pageNumber": to_positive_int(page_number),
        "type": field_type if field_type in {"number", "string", "boolean", "date"} else "string",
        "validation_rules": validation_rules or {"min": None, "max": None, "unit": None},
    }
    m = normalize_mapping(mapping)
    if m:
        field["mapping"] = m
    return field


def infer_field_type(label: str) -> str:
    upper = label.upper()
    if "FECHA" in upper:
        return "date"
    if any(t in upper for t in ["CANT", "TOTAL", "%"]):
        return "number"
    return "string"


def normalize_template_field(field: Any) -> Optional[Dict[str, Any]]:
    if not isinstance(field, dict) or not field.get("id"):
        return None
    validation = field.get("validation_rules") or {}
    normalized: Dict[str, Any] = {
        "id": str(field["id"]),
        "label": field.get("label"),
        "type": field.get("type") or "string",
        "pageNumber": to_positive_int(field.get("pageNumber") or field.get("page") or 1),
        "validation_rules": {
            "min": to_number(validation.get("min")),
            "max": to_number(validation.get("max")),
            "unit": validation.get("unit"),
        },
    }
    m = normalize_mapping(field.get("mapping") or field.get("box"))
    if m:
        normalized["mapping"] = m
    return normalized


def normalize_template_schema(raw: Any) -> Dict[str, Any]:
    if isinstance(raw, dict):
        raw_fields = raw.get("fields")
        raw_tables = raw.get("tables")
    else:
        raw_fields = raw
        raw_tables = None

    fields: List[Dict[str, Any]] = []
    if isinstance(raw_fields, list):
        for f in raw_fields:
            nf = normalize_template_field(f)
            if nf:
                fields.append(nf)

    tables: List[Dict[str, Any]] = []
    if isinstance(raw_tables, list):
        for t in raw_tables:
            if not isinstance(t, dict) or not t.get("id"):
                continue
            cols = [normalize_template_field(c) for c in (t.get("columns") or []) if normalize_template_field(c)]
            tables.append({"id": str(t["id"]), "label": t.get("label"), "columns": cols})

    return {"fields": fields, "tables": tables}


def build_template_prompt(docai_payload: Optional[Dict], local_text: str = "", *, retry: bool = False) -> str:
    prompt = (
        "Analiza este formulario o formato operativo de Plasyect, aunque este escaneado o rellenado a mano. "
        "Genera un esquema JSON para digitalizarlo. "
        "Identifica las etiquetas preimpresas del formato, no los valores manuscritos. "
        "El label de cada campo debe ser el nombre real impreso en la hoja. "
        "Por cada campo identifica: id, label, pageNumber, type (number|string|boolean|date), mapping y validation_rules {min,max,unit}. "
        "mapping debe ser un recuadro porcentual {x,y,w,h} relativo a la pagina donde aparece el valor. "
        "Si hay tablas con filas repetibles, incluye una lista tables con id, label y columns. "
        "Devuelve solo JSON con un objeto {fields:[...], tables:[...]}."
    )
    if retry:
        prompt += " Si no detectas campos, crea campos de texto genericos por seccion visible con mapping aproximado."
    if docai_payload:
        prompt += f"\n\nOCR (Document AI):\nTexto:\n{str(docai_payload.get('text') or '')[:5000]}\nCampos: {json.dumps(docai_payload.get('fields', [])[:80], ensure_ascii=False)}"
    if local_text.strip():
        prompt += f"\n\nTexto extraido localmente:\n{local_text[:5000]}"
    return prompt


def request_template_schema(model: GenerativeModel, parts: List[Part], prompt: str) -> Dict[str, Any]:
    response = model.generate_content(
        [*parts, prompt],
        generation_config=vertexai.generative_models.GenerationConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {
                    "fields": {"type": "ARRAY", "items": {"type": "OBJECT"}},
                    "tables": {"type": "ARRAY", "items": {"type": "OBJECT"}},
                },
                "required": ["fields", "tables"],
            },
        ),
    )
    try:
        raw = json.loads(response.text or "{}")
    except Exception:
        raw = extract_json_block(response.text or "{}")
    return normalize_template_schema(raw)


def extract_pdf_text_locally(contents: bytes, max_pages: int = 10) -> str:
    if PdfReader is None:
        return ""
    try:
        reader = PdfReader(io.BytesIO(contents))
        parts = [p.extract_text() or "" for p in reader.pages[:max_pages]]
        return "\n".join(t for t in parts if t.strip()).strip()
    except Exception:
        return ""


# ─────────────────────────────────────────────
# Data extraction helpers
# ─────────────────────────────────────────────

def validate_extracted(fields: List[Dict], data: Dict, tables: List[Dict], tables_data: Dict) -> List[str]:
    alerts: List[str] = []
    for field in fields:
        if field.get("type") != "number":
            continue
        fid = field.get("id")
        if not fid:
            continue
        value = to_number(data.get(fid))
        if value is None:
            continue
        rules = field.get("validation_rules") or {}
        min_v, max_v = to_number(rules.get("min")), to_number(rules.get("max"))
        label = field.get("label") or fid
        unit = rules.get("unit") or ""
        u = f" {unit}" if unit else ""
        if min_v is not None and value < min_v:
            alerts.append(f"{label}: {value}{u} menor al mínimo {min_v}{u}")
        if max_v is not None and value > max_v:
            alerts.append(f"{label}: {value}{u} mayor al máximo {max_v}{u}")
    return alerts


def normalize_extraction_output(raw: Any, fields: List[Dict], tables: List[Dict]) -> Dict[str, Any]:
    data: Dict[str, Any] = {}
    tables_data: Dict[str, Any] = {}
    field_ids = {str(f.get("id")) for f in fields if f.get("id")}

    if isinstance(raw, dict):
        raw_tables = raw.get("tables")
        if isinstance(raw_tables, dict):
            tables_data = raw_tables
        raw_data = raw.get("data") or raw.get("fields")
        if isinstance(raw_data, dict):
            data = raw_data
        elif not data and any(str(k) in field_ids for k in raw.keys()):
            data = raw
    return {"data": data, "tables": tables_data, "notes": []}


def build_extraction_prompt(fields: List[Dict], tables: List[Dict], docai_payload: Optional[Dict] = None) -> str:
    prompt = (
        "Extrae los datos de este formulario rellenado a mano basandote en el esquema JSON. "
        "Usa pageNumber y mapping de cada campo para localizar el valor en la pagina correcta. "
        "Si recibes imagenes de recortes, usa el field_id visible arriba de cada recorte para identificar el campo. "
        "Devuelve SOLO JSON valido con data (valores por id de fields) y tables (tabla -> lista de filas). "
        "Usa null si el valor no es legible o esta vacio. No incluyas markdown ni texto extra."
        f"\n\nEsquema:\n{json.dumps({'fields': fields, 'tables': tables}, ensure_ascii=True)}"
    )
    if docai_payload:
        prompt += (
            f"\n\nOCR (Document AI):\nTexto: {str(docai_payload.get('text') or '')[:4000]}\n"
            f"Campos: {json.dumps(docai_payload.get('fields', [])[:50], ensure_ascii=True)}"
        )
    prompt += '\nEjemplo: {"data":{"campo_1":"valor"},"tables":{"tabla_1":[{"col_1":"a"}]}}'
    return prompt


# ─────────────────────────────────────────────
# Health
# ─────────────────────────────────────────────

@app.get("/health")
def health():
    return {"ok": True, "service": "plasyect-ocr-service", "time": datetime.utcnow().isoformat()}


# ─────────────────────────────────────────────
# Letter types (tipos de carta)
# ─────────────────────────────────────────────

@app.get("/letras/tipos")
def list_letter_types():
    rows = db_execute(
        "SELECT id, nombre, descripcion, schema, activo, creado_en, actualizado_en FROM ocr_letra_tipos WHERE activo = TRUE ORDER BY nombre",
        fetch="all",
    )
    return {"tipos": rows or []}


@app.get("/letras/tipos/{tipo_id}")
def get_letter_type(tipo_id: str):
    row = db_execute(
        "SELECT id, nombre, descripcion, schema, activo, creado_en, actualizado_en FROM ocr_letra_tipos WHERE id = %s",
        (tipo_id,),
        fetch="one",
    )
    if not row:
        raise HTTPException(status_code=404, detail="Tipo de letra no encontrado")
    return row


@app.post("/letras/tipos")
def create_letter_type(body: Dict[str, Any]):
    nombre = (body.get("nombre") or "").strip()
    if not nombre:
        raise HTTPException(status_code=400, detail="nombre es requerido")
    tipo_id = normalize_identifier(nombre, f"tipo_{uuid.uuid4().hex[:8]}")
    descripcion = (body.get("descripcion") or "").strip() or None
    schema = body.get("schema") or {"fields": [], "tables": []}
    now = datetime.utcnow()
    existing = db_execute("SELECT id FROM ocr_letra_tipos WHERE id = %s", (tipo_id,), fetch="one")
    if existing:
        tipo_id = f"{tipo_id}_{uuid.uuid4().hex[:6]}"
    db_execute(
        "INSERT INTO ocr_letra_tipos (id, nombre, descripcion, schema, activo, creado_en, actualizado_en) VALUES (%s, %s, %s, %s, TRUE, %s, %s)",
        (tipo_id, nombre, descripcion, json.dumps(schema), now, now),
    )
    return get_letter_type(tipo_id)


@app.put("/letras/tipos/{tipo_id}")
def update_letter_type(tipo_id: str, body: Dict[str, Any]):
    row = db_execute("SELECT id FROM ocr_letra_tipos WHERE id = %s", (tipo_id,), fetch="one")
    if not row:
        raise HTTPException(status_code=404, detail="Tipo de letra no encontrado")
    updates: List[str] = []
    params: List[Any] = []
    if "nombre" in body:
        updates.append("nombre = %s")
        params.append(body["nombre"])
    if "descripcion" in body:
        updates.append("descripcion = %s")
        params.append(body["descripcion"])
    if "schema" in body:
        updates.append("schema = %s")
        params.append(json.dumps(body["schema"]))
    if "activo" in body:
        updates.append("activo = %s")
        params.append(bool(body["activo"]))
    if not updates:
        return get_letter_type(tipo_id)
    updates.append("actualizado_en = %s")
    params.append(datetime.utcnow())
    params.append(tipo_id)
    db_execute(f"UPDATE ocr_letra_tipos SET {', '.join(updates)} WHERE id = %s", params)
    return get_letter_type(tipo_id)


@app.post("/letras/tipos/desde-archivo")
def generate_letter_type_from_file(file: UploadFile = File(...), nombre: str = Form(...)):
    """Genera automáticamente el schema de un tipo de letra a partir de un archivo muestra."""
    if not file:
        raise HTTPException(status_code=400, detail="file es requerido")
    contents = file.file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="file está vacío")

    docai_payload = None
    try:
        docai_payload = process_document_ai(contents, file.content_type)
    except Exception:
        pass

    local_text = ""
    if (file.content_type or "").lower() == "application/pdf" or (file.filename or "").lower().endswith(".pdf"):
        local_text = extract_pdf_text_locally(contents)

    image_parts = build_image_parts(contents, file.content_type, file.filename)
    init_vertex()
    model = GenerativeModel(TEMPLATE_MODEL)

    schema: Dict[str, Any] = {"fields": [], "tables": []}
    for retry in (False, True):
        try:
            schema = request_template_schema(model, image_parts, build_template_prompt(docai_payload, local_text, retry=retry))
            if schema["fields"] or schema["tables"]:
                break
        except Exception:
            pass

    tipo_id = normalize_identifier(nombre, f"tipo_{uuid.uuid4().hex[:8]}")
    now = datetime.utcnow()
    existing = db_execute("SELECT id FROM ocr_letra_tipos WHERE id = %s", (tipo_id,), fetch="one")
    if existing:
        tipo_id = f"{tipo_id}_{uuid.uuid4().hex[:6]}"

    db_execute(
        "INSERT INTO ocr_letra_tipos (id, nombre, descripcion, schema, activo, creado_en, actualizado_en) VALUES (%s, %s, %s, %s, TRUE, %s, %s)",
        (tipo_id, nombre.strip(), None, json.dumps(schema), now, now),
    )
    return get_letter_type(tipo_id)


# ─────────────────────────────────────────────
# Responsables
# ─────────────────────────────────────────────

@app.get("/responsables")
def list_responsables(letra_tipo_id: Optional[str] = None, area: Optional[str] = None, turno: Optional[str] = None):
    conditions = []
    params: List[Any] = []
    if letra_tipo_id:
        conditions.append("letra_tipo_id = %s")
        params.append(letra_tipo_id)
    if area:
        conditions.append("(area = %s OR area = '*')")
        params.append(area)
    if turno:
        conditions.append("(turno = %s OR turno = '*')")
        params.append(turno)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = db_execute(
        f"SELECT id, letra_tipo_id, area, turno, nombre, email, notificar FROM ocr_responsables {where} ORDER BY area, turno, nombre",
        params,
        fetch="all",
    )
    return {"responsables": rows or []}


@app.post("/responsables")
def create_responsable(body: Dict[str, Any]):
    required = ["letra_tipo_id", "area", "nombre"]
    for f in required:
        if not body.get(f):
            raise HTTPException(status_code=400, detail=f"{f} es requerido")
    row = db_execute(
        "INSERT INTO ocr_responsables (letra_tipo_id, area, turno, nombre, email, notificar) VALUES (%s, %s, %s, %s, %s, %s) RETURNING id, letra_tipo_id, area, turno, nombre, email, notificar",
        (body["letra_tipo_id"], body["area"], body.get("turno") or "*", body["nombre"], body.get("email"), body.get("notificar", True)),
        fetch="one",
    )
    return row


@app.put("/responsables/{resp_id}")
def update_responsable(resp_id: int, body: Dict[str, Any]):
    updates: List[str] = []
    params: List[Any] = []
    for field in ["area", "turno", "nombre", "email", "notificar"]:
        if field in body:
            updates.append(f"{field} = %s")
            params.append(body[field])
    if not updates:
        raise HTTPException(status_code=400, detail="Nada que actualizar")
    params.append(resp_id)
    db_execute(f"UPDATE ocr_responsables SET {', '.join(updates)} WHERE id = %s", params)
    row = db_execute("SELECT id, letra_tipo_id, area, turno, nombre, email, notificar FROM ocr_responsables WHERE id = %s", (resp_id,), fetch="one")
    if not row:
        raise HTTPException(status_code=404, detail="Responsable no encontrado")
    return row


@app.delete("/responsables/{resp_id}")
def delete_responsable(resp_id: int):
    db_execute("DELETE FROM ocr_responsables WHERE id = %s", (resp_id,))
    return {"ok": True}


# ─────────────────────────────────────────────
# Reports (reportes)
# ─────────────────────────────────────────────

def _get_responsables_for_report(letra_tipo_id: str, area: str, turno: str) -> List[Dict[str, Any]]:
    """Returns responsables matching the letter type + area + turn (including wildcards)."""
    rows = db_execute(
        """
        SELECT id, letra_tipo_id, area, turno, nombre, email, notificar
        FROM ocr_responsables
        WHERE letra_tipo_id = %s
          AND (area = %s OR area = '*')
          AND (turno = %s OR turno = '*')
          AND notificar = TRUE
        """,
        (letra_tipo_id, area, turno),
        fetch="all",
    )
    return rows or []


@app.get("/reportes")
def list_reports(letra_tipo_id: Optional[str] = None, estado: Optional[str] = None, limit: int = 50, offset: int = 0):
    conditions = []
    params: List[Any] = []
    if letra_tipo_id:
        conditions.append("r.letra_tipo_id = %s")
        params.append(letra_tipo_id)
    if estado:
        conditions.append("r.estado = %s")
        params.append(estado)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.extend([limit, offset])
    rows = db_execute(
        f"""
        SELECT r.id, r.letra_tipo_id, lt.nombre as letra_tipo_nombre,
               r.nombre_archivo, r.fecha_carga, r.usuario_carga,
               r.estado, r.confianza_promedio, r.alertas, r.aprobador,
               r.fecha_aprobacion, r.notas, r.creado_en, r.actualizado_en
        FROM ocr_reportes r
        LEFT JOIN ocr_letra_tipos lt ON lt.id = r.letra_tipo_id
        {where}
        ORDER BY r.creado_en DESC
        LIMIT %s OFFSET %s
        """,
        params,
        fetch="all",
    )
    return {"reportes": rows or []}


@app.get("/reportes/{reporte_id}")
def get_report(reporte_id: str):
    row = db_execute(
        """
        SELECT r.*, lt.nombre as letra_tipo_nombre, lt.schema as letra_tipo_schema
        FROM ocr_reportes r
        LEFT JOIN ocr_letra_tipos lt ON lt.id = r.letra_tipo_id
        WHERE r.id = %s
        """,
        (reporte_id,),
        fetch="one",
    )
    if not row:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")
    return row


@app.post("/reportes")
def create_report(
    file: UploadFile = File(...),
    letra_tipo_id: str = Form(...),
    usuario_carga: str = Form(""),
    area: str = Form(""),
    turno: str = Form(""),
):
    """Sube un archivo, extrae datos y crea un reporte en la DB."""
    if not file:
        raise HTTPException(status_code=400, detail="file es requerido")
    contents = file.file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="file está vacío")

    tipo_row = db_execute("SELECT id, schema FROM ocr_letra_tipos WHERE id = %s", (letra_tipo_id,), fetch="one")
    if not tipo_row:
        raise HTTPException(status_code=404, detail=f"Tipo de letra '{letra_tipo_id}' no encontrado")

    schema = normalize_template_schema(tipo_row.get("schema") or {})
    fields = schema["fields"]
    tables = schema["tables"]

    docai_payload = None
    docai_error = None
    try:
        docai_payload = process_document_ai(contents, file.content_type)
    except Exception as exc:
        docai_error = str(exc)

    init_vertex()
    model = GenerativeModel(EXTRACTION_MODEL)
    prompt = build_extraction_prompt(fields, tables, docai_payload)
    crop_parts = build_mapping_crop_parts(contents, file.content_type, file.filename, fields, tables)
    image_parts = build_image_parts(contents, file.content_type, file.filename)

    response = model.generate_content(
        [*crop_parts, *image_parts, prompt],
        generation_config=vertexai.generative_models.GenerationConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "OBJECT",
                "properties": {"data": {"type": "OBJECT"}, "tables": {"type": "OBJECT"}},
                "required": ["data", "tables"],
            },
        ),
    )

    try:
        raw = json.loads(response.text or "{}")
    except Exception:
        raw = extract_json_block(response.text or "{}")

    normalized = normalize_extraction_output(raw, fields, tables)
    data = normalized.get("data") or {}
    tables_data = normalized.get("tables") or {}
    alerts = validate_extracted(fields, data, tables, tables_data)

    report_area = area or str(data.get("area") or "")
    report_turno = turno or str(data.get("turno") or "")
    responsables = []
    if report_area and report_turno:
        responsables = _get_responsables_for_report(letra_tipo_id, report_area, report_turno)

    conf_values = [
        v.get("value_confidence", 1.0)
        for v in (docai_payload.get("fields") or []) if isinstance(v, dict)
    ] if docai_payload else []
    confianza = round(sum(conf_values) / len(conf_values) * 100, 1) if conf_values else None

    reporte_id = f"ocr_{uuid.uuid4().hex[:20]}"
    now = datetime.utcnow()
    db_execute(
        """
        INSERT INTO ocr_reportes (id, letra_tipo_id, nombre_archivo, tipo_mime, fecha_carga, usuario_carga,
            estado, datos_extraidos, confianza_promedio, alertas, ocr_raw, creado_en, actualizado_en)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            reporte_id, letra_tipo_id, file.filename, file.content_type, now, usuario_carga or None,
            "ocr_completado",
            json.dumps({"data": data, "tables": tables_data}),
            confianza, alerts,
            json.dumps(docai_payload or {}),
            now, now,
        ),
    )

    return {
        "reporte_id": reporte_id,
        "estado": "ocr_completado",
        "data": data,
        "tables": tables_data,
        "alerts": alerts,
        "confianza_promedio": confianza,
        "responsables_notificados": responsables,
        "ocr_error": docai_error,
    }


@app.post("/reportes/stream")
async def create_report_stream(
    file: UploadFile = File(...),
    letra_tipo_id: str = Form(...),
    usuario_carga: str = Form(""),
    area: str = Form(""),
    turno: str = Form(""),
):
    """Versión SSE de create_report — emite progreso mientras el modelo genera."""
    if not file:
        raise HTTPException(status_code=400, detail="file es requerido")
    contents = await file.read()
    if not contents:
        raise HTTPException(status_code=400, detail="file está vacío")

    tipo_row = db_execute("SELECT id, schema FROM ocr_letra_tipos WHERE id = %s", (letra_tipo_id,), fetch="one")
    if not tipo_row:
        raise HTTPException(status_code=404, detail=f"Tipo de letra '{letra_tipo_id}' no encontrado")

    schema = normalize_template_schema(tipo_row.get("schema") or {})
    fields = schema["fields"]
    tables = schema["tables"]

    docai_payload = None
    docai_error = None
    try:
        docai_payload = process_document_ai(contents, file.content_type)
    except Exception as exc:
        docai_error = str(exc)

    init_vertex()
    model = GenerativeModel(EXTRACTION_MODEL)
    prompt = build_extraction_prompt(fields, tables, docai_payload)
    crop_parts = build_mapping_crop_parts(contents, file.content_type, file.filename, fields, tables)
    image_parts = build_image_parts(contents, file.content_type, file.filename)

    response_stream = model.generate_content([*crop_parts, *image_parts, prompt], stream=True)

    filename_snap = file.filename
    content_type_snap = file.content_type

    async def event_generator():
        initial = {"type": "progress", "message": "Procesando imagen con IA...", "docai_error": docai_error}
        if docai_payload:
            initial["ocr"] = {"min_confidence": docai_payload.get("min_confidence"), "low_confidence": docai_payload.get("low_confidence", [])}
        yield f"data: {json.dumps(initial)}\n\n"

        full_text = ""
        for chunk in response_stream:
            if chunk.text:
                full_text += chunk.text
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk.text})}\n\n"
            await asyncio.sleep(0)

        raw = extract_json_block(full_text)
        normalized = normalize_extraction_output(raw, fields, tables)
        data = normalized.get("data") or {}
        tables_data = normalized.get("tables") or {}
        alerts = validate_extracted(fields, data, tables, tables_data)

        report_area = area or str(data.get("area") or "")
        report_turno = turno or str(data.get("turno") or "")
        responsables = []
        if report_area and report_turno:
            responsables = _get_responsables_for_report(letra_tipo_id, report_area, report_turno)

        conf_values = [
            v.get("value_confidence", 1.0)
            for v in (docai_payload.get("fields") or []) if isinstance(v, dict)
        ] if docai_payload else []
        confianza = round(sum(conf_values) / len(conf_values) * 100, 1) if conf_values else None

        reporte_id = f"ocr_{uuid.uuid4().hex[:20]}"
        now = datetime.utcnow()
        try:
            db_execute(
                """
                INSERT INTO ocr_reportes (id, letra_tipo_id, nombre_archivo, tipo_mime, fecha_carga, usuario_carga,
                    estado, datos_extraidos, confianza_promedio, alertas, ocr_raw, creado_en, actualizado_en)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                """,
                (
                    reporte_id, letra_tipo_id, filename_snap, content_type_snap, now, usuario_carga or None,
                    "ocr_completado",
                    json.dumps({"data": data, "tables": tables_data}),
                    confianza, alerts,
                    json.dumps(docai_payload or {}),
                    now, now,
                ),
            )
        except Exception as db_exc:
            alerts.append(f"Advertencia: no se pudo guardar el reporte en la base de datos ({db_exc})")

        final = {
            "type": "done",
            "reporte_id": reporte_id,
            "estado": "ocr_completado",
            "data": data,
            "tables": tables_data,
            "alerts": alerts,
            "confianza_promedio": confianza,
            "responsables_notificados": responsables,
        }
        if docai_payload:
            final["ocr"] = {"min_confidence": docai_payload.get("min_confidence"), "low_confidence": docai_payload.get("low_confidence", [])}
        yield f"data: {json.dumps(final)}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.put("/reportes/{reporte_id}")
def update_report(reporte_id: str, body: Dict[str, Any]):
    """Guarda correcciones manuales de un reporte."""
    row = db_execute("SELECT id, estado FROM ocr_reportes WHERE id = %s", (reporte_id,), fetch="one")
    if not row:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    updates: List[str] = []
    params: List[Any] = []
    if "datos_corregidos" in body:
        updates.append("datos_corregidos = %s")
        params.append(json.dumps(body["datos_corregidos"]))
    if "notas" in body:
        updates.append("notas = %s")
        params.append(body["notas"])
    if not updates:
        return get_report(reporte_id)
    updates.append("actualizado_en = %s")
    params.append(datetime.utcnow())
    params.append(reporte_id)
    db_execute(f"UPDATE ocr_reportes SET {', '.join(updates)} WHERE id = %s", params)
    return get_report(reporte_id)


VALID_ESTADO_TRANSITIONS: Dict[str, List[str]] = {
    "pendiente_ocr": ["ocr_completado"],
    "ocr_completado": ["en_validacion", "rechazado"],
    "en_validacion": ["aprobado", "rechazado", "correccion_requerida"],
    "correccion_requerida": ["en_validacion", "rechazado"],
    "aprobado": [],
    "rechazado": [],
}


@app.post("/reportes/{reporte_id}/estado")
def transition_report_state(reporte_id: str, body: Dict[str, Any]):
    """Transiciona el estado de un reporte: en_validacion, aprobado, rechazado, correccion_requerida."""
    nuevo_estado = (body.get("estado") or "").strip()
    if not nuevo_estado:
        raise HTTPException(status_code=400, detail="estado es requerido")

    row = db_execute(
        "SELECT id, estado, letra_tipo_id, datos_extraidos FROM ocr_reportes WHERE id = %s",
        (reporte_id,),
        fetch="one",
    )
    if not row:
        raise HTTPException(status_code=404, detail="Reporte no encontrado")

    estado_actual = row["estado"]
    valid_next = VALID_ESTADO_TRANSITIONS.get(estado_actual, [])
    if nuevo_estado not in valid_next:
        raise HTTPException(
            status_code=400,
            detail=f"Transición inválida: '{estado_actual}' → '{nuevo_estado}'. Permitidos: {valid_next}",
        )

    params_update: List[Any] = [nuevo_estado, datetime.utcnow()]
    extra_sql = ""
    if nuevo_estado == "aprobado":
        aprobador = body.get("aprobador") or body.get("usuario") or ""
        extra_sql = ", aprobador = %s, fecha_aprobacion = %s"
        params_update.extend([aprobador, datetime.utcnow()])
    if body.get("notas"):
        extra_sql += ", notas = %s"
        params_update.append(body["notas"])
    params_update.append(reporte_id)

    db_execute(
        f"UPDATE ocr_reportes SET estado = %s, actualizado_en = %s{extra_sql} WHERE id = %s",
        params_update,
    )

    responsables: List[Dict[str, Any]] = []
    if nuevo_estado in ("aprobado", "correccion_requerida", "rechazado"):
        datos = row.get("datos_extraidos") or {}
        data = datos.get("data") or {}
        r_area = str(data.get("area") or "")
        r_turno = str(data.get("turno") or "")
        if r_area and r_turno and row.get("letra_tipo_id"):
            responsables = _get_responsables_for_report(row["letra_tipo_id"], r_area, r_turno)

    return {
        "ok": True,
        "reporte_id": reporte_id,
        "estado_anterior": estado_actual,
        "estado_nuevo": nuevo_estado,
        "responsables_notificados": responsables,
    }
