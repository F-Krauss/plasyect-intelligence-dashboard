# Reporte FDB por modulo: KPIs, graficas y tablas

Fecha de revision: 2026-06-16

Alcance:
- Se reviso el dashboard por modulo en `src/views/ViewRegistry.tsx`, `src/components/ocr/OCRValidation.tsx`, `src/api/dashboardApi.ts` y `backend/src/erp.ts`.
- Se cruza contra los datos sincronizados en `bigzap_*` y los campos vistos en la FDB del reporte anterior de modelos/productos.
- "En FDB no sincronizado" significa que el dato existe o hay un campo candidato en BIGZAP.FDB, pero hoy no llega al shape que consume el modulo.

## Resumen rapido

| Modulo | Datos FDB usados hoy | Brecha principal |
| --- | --- | --- |
| Dashboard ejecutivo | Si: `erpOperativo` completo | Calidad/defectos reales casi no existen en mirror; varios status son derivados. |
| Pipeline por lote | Si: `tarjetas_viajeras`, `bigzap_lotes`, `bigzap_avance` | Responsable, operador, observaciones, bloqueos y defectos no vienen reales. |
| Pipeline por pedido | Si: `orderPipeline` | Valores comerciales, transporte, descuentos y desglose fino de talla/pedido no llegan. |
| Produccion por area | Si: `productionHourly` | Metas, operador, maquina/banda y defectos son locales, derivados o vacios. |
| Modelos y productos | Si: `models` | Campos tecnicos de estilo/producto, defectos y tallas reales no estan completos. |
| Calidad | No: local/manual | Necesita inspeccion, defecto, inspector, talla, maquina/banda; FDB no da calidad util hoy. |
| Inyeccion | No: local/manual | Falta maquina, molde, turno real, defecto y operador; FDB solo ayuda con lotes/depto 15. |
| Banda | No: local/manual | Falta banda real, inspector, defectos y acciones; FDB solo ayuda con lotes/deptos de banda. |
| Aduana/liberacion | No: local/manual | FDB ayuda con lote/pedido/tallas, pero validaciones y firmas son manuales. |
| Embarque | No en UI, aunque mirror tiene PTMOV | UI no usa `bigzap_pt_movimientos`; faltan transporte, documentos y tallas embarcadas. |
| OCR validacion | No FDB; usa servicio OCR | Depende de schemas OCR y servicio externo; no cruza con FDB. |
| Reportes historicos | Parcial: produccion/movimientos FDB | Auditoria y archivo son locales; movimientos limitados para UI. |
| Catalogos | Si: clientes, modelos, deptos | Contactos, direcciones, linea/combina y campos tecnicos de estilo no sincronizados. |
| Configuracion | No FDB; local | Usuarios, permisos, metas y turnos no vienen de FDB. |

---

## 1. Dashboard ejecutivo

KPIs existentes:
- Pedidos activos.
- Lotes activos.
- Pares activos.
- Produccion del dia.
- Avance global.
- Pedidos vencidos.
- Porcentaje defectivo global.
- Cumplimiento de meta.

Graficas existentes:
- Produccion por hora: real vs meta.
- Pares por etapa.
- Top 5 modelos.
- Pareto de defectos.
- Pedidos por estatus.
- Estados de produccion/lotes.
- Cumplimiento por turno.
- Calidad por area.

Tablas existentes:
- Top pedidos activos con mayor riesgo.

Datos que necesita:
- Pedidos, lotes, pares, fechas compromiso, cliente, OC, modelo, color, etapa actual, avance por depto.
- Produccion por fecha/hora/turno/area.
- Metas por hora/turno/area.
- Defectos, inspeccionado, merma, segundas, reproceso.
- Riesgo/vencimiento por pedido.

Datos usados hoy:
- `erpData.wipSummary`, `stagePipeline`, `orderPipeline`, `orderRisk`, `lotePipeline`.
- `erpData.productionHourly`.
- `erpData.quality`.
- `erpData.models`.
- Fallback local: `orders`, `batches`, `defects`, `productionGoals`.

