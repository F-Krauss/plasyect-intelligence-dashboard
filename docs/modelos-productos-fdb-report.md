# Reporte FDB - Modelos y Productos

Fecha de verificacion: 2026-06-16 20:10 America/Mexico_City.

Fuentes verificadas:

- `BIGZAP.FDB` local: 303 tablas de usuario. Copia local llega hasta 2026-04-21.
- Mirror Supabase `bigzap_*`: ultima corrida OK `2026-06-17T02:10:48Z`; llega hasta 2026-06-16 en `AVANCE` y `PTMOV`, 2026-06-15 en `LOTCAB`.

## Resumen vivo del modulo

| Metrica | Valor |
|---|---:|
| Modelos detectados | 29 |
| Colores/codigos pigmento detectados | 76 |
| Lotes no cancelados | 37,796 |
| Pares no cancelados | 1,107,577 |
| Lotes activos en planta (`15`,`25`,`30`) | 878 |
| Pares activos en planta | 27,397 |
| Modelos activos en planta | 10 |
| Lotes con talla (`pares_por_talla`) | 37,898 / 37,900 |
| Movimientos con defecto real (`PT_CALIDAD <> 1`) | 0 |
| Calidades distintas en `PTMOV` | 1 |

Top modelos por pares:

| Modelo | Lotes | Pares |
|---|---:|---:|
| SPIDER JUNIOR | 2,706 | 228,666 |
| RUBBI 18-21 | 8,808 | 178,314 |
| RUBBI 22-26 | 7,556 | 173,306 |
| RUBBY DAMA 22-26 GANCHO | 2,234 | 105,126 |
| 0008-J | 3,780 | 80,613 |
| 0006-N | 1,969 | 48,723 |
| 0001-C | 2,386 | 44,353 |
| RUBBY INFANTIL 18-21 GANCHO | 909 | 42,968 |
| YESSI 22-26 | 1,256 | 35,634 |
| 0006-D | 1,708 | 33,696 |

## Campos que si se pueden usar ya

### Identidad y catalogo de modelo

| Campo dashboard | Fuente FDB/mirror | Cobertura | Uso |
|---|---|---:|---|
| `modeloId` | `LOTCAB.LC_ESTILO` -> `bigzap_lotes.estilo` | 37,900 / 37,900 | ID de modelo/estilo |
| `modeloName` | `ESTILO.ES_NOMEST` -> `bigzap_estilos.nombre` | 24 / 24 catalogo; 25,998 / 37,900 en vista | Nombre del modelo cuando hay join |
| `linea` | `ESTILO.ES_LINEA` -> `bigzap_estilos.linea` | 24 / 24 | Linea/categoria base |
| `vigente` | `ESTILO.ES_VIGENTE` -> `bigzap_estilos.vigente` | 24 / 24 mirror | Modelo activo/inactivo en catalogo |
| `tarjeta/lote` | `LC_PROG`, `LC_LOTE`, `tarjeta` | 37,900 / 37,900 | Llave de lote y trazabilidad |

### Producto, color, corrida y tallas

| Campo dashboard | Fuente FDB/mirror | Cobertura | Uso |
|---|---|---:|---|
| `color` | `LOTCAB.LC_PIECOL`, fallback `LC_COMBINA` | 37,900 / 37,900 | Color/codigo pigmento |
| `combina` | `LOTCAB.LC_COMBINA` | 37,900 / 37,900 | Combinacion |
| `corrida` | `LOTCAB.LC_CORRIDA` / `LOTDET.LD_CORRIDA` | 37,900 / 37,900 | Corrida de tallas |
| `pares` | `LOTCAB.LC_PARLOT` / `LOTDET.LD_PARES` | 37,900 / 37,900 | Pares por lote |
| `pares_por_talla` | `LOTCAB.LC_PTO01..LC_PTO30` -> JSON | 37,898 / 37,900 | Distribucion real por talla del lote |
| `fecha` | `LC_FECPRO`, `AV_FECHA`, `PT_FECMOV` | completa en tablas base | Produccion por dia/rango |

### Proceso y etapa

