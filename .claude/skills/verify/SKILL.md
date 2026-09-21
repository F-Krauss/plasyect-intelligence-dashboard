---
name: verify
description: Recipe to build, launch, and drive this dashboard for runtime verification (frontend + backend + data checks).
---

# Verificación runtime del dashboard

## Levantar servidores
Usar `.claude/launch.json` (preview_start): `frontend` (:3000, Vite) y `backend` (:8080, tsx watch).
El backend lee `backend/.env` (DATABASE_URL → pg local :55432, GEMINI_API_KEY para /api/ai/chat).

## Autenticación API
```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/auto | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")
```
Todas las rutas `/api/*` (excepto auth/auto) requieren `Authorization: Bearer $TOKEN`.

## Endpoints clave
- `GET /api/erp/operativo?fechaInicio=YYYY-MM-DD&fechaFin=YYYY-MM-DD` — stagePipeline, lotePipeline, wipSummary. Fechas son obligatorias.
- `GET /api/erp/ejecutivo?fechaInicio=...&fechaFin=...`
- `GET /api/erp/sync/status` — última corrida del sync (corre cada ~15 min contra el pg local).
- `POST /api/ai/chat` `{message, history}` — 503 con `ai_disabled` si falta GEMINI_API_KEY.

## Invariantes de consistencia (razón de ser del dashboard)
- lotePipeline agregado por stage == stagePipeline (lotes y pares) para etapas de piso.
- `alta_pedido` SOLO existe en stagePipeline (backlog de bigzap_programacion_renglones, sin lote aún); wipSummary lo excluye.
- Ejecutivo "Lotes/Pares en planta" == Pipeline por Lote KPIs == wipSummary.
- Embarque "Pares Listos" == pares del stage embarque.

## Chequeo de datos
```bash
cd sync-service && npx tsx scripts/verify-data.ts   # imprime tablas; sin npm alias
```

## Gotchas
- La UI usa transiciones (motion): tras click en sidebar esperar ~3-5 s antes del screenshot ("CARGANDO <vista>").
- Los botones del sidebar salen sin label en el árbol de accesibilidad; el orden sigue el sidebar (ref_2 = Dashboard Ejecutivo, etc.).
- El widget AsistenteIA es el botón flotante inferior-derecha ("Abrir asistente IA").
- Para probar el middleware de encoding: POST /api/audits con `{id, tenantId:"plasyect_matriz", ...texto con mojibake}` y borrar la fila de `audit_logs` después.