Datos faltantes:
- Defectos reales por tipo.
- Merma, segundas y reproceso reales.
- Meta real de ERP por area/hora.
- Responsable/operador real por movimiento.
- Status operativo nativo de todos los pedidos/lotes.

Faltan pero estan en FDB y no se sincronizan:
- `AVANCE.AV_SUBGENPOR`: sub-origen/responsable candidato.
- Campos extra de `PEDIDOS`: transporte, origen, meses retail/buy, descuentos/credito.
- Campos tecnicos de `ESTILO`: foto, costo, categoria, flujo, tipo producto, dias proceso, altura piso.
- Campos de talla por renglon/pedido: `LD_PTO01..30`.
- Campos de talla en PTMOV: `PT_PTO01..30`.

---

## 2. Pipeline por lote

KPIs existentes:
- Lotes activos.
- Pares activos.
- Lotes vencidos.
- Pares vencidos.
- Lotes embarcados hoy.
- Cuello de botella actual.

Graficas existentes:
- Pipeline visual por etapa.
- Tarjetas por etapa con volumen, atraso y saturacion.
- Indicadores por etapa en tarjetas, no graficas Recharts principales.

Tablas existentes:
- Lista/tabla de lotes: cliente, OC, lote, modelo, color, etapa, estatus, fechas, responsable, barcode.
- Panel detalle de tarjeta viajera.

Datos que necesita:
- Programa, lote, tarjeta viajera, pedido, cliente, OC, modelo, color, pares.
- Etapa/departamento actual, ultimo escaneo, tiempo en etapa.
- Fecha compromiso.
- Responsable actual, barcode/QR, observaciones, bloqueos, defectos por lote.

Datos usados hoy:
- `operationalData.lotePipeline`.
- Backend arma desde `tarjetas_viajeras`, `bigzap_lotes`, `bigzap_lotes_pedidos`, `bigzap_pedidos`, `bigzap_clientes`, `bigzap_estilos`, `bigzap_avance`.
- Defectos en detalle salen de estado local, no de FDB.

Datos faltantes:
- Responsable real de la etapa.
- Operador real por escaneo.
- Observaciones y bloqueos reales.
- Defectos reales por lote.
- Historial de reprogramaciones persistente.

Faltan pero estan en FDB y no se sincronizan:
- `AVANCE.AV_SUBGENPOR`.
- Mas campos de `AVANCE` para origen/suborigen si aplica.
- Campos de pedido no sincronizados: transporte/origen/meses/descuentos.
- Tallas por pedido/renglon `LD_PTO01..30`.

---

## 3. Pipeline por pedido

KPIs existentes:
- Total pares comprometidos.
- Pares embarcados.
- Pares en proceso.
- Backlog pendiente.
- Avance promedio ponderado.
- Pedidos vencidos.
- Pares vencidos.

Graficas existentes:
- Top 5 pedidos por volumen, apilado por etapa.
- Produccion diaria.
- Ranking de backlog critico.
- Ranking de indice de riesgo.
- Timeline de etapas por pedido en detalle.

Tablas existentes:
- Tabla de pedidos: cliente, OC, folio, fechas, total pares, pares por etapa, estatus, riesgo.

Datos que necesita:
- Pedido/folio, cliente, OC, fecha pedido, fecha compromiso, pares total.
- Pares por etapa, pares embarcados, pares pendientes.
- Modelo/color/lote asociado.
- Riesgo por atraso y avance.
- Valor comercial si se quiere margen/venta.

Datos usados hoy:
- `operationalData.orderPipeline`.
- `operationalData.dailyProduction`.
- `operationalData.orderRisk`.
- Backend cruza `bigzap_pedidos`, `bigzap_lotes_pedidos`, `bigzap_lotes`, `bigzap_avance`, `bigzap_pt_movimientos`.

