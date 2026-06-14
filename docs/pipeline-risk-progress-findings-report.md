# Pipeline, Pedidos En Riesgo, Avance Global - Findings Report

Fecha: 2026-06-14

## Veredicto Corto

No puedo asegurar que esos tres bloques esten correctos en produccion hoy.

La fuente base si viene de FDB mirror para `orders` y `batches`, pero la logica critica todavia se calcula en frontend sobre `/api/bootstrap`. Ese bootstrap esta limitado por `BIGZAP_BATCH_LIMIT=800`, mientras la FDB mirror tiene `1,371` lotes activos. Por eso los totales globales pueden salir incompletos o sesgados.

Los KPIs mas delicados son:

- `Avance Global`
- `Pedidos en Riesgo`
- `Pipeline por etapa`
- `Pipeline por Pedido`
- `Backlog`
- `Etapa dominante`

## Fuentes Actuales

| Area | Fuente actual | Es FDB real | Riesgo |
|---|---|---:|---|
| Pedidos activos | `/api/erp/operativo` | Si | Bajo |
| Lotes activos | `/api/erp/operativo` | Si | Bajo |
| Pares activos | `/api/erp/operativo` | Si | Bajo |
| Produccion horaria | `/api/erp/operativo` | Si | Bajo |
| Calidad | `/api/erp/operativo` | Si | Medio: FDB actual casi no trae defectos |
| Catalogos cliente/modelo/depto | `/api/erp/operativo` | Si | Bajo |
| Avance global | Frontend + `/api/bootstrap` | Parcial | Alto |
| Pipeline por etapa | Frontend + `/api/bootstrap` | Parcial | Alto |
| Pedidos en riesgo | Frontend + `/api/bootstrap` | Parcial | Alto |
| Pipeline por pedido | Frontend + `/api/bootstrap` | Parcial | Alto |

## Como Funciona Ahora

### Backend `/api/erp/operativo`

Archivo: `backend/src/erp.ts`

Este endpoint ya consulta FDB mirror completa para:

- `active.orders`
- `active.batches`
- `active.pairs`
- `productionHourly`
- `quality`
- `movements`
- `models`
- `catalogs`
- `dailyProduction`

Los activos salen de:

```sql
select
  count(distinct pedido_folio) as orders,
  count(*) as batches,
  sum(pares) as pairs
from public.tarjetas_viajeras
where cancelado = false
  and coalesce(status_depto, '') not in ('40','50')
```

Eso esta bien para activos globales.

### Backend `/api/bootstrap`

Archivo: `backend/src/repository.ts`

Bootstrap carga:

```sql
select * from public.tarjetas_viajeras
where cancelado = false
  and (status_depto <> '50' or ultimo_escaneo >= $1)
order by ultimo_escaneo desc nulls last
limit $2
```

`$2` viene de:

```ts
BIGZAP_BATCH_LIMIT=800
```

Problema: bootstrap no trae todos los lotes activos. Sirve para vista detalle, busqueda, acciones y carga rapida. No sirve para KPIs globales.

## Finding 1 - Avance Global Puede Estar Mal

Severidad: P1

### Como trabaja hoy

Archivo: `src/views/ViewRegistry.tsx`

El Dashboard Ejecutivo calcula avance global en frontend:

```ts
const activeBatchesForProgress = filteredBatches.filter(b => !isDeliveredBatch(b));
const totalParesForProgress = activeBatchesForProgress.reduce((sum, b) => sum + getBatchPairs(b), 0);
const sumAvancePares = activeBatchesForProgress.reduce((sum, b) => sum + ((b.porcentajeAvance || 0) * getBatchPairs(b)), 0);
const kpiGlobalProgress = totalParesForProgress > 0 ? Math.round(sumAvancePares / totalParesForProgress) : 0;
```

`filteredBatches` viene de bootstrap.

### Que esta mal

El calculo es correcto matematicamente si tuviera todos los lotes. Pero no los tiene.

Evidencia actual FDB:

| Metrica | Valor |
|---|---:|
| Lotes activos reales | 1,371 |
| Pares activos reales | 80,069 |
| Avance ponderado real esperado | 27% |
| UI vista en screenshot | 52% |

### Fix

Mover `globalProgress` al backend, calculado con SQL sobre FDB completa.

Formula:

```sql
sum(pares * peso_etapa) / sum(pares)
```

Pesos recomendados:

| Etapa | Peso |
|---|---:|
| alta_pedido | 14 |
| almacen | 29 |
| inyeccion | 43 |
| estabilizacion | 57 |
| aduana | 71 |
| banda | 86 |
| embarque | 100 |

Frontend solo pinta `erpData.wipSummary.globalProgress`.

## Finding 2 - Pipeline Por Etapa Puede Estar Incompleto

Severidad: P1

### Como trabaja hoy

Archivo: `src/views/ViewRegistry.tsx`

Frontend agrupa lotes por etapa:

```ts
const pipelineStages = STAGES.map(st => {
  const stageBatches = filteredBatches.filter(b => getBatchStageId(b) === st.id);
  const stageLotesCount = stageBatches.length;
  const stageParesCount = stageBatches.reduce((sum, b) => sum + getBatchPairs(b), 0);
});
```

### Que esta mal

La agrupacion usa bootstrap limitado. La distribucion puede faltar lotes.

FDB completa actual:

| Etapa | Lotes | Pares |
|---|---:|---:|
| alta_pedido | 583 | 56,624 |
| inyeccion | 406 | 12,086 |
| aduana | 294 | 8,971 |
| banda | 88 | 2,388 |
| Total | 1,371 | 80,069 |

### Fix

Agregar `stagePipeline` a `/api/erp/operativo`:

```ts
stagePipeline: Array<{
  stageId: string;
  stageName: string;
  batches: number;
  pairs: number;
  avgMinutes: number | null;
  wipPct: number;
  saturation: 'OPTIMO' | 'SATURADO' | 'CRITICO';
}>
```

Frontend usa eso para cards, grafica y tabla. Bootstrap queda solo para abrir lote individual.

## Finding 3 - Pedidos En Riesgo Tiene Dos Verdades

Severidad: P1

### Como trabaja hoy

KPI usa riesgo guardado:

```ts
const kpiOrdersInRiskCount = filteredOrders.filter(o => o.riesgoEntrega === 'ALTO' || o.riesgoEntrega === 'VENCIDO').length;
```

Tabla recalcula riesgo:

```ts
const daysLeft = Math.ceil((commitment.getTime() - riskReferenceDate.getTime()) / (1000 * 60 * 60 * 24));
const computedRisk = getRiskFromDays(daysLeft);
const displayRisk = isClosedOrder(o.status || o.estatus) ? savedCloseRisk : computedRisk;
```

### Que esta mal

Puede haber diferencia entre:

- KPI de riesgo
- tabla de riesgo
- fecha seleccionada
- pedido abierto/cerrado
- lotes faltantes por bootstrap

Hoy el numero `43` puede coincidir, pero no por diseño robusto.

Evidencia actual FDB:

| Metrica | Valor |
|---|---:|
| Pedidos abiertos | 43 |
| Vencidos | 43 |
| Alto riesgo | 0 |
| Total riesgo | 43 |

### Fix

Calcular `orderRisk` en backend:

```ts
orderRisk: {
  totalOpen: number;
  totalRisk: number;
  vencido: number;
  alto: number;
  medio: number;
  bajo: number;
  rows: Array<{
    orderId: string;
    cliente: string;
    oc: string | null;
    fechaAlta: string | null;
    fechaCompromiso: string | null;
    totalPares: number;
    paresEntregados: number;
    paresPendientes: number;
    progress: number;
    daysLeft: number | null;
    risk: 'VENCIDO' | 'ALTO' | 'MEDIO' | 'BAJO';
    dominantStage: string;
  }>;
}
```

Reglas:

- `VENCIDO`: fecha compromiso menor a fecha corte y no entregado completo.
- `ALTO`: vence en 0-3 dias y no entregado completo.
- `MEDIO`: vence en 4-7 dias y no entregado completo.
- `BAJO`: mas de 7 dias, sin fecha, o entregado completo.