| Campo dashboard | Fuente FDB/mirror | Cobertura | Uso |
|---|---|---:|---|
| `status_depto` | `LOTCAB.LC_STATUS` | 37,900 / 37,900 | Depto actual del lote |
| `stage_id` | `DEPA.DP_CODDEP` + mapeo dashboard | 37,803 / 37,900 | Etapa dashboard |
| `zona_actual` | ultimo `AVANCE.AV_DEPTO` | 37,865 / 37,900 | Ultima zona escaneada |
| `zona_previa` | penultimo `AVANCE.AV_DEPTO` | 36,527 / 37,900 | Zona anterior |
| `ultimo_escaneo` | `AV_FECHA + AV_HORA` | 37,865 / 37,900 | Tiempo desde ultimo movimiento |
| `gen_por` | `AVANCE.AV_GENPOR` | 158,110 / 201,053 | Usuario/estacion origen, semantica pendiente |
| `subdepto` escaneo | `AVANCE.AV_SUBDEPTO` | 30 / 201,053 | Subzona puntual, casi vacio |

### Cliente y pedido

| Campo dashboard | Fuente FDB/mirror | Cobertura | Uso |
|---|---|---:|---|
| `pedido_folio` | `LOTDET.LD_PEDIDO` | 37,900 / 37,900 | Pedido ligado al lote |
| `cliente_codigo` | `LOTDET.LD_CODCTE` | 37,900 / 37,900 | Cliente por lote |
| `cliente_nombre` | `CTES.CC_NOMCTE` | 37,900 / 37,900 en vista | Cliente legible |
| `pedido_oc` | `PEDIDOS.PE_PEDCTE` | 32,520 / 37,900 en vista | Orden cliente/OC |
| `pedido_fecha_salida` | `PEDIDOS.PE_FECSAL` | 37,900 / 37,900 en vista | Fecha compromiso |

### Produccion, tiempos y cumplimiento

| Campo API `models` | Como se calcula | Usable |
|---|---|---|
| `lotes` | conteo de escaneos `AVANCE` depto `15` por modelo/color/cliente/dia | Si |
| `paresProducidos` | suma de pares de lotes con escaneo `15` | Si |
| `leadTimeHours` | suma de duraciones inyeccion + aduana + banda | Si, derivado |
| `tiempoInyeccionMins` | `AVANCE` de `15` al siguiente depto | Si, derivado |
| `tiempoEstabilizacionMins` | `AVANCE` deptos `20/25` al siguiente depto | Si, derivado |
| `tiempoBandaMins` | `AVANCE` deptos `30/35/39` al siguiente depto | Si, derivado |
| `entregasCumplidas` | escaneo `40/50` <= `PE_FECSAL` | Si, derivado |
| `entregasTotal` | lotes con escaneo `40/50` | Si, derivado |
| `etapaActiva` | `LC_STATUS` mapeado | Si |
| `estatus` | regla backend por defecto/lead time | Si, pero regla propia, no campo FDB |

## Campos que faltan o no conviene usar aun

### Calidad/defectos

| Falta | Evidencia | Impacto |
|---|---|---|
| Defectos reales por modelo | `PTMOV.PT_CALIDAD` tiene solo valor `1` en FDB local y mirror vivo | `% defectivo`, `paresDefectuosos`, `segundas`, `reproceso`, Pareto de defectos quedan en 0 |
| Tipo/nombre de defecto | No hay tabla de defecto sincronizada para este modulo | No se puede explicar causa de rechazo por modelo |
| Merma real | No hay movimiento/calidad distinto a 1 | Merma no es confiable desde FDB actual |

### Catalogo tecnico de modelo existe en FDB, pero no esta sincronizado

`ESTILO` tiene 25 campos. Mirror actual solo trae `ES_CODEST`, `ES_NOMEST`, `ES_LINEA`, `ES_VIGENTE`.