Datos faltantes:
- Valor del pedido en MXN/USD.
- Precio, descuento y margen.
- Transporte y origen.
- Desglose real por talla en pedido.
- Cierre logistico completo por embarque/documento.

Faltan pero estan en FDB y no se sincronizan:
- `PEDIDOS.PE_TRANSPORTE`.
- `PEDIDOS.PE_ORIGEN`.
- `PEDIDOS.PE_BUYMONTH`.
- `PEDIDOS.PE_RETAILMONTH`.
- Campos de descuento/credito de `PEDIDOS`.
- `LD_PTO01..30` para tallas por linea de pedido.

---

## 4. Produccion por area

KPIs existentes:
- Produccion real total.
- Meta total.
- Cumplimiento de meta.
- Promedio pares/hora.
- Mejor hora.
- Peor hora.
- Tiempo sin registro.
- Eficiencia promedio.
- Total reprocesos.
- Total segundas.

Graficas existentes:
- Produccion por hora.
- Meta vs real acumulado.
- Produccion por area.
- Produccion por responsable.
- Produccion por modelo.
- Eficiencia por turno.

Tablas existentes:
- Bitacora de control por hora: fecha, origen, hora, turno, area, responsable, modelo, color, meta hora, real, diferencia, efectividad, status.

Datos que necesita:
- Produccion por hora, fecha, turno, area/depto, modelo, color, pares.
- Meta por area/turno/hora.
- Responsable/operador.
- Reproceso, segundas, merma.
- Maquina/banda si aplica.

Datos usados hoy:
- `operationalData.productionHourly`.
- `operationalData.quality` para reprocesos/segundas cuando coincide por fecha/modelo/area.
- Metas locales desde `productionGoals`.

Datos faltantes:
- Meta de ERP.
- Responsable real.
- Maquina/banda real.
- Calidad real por hora.
- Conteo exacto de piezas por maquina.

Faltan pero estan en FDB y no se sincronizan:
- `AVANCE.AV_SUBGENPOR`.
- Campos de capacidad/costo en `SUBDEPTO`, por ejemplo candidatos como pares/dia, tiempo/dia, costo/dia.
- Campos de costo/capacidad de `DEPA`.
- `PTMOV.PT_PTO01..30` para tallas en movimientos.

---

## 5. Modelos y productos

KPIs existentes:
- Pares producidos.
- Modelo lider por volumen.
- Mayor eficiencia.
- Mayor porcentaje defectivo.
- Mejor cumplimiento.
- Cumplimiento promedio.
- Modelos activos.

Graficas existentes:
- Ranking de modelos por pares.
- Tendencia de produccion por modelo.
- Pareto de defectos por modelo.
- Lead time promedio por modelo.
- Cumplimiento de entrega por modelo.
- Produccion por color.
- Productividad promedio por batch/lote.

Tablas existentes:
- Tabla operativa por modelo: total pares, participacion, lead time, inyeccion promedio, aduana promedio, banda promedio, porcentaje defectivo, segundas, cumplimiento.
- Panel detalle por modelo.

Datos que necesita:
- Modelo, nombre, linea, color, combinacion, cliente, pedido, lote, pares.
- Fechas de avance por etapa.
- Defectos, segundas, reproceso, merma.
- Tallas reales.
- Ficha tecnica de estilo/producto.

Datos usados hoy:
- `operationalData.models`.
- Backend usa `bigzap_lotes`, `bigzap_estilos`, `bigzap_avance`, `bigzap_pt_movimientos`, `bigzap_lotes_pedidos`, `bigzap_pedidos`, `bigzap_clientes`.
- Algunas visualizaciones calculan datos derivados o estimados.

Datos faltantes:
- Defecto real por modelo.
- Tallas reales completas en UI.
- Ficha tecnica completa.
- Costos y atributos de producto.
- Linea/combina con descripcion.