Frontend no debe recalcular riesgo global. Solo filtrar y renderizar.

## Finding 4 - Pipeline Por Pedido Promedia Avance Mal

Severidad: P2

### Como trabaja hoy

Archivo: `src/views/ViewRegistry.tsx`

El modulo calcula avance por pedido y luego promedia simple:

```ts
const avgProgress = filteredOrders.length > 0
  ? Math.round(filteredOrders.reduce((sum, o) => sum + o.progress, 0) / filteredOrders.length)
  : 0;
```

### Que esta mal

Un pedido chico pesa igual que uno grande.

Ejemplo:

| Pedido | Pares | Avance |
|---|---:|---:|
| A | 100 | 100% |
| B | 10,000 | 10% |

Promedio simple: `55%`

Promedio correcto por pares: `11%`

### Fix

Usar promedio ponderado:

```ts
const avgProgress = totalCommittedPairs > 0
  ? Math.round(filteredOrders.reduce((sum, o) => sum + o.progress * o.totalPares, 0) / totalCommittedPairs)
  : 0;
```

Mejor: que backend mande `orderPipeline` ya calculado y el frontend solo renderice.

## Finding 5 - Pipeline Por Pedido Usa Pesos Diferentes

Severidad: P2

### Como trabaja hoy

Pipeline por pedido usa:

```ts
alta_pedido: 5
almacen: 10
inyeccion: 30
estabilizacion: 45
aduana: 60
banda: 80
embarque: 100
```

Plan operativo recomendado usa:

```ts
alta_pedido: 14
almacen: 29
inyeccion: 43
estabilizacion: 57
aduana: 71
banda: 86
embarque: 100
```

### Que esta mal

Dos dashboards pueden mostrar avances diferentes para el mismo pedido/lote.

### Fix

Crear una sola fuente de pesos en backend.

Frontend no debe tener pesos propios para KPIs globales.

## Finding 6 - Etapa Dominante Puede Salir Mal

Severidad: P2

### Como trabaja hoy

Frontend calcula etapa dominante por lotes disponibles:

```ts
const orderBatches = tenantBatches.filter(b => b.orderId === o.id);
const stageTallies: Record<string, number> = {};
orderBatches.forEach(b => {
  stageTallies[b.etapaActual || ''] = (stageTallies[b.etapaActual || ''] || 0) + 1;
});
```

### Que esta mal

Cuenta lotes, no pares.

Tambien usa bootstrap limitado.

Un pedido con 1 lote grande en banda y 5 lotes chicos en alta puede aparecer como `alta_pedido`, aunque la mayoria de pares esten en banda.

### Fix

Backend debe calcular etapa dominante por pares:

```sql
row_number() over (
  partition by pedido
  order by sum(pares) desc
)
```

## Finding 7 - Backlog Y Pares Por Etapa Dependen De Bootstrap

Severidad: P2

### Como trabaja hoy

Pipeline por pedido calcula:

- `totalCommittedPairs`
- `totalShippedPairs`
- `totalInProcessPairs`
- `pendingBacklog`
- `pairsByStage`

Todo sale de `tenantBatches`, que viene de bootstrap.

### Que esta mal

Si faltan lotes por el limite 800, backlog y pares por etapa quedan incompletos.

### Fix

Backend debe devolver `orderPipeline` por pedido:

```ts
orderPipeline: Array<{
  id: string;
  cliente: string;
  oc: string | null;
  modelo: string | null;
  color: string | null;
  fechaAlta: string | null;
  fechaCompromiso: string | null;
  totalPares: number;
  shippedPairs: number;
  inProcessPairs: number;
  progress: number;
  avgTimeMin: number | null;
  dominantStage: string;
  risk: 'VENCIDO' | 'ALTO' | 'MEDIO' | 'BAJO';
  pairsByStage: Record<string, number>;
  batchesCount: number;
  daysLeft: number | null;
}>
```

## Finding 8 - Alerts Usan Texto Que Puede Sonar Simulado

Severidad: P3