| Campo FDB | Cobertura FDB local | Estado |
|---|---:|---|
| `ES_FOTO` | 8 / 24 | Falta sincronizar; util para ficha de producto |
| `ES_COSTO` | 24 / 24 | Falta sincronizar; util para costo |
| `ES_ESCALA` | 24 / 24 | Falta sincronizar |
| `ES_CATEGORIA` | 24 / 24 | Falta sincronizar |
| `ES_FLUJO` | 24 / 24 | Falta sincronizar; posible ruta/flujo |
| `ES_DAMCAB` | 24 / 24 | Falta sincronizar |
| `ES_DIAPRO` | 24 / 24 | Falta sincronizar; posible dias proceso |
| `ES_TIPPROD` | 22 / 24 | Falta sincronizar; tipo producto |
| `ES_ALTPIS` | 24 / 24 | Falta sincronizar |
| `ES_CODUNI` | 24 / 24 | Falta sincronizar; unidad |
| `ES_PARBOL` | 24 / 24 | Falta sincronizar |
| `ES_MANOIND` | 24 / 24 | Falta sincronizar; costo mano indirecta |
| `ES_MATINDI` | 24 / 24 | Falta sincronizar; material indirecto |
| `ES_COMISION` | 24 / 24 | Falta sincronizar |
| `ES_GASGEN` | 24 / 24 | Falta sincronizar |
| `ES_GASFIJ` | 24 / 24 | Falta sincronizar |
| `ES_PORUTI` | 24 / 24 | Falta sincronizar |
| `ES_RECIO` | 0 / 24 | Existe, pero vacio |
| `ES_HORMA` | 0 / 24 | Existe, pero vacio |
| `ES_SUBGENERO` | 0 / 24 | Existe, pero vacio |
| `ES_PUNTADAS` | 0 / 24 | Existe, pero vacio |

### Catalogos auxiliares faltantes

| Tabla FDB | Campos | Filas | Estado |
|---|---|---:|---|
| `COMBINA` | `CO_CODCOM`, `CO_DESCRIP` | 108 | No sincronizada; falta descripcion de combinacion/color |
| `LINEA` | `LI_CODLIN`, `LI_DESCRIP` | 7 | No sincronizada; falta nombre de linea |
| `GENEROS` | `GN_CODIGO`, `GN_DESCRIPCION` | 5 | No sincronizada; `ES_SUBGENERO` viene vacio |
| `HORMAS` | `HO_CODIGO`, `HO_DESCRIP`, `HO_CORRIDA`, `HO_PTO01..17` | 0 | Existe, pero sin datos |
| `CATEG` | `CG_CODIGO`, `CG_DESCRIP`, `CG_VALOR` | 0 | Existe, pero sin datos |

### Tallas por pedido/movimiento faltan en mirror

| Fuente FDB | Campos | Estado |
|---|---|---|
| `LOTDET` | `LD_PTO01..LD_PTO30` | No sincronizados; solo se trae `LD_PARES` |
| `PTMOV` | `PT_PTO01..PT_PTO30` | No sincronizados; solo se trae `PT_PARES` |

Impacto: el modulo puede mostrar tallas planeadas del lote (`LOTCAB.LC_PTO01..30`), pero no tallas por pedido ni tallas reales movidas/embarcadas.

### Otros campos operativos no sincronizados

| Fuente FDB | Campos | Uso posible |
|---|---|---|
| `AVANCE` | `AV_SUBGENPOR` | Sub-origen/estacion; no esta en mirror |
| `SUBDEPTO` | `SD_PARESXDIA`, `SD_TIEMPOXDIA`, `SD_COSTOXDIA`, `SD_FRACCION` | Capacidad/costo por subdepto |
| `DEPA` | `DP_MANOBRA`, `DP_GASTOS`, `DP_PORCMATINDI`, `DP_PORCGASFIJO`, `DP_PORMANOBRAI` | Costeo por etapa |
| `PTMOV` | `PT_PLANTA`, `PT_ALMACEN`, `PT_FOLALM`, `PT_PROGORI`, `PT_LOTORI`, `PT_PEDORI`, `PT_RENORI`, `PT_ORIGEN` | Trazabilidad almacen/origen |
| `PEDIDOS` | `PE_BUYMONTH`, `PE_RETAILMONTH`, `PE_TRANSPORTE`, `PE_ORIGEN`, descuentos/credito | Planeacion comercial |

## Campos que la UI muestra pero no vienen directo de FDB