Faltan pero estan en FDB y no se sincronizan:
- `ESTILO.ES_FOTO`, `ES_COSTO`, `ES_ESCALA`, `ES_CATEGORIA`, `ES_FLUJO`, `ES_DIAPRO`, `ES_TIPPROD`, `ES_ALTPIS`.
- `COMBINA`.
- `LINEA` con descripcion.
- `LD_PTO01..30` y `PT_PTO01..30`.
- `AVANCE.AV_SUBGENPOR`.

Referencia completa: `docs/modelos-productos-fdb-report.md`.

---

## 6. Calidad

KPIs existentes:
- Total inspeccionado.
- Primeras.
- Segundas.
- Reproceso.
- Merma.
- Total defectos.
- Porcentaje defectivo.
- Porcentaje segundas.
- Defecto principal.
- Area con mayor defecto.
- Maquina/banda critica.
- Modelo critico.

Graficas existentes:
- Pareto de defectos.
- Defectos por area.
- Defectos por maquina.
- Defectos por banda.
- Defectos por modelo.
- Defectos por color.
- Defectos por talla.
- Primeras vs segundas.
- Tendencia diaria de porcentaje defectivo.
- Reprocesos y merma por semana.

Tablas existentes:
- Tabla de inspeccion: fecha, turno, area, maquina/banda, inspector, lider, lote, modelo, color, talla, inspeccionado, primeras, segundas, reproceso, merma, defecto, cantidad defecto, porcentaje defectivo, estatus.

Datos que necesita:
- Inspeccionado, primeras, segundas, reproceso, merma.
- Defecto y cantidad defecto.
- Fecha, turno, area, maquina/banda.
- Inspector, lider.
- Lote, modelo, color, talla.

Datos usados hoy:
- Estado local `inspectionRecords`.
- No usa `erpOperativo`.

Datos faltantes:
- Todo el dato real de calidad desde FDB/mirror.
- Catalogo/tipo de defectos real.
- Inspector/lider real.
- Maquina/banda real.
- Talla inspeccionada real.

Faltan pero estan en FDB y no se sincronizan:
- `AVANCE.AV_SUBGENPOR` como candidato de subresponsable.
- Campos de talla `PT_PTO01..30`/`LD_PTO01..30`.
- `PTMOV.PT_CALIDAD` existe sincronizado parcialmente, pero en la FDB revisada solo trae valor util `1`; no alcanza para defectos/segundas/reproceso/merma.

---

## 7. Inyeccion

KPIs existentes:
- Pares inyectados hoy.
- Meta diaria de inyeccion.
- Cumplimiento meta.
- Total inspeccionado.
- Total defectos.
- Total segundas, reprocesos y merma.
- Porcentaje defectivo.
- Promedio pares/hora.
- Maquina con mayor produccion.
- Maquina con mayor defecto.
- Tiempo promedio por lote.
- Maquinas activas.

Graficas existentes:
- Produccion por hora.
- Produccion por maquina.
- Defectos por maquina.
- Pareto de defectos de inyeccion.
- Primeras vs segundas por modelo.
- Eficiencia por turno.
- Defectos por talla.

Tablas existentes:
- Tabla de inyeccion: fecha, turno, maquina, molde, lote, modelo, color, talla, inspeccionado, primeras, segundas, reproceso, merma, defecto principal, piezas con falla, estatus, porcentaje defectivo.

Datos que necesita:
- Produccion de inyeccion por depto/area, hora, turno.
- Maquina/prensa.
- Molde/horma.
- Operador/inspector.
- Lote, modelo, color, talla.
- Calidad: defecto, segundas, reproceso, merma.

Datos usados hoy:
- Estado local `injectionRecords`.
- No usa `erpOperativo`.

Datos faltantes:
- Maquina/prensa real.
- Molde real.
- Operador real.
- Calidad real.
- Produccion real FDB conectada a la vista.

Faltan pero estan en FDB y no se sincronizan:
- Produccion por depto 15 en `AVANCE` ya puede existir en mirror, pero el modulo no la consume.
- `AVANCE.AV_SUBGENPOR`.
- Campos tecnicos de `ESTILO` para producto/proceso.
- `HORMAS` existe en FDB, pero en la revision no tenia filas.
- `LC_PTO01..30`/`LD_PTO01..30` para tallas programadas.