### Como trabaja hoy

Si no hay alertas, frontend crea:

```ts
Planta Operando Estable
Todas las celdas de inyección, mezclado y banda de recortado operan bajo rangos estándar.
```

### Que esta mal

No viene de FDB. Puede sonar como afirmacion operativa real sin soporte.

### Fix

Si no hay alertas reales, mostrar:

```txt
Sin alertas generadas con datos FDB en el periodo.
```

No afirmar estabilidad si no hay dato.

## Finding 9 - Sync Esta Viejo

Severidad: P0 operativo

### Estado observado

Ultimo sync observado:

```txt
2026-06-10T10:01:15.563Z
```

Fecha actual:

```txt
2026-06-14
```

### Que significa

Aunque el dashboard lea FDB mirror, el mirror no esta al dia. Datos son reales, pero no actuales.

### Fix

Arreglar Windows sync service:

- correr automaticamente
- monitorear `lastSync`
- alertar si stale > 1 hora
- exponer estado en UI

## Plan De Fix

## Fase 1 - Backend Como Fuente De Verdad

Agregar a `/api/erp/operativo`:

- `wipSummary`
- `stagePipeline`
- `orderRisk`
- `orderPipeline`

SQL debe leer FDB completa:

- `tarjetas_viajeras`
- `bigzap_lotes_pedidos`
- `bigzap_pedidos`
- `bigzap_clientes`
- `bigzap_estilos`

No usar bootstrap para ningun total global.

## Fase 2 - Frontend Renderiza, No Recalcula

Dashboard Ejecutivo:

- `Avance Global` usa `wipSummary.globalProgress`
- `Pedidos en Riesgo` usa `orderRisk.totalRisk`
- pipeline usa `stagePipeline`
- top riesgo usa `orderRisk.rows`

Pipeline por Pedido:

- usar `orderPipeline`
- promedio avance ponderado por pares
- backlog desde backend
- etapa dominante desde backend
- riesgo desde backend

## Fase 3 - Bootstrap Solo Para Detalle

Mantener `/api/bootstrap` para:

- abrir lote individual
- tarjetas del pipeline por lote
- busqueda interactiva
- flujos de actualizacion/manual

No usar bootstrap para:

- Avance global
- WIP total
- pedidos en riesgo
- distribucion global por etapa
- backlog total
- ranking global de pedidos

## Fase 4 - Tests

Backend:

- `globalProgress` pondera por pares.
- `stagePipeline` suma 1,371 lotes activos actuales.
- `orderRisk.totalRisk` coincide con SQL directo.
- `orderPipeline.totalPares = sum(lotes_pedidos.pares)`.
- `dominantStage` se calcula por pares, no por numero de lotes.
- rango sin datos devuelve activos `null` para pintar `--`.

Frontend:

- Dashboard no usa `filteredBatches` para `Avance Global`.
- Dashboard no usa `filteredOrders` para `Pedidos en Riesgo`.
- Pipeline Pedido no promedia simple.
- Empty state si `hasPeriodData=false`.

## Fase 5 - QA Produccion

Rangos:

| Rango | Esperado |
|---|---|
| 2026-04-01 -> 2026-04-21 | muestra datos reales |
| 2026-05-01 -> 2026-05-25 | activos `--`, graficas vacias |
| 2025-06-14 -> 2026-06-14 | muestra historico real, con `lastSync` visible |

Checks:

- sin console 401
- sin mocks
- sin textos de simulacion
- Cloud Run responde `/api/erp/operativo`
- Hostinger frontend apunta a API correcta
- Windows sync fresco

## Criterio De Aceptacion

Queda correcto cuando:

- UI `Avance Global` coincide con SQL backend.
- UI `Pedidos en Riesgo` coincide con `orderRisk.totalRisk`.
- UI pipeline por etapa suma el mismo total que FDB activa.
- Pipeline por Pedido usa todos los lotes del pedido, no solo los primeros 800.
- `lastSync` no esta stale.
- Si no hay datos en periodo, activos muestran `--`.
- No hay mocks visibles ni fallback inventado.