| UI | Estado |
|---|---|
| `Mayor Eficiencia` | Usa menor tasa de defecto; como defectos son 0, no diferencia bien modelos |
| `Mayor Defectivo` | Sale 0 por falta de `PT_CALIDAD <> 1` |
| `Distribucion Estimada por Tallas` | Actualmente estimada 15/40/35/10 en UI; debe cambiarse a `pares_por_talla` real |
| `Recomendacion operativa simulada` | Texto local; no es dato FDB |
| `OEE ACTIVO` | Etiqueta UI; no hay OEE real en FDB |

## Recomendacion de siguiente cambio

1. Ampliar sync de `ESTILO` con campos tecnicos utiles: `ES_FOTO`, `ES_COSTO`, `ES_ESCALA`, `ES_CATEGORIA`, `ES_FLUJO`, `ES_DIAPRO`, `ES_TIPPROD`, `ES_ALTPIS`, `ES_CODUNI`, `ES_PARBOL`, `ES_MANOIND`, `ES_MATINDI`, `ES_COMISION`, `ES_GASGEN`, `ES_GASFIJ`, `ES_PORUTI`.
2. Sincronizar `COMBINA` y `LINEA` para nombres legibles de color/combinacion y linea.
3. Sincronizar `LD_PTO01..30` y `PT_PTO01..30` si se quiere talla por pedido/embarque.
4. Cambiar UI de tallas: quitar estimado y usar `pares_por_talla`.
5. No mostrar Pareto/% defectivo como real hasta encontrar fuente de defectos distinta a `PTMOV.PT_CALIDAD`.

## Apendice - campos completos disponibles en mirror

Estos son todos los campos actuales que el backend puede consultar sin tocar Firebird directo.

| Tabla/vista | Filas | Campos |
|---|---:|---|
| `bigzap_estilos` | 24 | `codigo`, `nombre`, `linea`, `vigente`, `synced_at` |
| `bigzap_lotes` | 37,900 | `programa`, `lote`, `tarjeta`, `estilo`, `piecol`, `combina`, `corrida`, `fecha_programacion`, `pares`, `status_depto`, `cancelado`, `fecha_cancelacion`, `semana_produccion`, `anio_produccion`, `planta`, `subdepto`, `tarjeta_impresa`, `etiqueta_impresa`, `pares_por_talla`, `synced_at` |
| `bigzap_avance` | 201,053 | `programa`, `lote`, `depto`, `fecha`, `hora_cs`, `escaneado_at`, `gen_por`, `subdepto`, `synced_at` |
| `bigzap_pedidos` | 557 | `folio`, `cliente`, `fecha_pedido`, `fecha_recepcion`, `fecha_salida`, `fecha_cancelacion`, `pares_pedidos`, `pares_facturados`, `pedido_cliente`, `tienda`, `temporada`, `synced_at` |
| `bigzap_lotes_pedidos` | 37,900 | `programa`, `lote`, `pedido`, `renglon`, `cliente`, `corrida`, `pares`, `synced_at` |
| `bigzap_pt_movimientos` | 25,515 | `id`, `fecha_movimiento`, `movto`, `tipo`, `docto`, `programa`, `lote`, `pedido`, `renglon`, `calidad`, `pares`, `distingue`, `observa`, `synced_at` |
| `bigzap_clientes` | 13 | `codigo`, `nombre`, `rfc`, `clasif`, `synced_at` |
| `bigzap_departamentos` | 10 | `codigo`, `nombre`, `stage_id`, `orden`, `synced_at` |
| `bigzap_subdeptos` | 6 | `codigo`, `nombre`, `depto_padre`, `planta`, `synced_at` |
| `tarjetas_viajeras` | 37,900 | `tarjeta`, `programa`, `lote`, `estilo`, `estilo_nombre`, `piecol`, `combina`, `corrida`, `pares`, `fecha_programacion`, `status_depto`, `status_depto_nombre`, `stage_id`, `zona_actual`, `zona_actual_nombre`, `zona_previa`, `zona_previa_nombre`, `ultimo_escaneo`, `cancelado`, `tarjeta_impresa`, `pares_por_talla`, `pedido_folio`, `cliente_codigo`, `cliente_nombre`, `pedido_oc`, `pedido_fecha_salida`, `synced_at` |