---

## 8. Banda

KPIs existentes:
- Pares procesados hoy.
- Meta diaria de banda.
- Cumplimiento meta.
- Promedio pares/hora.
- Total procesado.
- Total defectos.
- Porcentaje defectivo.
- Segundas, reprocesos y merma.
- Banda con mayor produccion.
- Banda con mayor defecto.
- Tiempo promedio en banda.
- Bandas activas.

Graficas existentes:
- Produccion por hora.
- Produccion por banda.
- Defectos por banda.
- Pareto de defectos.
- Primeras vs segundas por modelo.
- Defectos por modelo.
- Defectos por color.
- Tendencia de porcentaje defectivo.

Tablas existentes:
- Tabla de banda: fecha, turno, banda, inspector, lider, lote, modelo, color, talla, total procesado, primeras, segundas, reproceso, merma, defecto, cantidad defecto, porcentaje defectivo, accion correctiva, observaciones.

Datos que necesita:
- Produccion por banda/linea, hora, turno.
- Banda real.
- Inspector/lider.
- Lote, modelo, color, talla.
- Defecto, merma, segundas, reproceso.
- Accion correctiva y observaciones.

Datos usados hoy:
- Estado local `bandaRecords`.
- No usa `erpOperativo`.

Datos faltantes:
- Banda real desde FDB/mirror.
- Inspector/lider real.
- Defectos reales.
- Acciones correctivas.
- Produccion real FDB conectada a la vista.

Faltan pero estan en FDB y no se sincronizan:
- Produccion por deptos de banda en `AVANCE` puede existir en mirror, pero el modulo no la consume.
- `SUBDEPTO` sincronizado parcialmente como `bigzap_subdeptos`, pero no se usa para identificar banda.
- `AVANCE.AV_SUBGENPOR`.
- `PTMOV.PT_PTO01..30` para tallas movidas.

---

## 9. Aduana / liberacion

KPIs existentes:
- Lotes en aduana.
- Pares en aduana.
- Liberados hoy.
- Pendientes de validacion.
- Lotes bloqueados.
- Horas promedio en aduana.
- Pedidos completos.
- Pedidos incompletos.

Graficas existentes:
- No hay graficas analiticas principales detectadas; el modulo trabaja con tarjetas, tabla y detalle.

Tablas existentes:
- Tabla de liberacion: fecha, cliente, OC, lote, tarjeta viajera, modelo, color, pares, estatus y validaciones.
- Panel detalle con tallas, validaciones, firmas e historial.

Datos que necesita:
- Cliente, OC, pedido, lote, tarjeta, modelo, color, pares.
- Desglose de tallas.
- Fecha entrada/salida aduana.
- Validacion pedido completo.
- Validacion color/muestra.
- Responsable, jefe de aduana, jefe preacabado.
- Bloqueos, liberacion, observaciones e historial.

Datos usados hoy:
- Estado local/manual del modulo.
- No usa `erpOperativo`.

Datos faltantes:
- Todo el flujo real de validacion/liberacion desde FDB.
- Firmas responsables.
- Historial de bloqueos/liberaciones.
- Tallas reales conectadas a lote/pedido.

Faltan pero estan en FDB y no se sincronizan:
- Lote/pedido/modelo/color/pares existen en mirror, pero el modulo no los consume.
- Avances de deptos de aduana/calidad existen como candidatos en `AVANCE`.
- `LD_PTO01..30` para tallas de pedido.
- `AVANCE.AV_SUBGENPOR`.

No parecen estar en FDB:
- Validacion manual de muestra/color.
- Firma de jefe aduana/preacabado.
- Observaciones de liberacion actuales del dashboard.

---

## 10. Embarque

KPIs existentes:
- Pares listos.
- Embarcado hoy.
- Pedidos completos.
- Pedidos parciales.
- Pendientes.
- Vencidos.
- Cumplimiento.
- Tiempo promedio de cierre.

Graficas existentes:
- Pares embarcados por dia.
- Pedidos completos vs parciales.
- Cumplimiento OTIF por cliente.
- Pares embarcados por modelo.
- Backlog pendiente por cliente.

Tablas existentes:
- Tabla de embarques: fecha, cliente, OC, pedido, lote, modelo, color, total pares pedido, pares listos, pares embarcados, pares pendientes, fecha compromiso, fecha embarque, estatus, responsable.
- Panel detalle.

Datos que necesita:
- Pedido, cliente, OC, lote, modelo, color.
- Pares pedidos, listos, embarcados y pendientes.
- Fecha compromiso y fecha embarque.
- Documento de embarque/factura/remision.
- Transporte, planta, almacen.
- Responsable.
- Tallas embarcadas.

Datos usados hoy:
- Estado local/manual del modulo.
- No usa `erpOperativo` en la UI de embarque.

Datos faltantes:
- El modulo no consume movimientos reales de PTMOV.
- Transporte/documentos logisticos.
- Responsable real.
- Tallas embarcadas.
- Tiempo promedio real de cierre.

Faltan pero estan en FDB y no se sincronizan o no se consumen:
- `bigzap_pt_movimientos` ya tiene movimientos de PTMOV, pero este modulo no lo usa.
- `PTMOV.PT_PTO01..30` existe en FDB y no se sincroniza.
- `PTMOV.PT_PLANTA`, `PT_ALMACEN`, `PT_FOLALM`, `PT_ORIGEN` existen como candidatos y no estan en el shape.
- `PEDIDOS.PE_TRANSPORTE` existe en FDB y no se sincroniza.

---

## 11. OCR validacion

KPIs existentes:
- Conteo de documentos en historial.
- Campos detectados por documento.
- Campos corregidos.
- Confianza promedio.
- Estado del documento.

Graficas existentes:
- No hay graficas.

Tablas existentes:
- Historial de documentos OCR: fecha carga, tipo carta, archivo, usuario, campos, corregidos, confianza, estado, aprobador.
- Campos detectados por schema OCR.
- Panel de responsables por tipo/area/turno.

Datos que necesita:
- Tipos de carta y schema de campos/tablas.
- Archivo PDF/imagen.
- Resultado OCR: data, tables, confianza, alertas.
- Correcciones del usuario.
- Estados de validacion, aprobador, responsables.

Datos usados hoy:
- Servicio externo por `VITE_OCR_SERVICE_URL`.
- Endpoints `/letras/tipos`, `/reportes`, `/responsables`.
- Contexto local para usuario/auditoria.

Datos faltantes:
- No cruza contra FDB para validar pedido/lote/modelo/cliente.
- No usa catalogos FDB para autocompletar o validar.
- No liga OCR aprobado a un flujo de produccion/embarque.

Faltan pero estan en FDB y no se sincronizan:
- No aplica directo: OCR no depende de FDB.
- Como mejora, podria validar cliente/pedido/lote/modelo/color contra `bigzap_clientes`, `bigzap_pedidos`, `bigzap_lotes`, `bigzap_estilos`, que ya estan sincronizados.

---

## 12. Reportes historicos

KPIs existentes:
- No hay tarjetas KPI principales detectadas.

Graficas existentes:
- No hay graficas principales detectadas.

Tablas existentes:
- Lotes archivados.
- Bitacora/auditoria.
- Produccion historica por hora.
- Movimientos historicos por etapa/depto.

Datos que necesita:
- Auditoria de acciones.
- Lotes archivados/restaurados.
- Produccion historica.
- Movimientos historicos por programa/lote/depto.
- Usuario/responsable del movimiento.

Datos usados hoy:
- `erpOperativo` para `productionHourly` y `movements`.
- Estado local/contexto para `audits` y lotes archivados.

Datos faltantes:
- Auditoria real de FDB.
- Archivo/restauracion real en FDB.
- Usuarios reales de FDB.
- Historial completo sin truncado UI.

Faltan pero estan en FDB y no se sincronizan:
- `AVANCE.AV_SUBGENPOR`.
- Posible tabla de usuarios ERP, si existe en la FDB productiva, no esta en mirror usado por el dashboard.
- Campos extra de movimiento de PTMOV no incluidos en shape.

---

## 13. Catalogos

KPIs existentes:
- No hay KPIs.

Graficas existentes:
- No hay graficas.

Tablas existentes:
- Clientes FDB.
- Modelos FDB.
- Departamentos FDB.

Datos que necesita:
- Clientes: codigo, nombre, RFC, clasificacion, email, telefono, contacto, direccion.
- Modelos: codigo, nombre, linea, vigente, categoria, costo, foto, ficha tecnica.
- Departamentos: codigo, nombre, stage, orden.

Datos usados hoy:
- `catalogs.clients` desde `bigzap_clientes`: codigo, nombre, rfc, clasif.
- `catalogs.models` desde `bigzap_estilos`: codigo, nombre, linea, vigente.
- `catalogs.departments` desde `bigzap_departamentos`: codigo, nombre, stage_id, orden.

Datos faltantes:
- Email/telefono/contactos de cliente.
- Direcciones.
- Descripcion de linea y combinacion.
- Campos tecnicos del estilo.
- Catalogos de generos/categorias/hormas utiles.

Faltan pero estan en FDB y no se sincronizan:
- `CTES` con campos de contacto/correo/telefono/direccion, por ejemplo `CC_CECOMPRAS`, `CC_CEPAGOS`, `CC_TELEFONO` y direcciones.
- `ESTILO.ES_FOTO`, `ES_COSTO`, `ES_ESCALA`, `ES_CATEGORIA`, `ES_FLUJO`, `ES_DIAPRO`, `ES_TIPPROD`, `ES_ALTPIS`.
- `LINEA` con descripcion.
- `COMBINA`.
- `GENEROS`.

---

## 14. Configuracion

KPIs existentes:
- No hay KPIs de negocio.

Graficas existentes:
- No hay graficas.

Tablas existentes:
- Usuarios.
- Permisos.
- Turnos.
- Metas de produccion.

Datos que necesita:
- Usuarios, roles, permisos.
- Turnos.
- Metas por area/turno/hora.
- Configuracion de tenant.

Datos usados hoy:
- Estado local/contexto del dashboard.
- No usa `erpOperativo`.

Datos faltantes:
- Usuarios reales ERP.
- Roles/permisos ERP.
- Metas/capacidades desde ERP.
- Turnos reales de planta.

Faltan pero estan en FDB y no se sincronizan:
- Posible catalogo de usuarios ERP si existe en la FDB productiva.
- Campos de capacidad/costo en `SUBDEPTO`.
- Campos de departamento en `DEPA`.

---

## Priorizacion de sincronizacion

1. Conectar modulos locales a datos ya sincronizados:
   - Inyeccion: usar `productionHourly` filtrado a depto/area inyeccion.
   - Banda: usar `productionHourly` filtrado a deptos/areas de banda.
   - Embarque: usar `bigzap_pt_movimientos`/`movements`.
   - Aduana: usar lotes/pedidos/tallas como base, dejando validaciones manuales.

2. Ampliar sync-service:
   - `AVANCE.AV_SUBGENPOR`.
   - `PTMOV.PT_PTO01..30`.
   - `LD_PTO01..30`.
   - Campos logisticos de `PEDIDOS`: transporte, origen, buy/retail month.
   - Contactos/direcciones de `CTES`.
   - Campos tecnicos de `ESTILO`.
   - Catalogos `LINEA`, `COMBINA`, `GENEROS`.

3. Brecha que probablemente no existe completa en FDB:
   - Defectos reales por tipo.
   - Segundas/reproceso/merma confiables.
   - Firma/liberacion manual.
   - Acciones correctivas.
   - Maquina/prensa/banda real por pieza.

