# FDB Pipeline, Risk, and Progress Audit

## Summary

Los datos base de Pipeline, Pedidos en riesgo y Avance global vienen de FDB, pero parte de la logica actual calcula KPIs globales en frontend usando `/api/bootstrap`.

Eso no es suficiente para KPIs completos porque `/api/bootstrap` esta limitado por `BIGZAP_BATCH_LIMIT=800`, mientras FDB tiene mas lotes activos.

Conclusion: la fuente es real, pero algunos calculos no son confiables para totales globales. Deben moverse a backend SQL usando la FDB mirror completa.

## Current Data Flow

### `/api/erp/operativo`

Fuente principal nueva para datos operativos reales:

- `meta`
- `active`
- `productionHourly`
- `quality`
- `movements`
- `models`
- `catalogs`
- `dailyProduction`

Este endpoint consulta FDB mirror directamente via Postgres.

### `/api/bootstrap`

Fuente historica del dashboard para:

- `orders`
- `batches`
- `machines`
- `bands`
- `defects`
- `audits`

Para `orders` y `batches`, bootstrap usa FDB mirror, pero solo trae una muestra limitada:

```ts
BIGZAP_BATCH_LIMIT=800
```

Problema: actualmente FDB tiene `1,371` lotes activos, pero bootstrap solo entrega `800`.

## Findings

## P1 - Avance Global Incorrecto

### Como funciona ahora

Frontend calcula `Avance Global` usando `filteredBatches`:

```ts
const activeBatchesForProgress = filteredBatches.filter(b => !isDeliveredBatch(b));
const totalParesForProgress = activeBatchesForProgress.reduce((sum, b) => sum + getBatchPairs(b), 0);
const sumAvancePares = activeBatchesForProgress.reduce((sum, b) => sum + ((b.porcentajeAvance || 0) * getBatchPairs(b)), 0);
const kpiGlobalProgress = totalParesForProgress > 0 ? Math.round(sumAvancePares / totalParesForProgress) : 0;
```

### Problema

`filteredBatches` viene de `/api/bootstrap`, no de la FDB completa.

Como bootstrap esta truncado a `800` lotes, el avance ponderado no representa la planta completa.

### Evidencia

SQL directo sobre FDB:

- lotes activos: `1,371`
- pares activos: `80,069`
- avance ponderado real: `27%`

UI actual:

- avance global: `52%`

### Fix

Calcular `globalProgress` en backend con SQL completo:

```sql
sum(pares * avance_etapa) / sum(pares)
```

El frontend solo debe renderizar el valor recibido.

## P1 - Pipeline Por Etapa Incompleto

### Como funciona ahora

Frontend agrupa `filteredBatches` por etapa:

```ts
const pipelineStages = STAGES.map(st => {
  const stageBatches = filteredBatches.filter(b => getBatchStageId(b) === st.id);
  const stageLotesCount = stageBatches.length;
  const stageParesCount = stageBatches.reduce((sum, b) => sum + getBatchPairs(b), 0);
});
```

### Problema

Usa bootstrap limitado. Por eso el pipeline puede mostrar distribucion incompleta.

### Evidencia FDB Completa

Lotes activos reales:

| Etapa | Lotes | Pares |
|---|---:|---:|
| alta_pedido | 583 | 56,624 |
| inyeccion | 406 | 12,086 |
| aduana | 294 | 8,971 |
| banda | 88 | 2,388 |

Total:

- `1,371` lotes
- `80,069` pares

### Fix

Agregar `stagePipeline` a `/api/erp/operativo`:

```ts
stagePipeline: Array<{
  stageId: string;
  stageName: string;
  batches: number;
  pairs: number;
  avgMinutes: number | null;
  saturation: 'OPTIMO' | 'SATURADO' | 'CRITICO';
}>
```

## P2 - Pedidos En Riesgo Mezclan Logica

### Como funciona ahora

KPI:

```ts
const kpiOrdersInRiskCount = filteredOrders.filter(o => o.riesgoEntrega === 'ALTO' || o.riesgoEntrega === 'VENCIDO').length;
```

Tabla:

```ts
const daysLeft = Math.ceil((commitment.getTime() - riskReferenceDate.getTime()) / (1000 * 60 * 60 * 24));
const computedRisk = getRiskFromDays(daysLeft);
```

### Problema

Hay dos fuentes de verdad:

- `riesgoEntrega` calculado en backend mapper
- `computedRisk` recalculado en frontend

Puede dar diferencias si:

- cambia la fecha seleccionada
- el pedido esta cerrado
- el bootstrap esta truncado
- hay lotes faltantes del pedido

### Evidencia

SQL directo sobre FDB hoy:

- pedidos abiertos: `43`
- pedidos vencidos: `43`
- pedidos en alto riesgo: `0`
- total riesgo: `43`

La cifra actual `43` cuadra, pero por accidente de datos actuales. La logica sigue siendo fragil.

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

Frontend debe usar esa estructura sin recalcular riesgo.

## P2 - Pipeline Por Pedido Promedia Mal

### Como funciona ahora

Frontend calcula avance por pedido y luego promedio simple:

```ts
const avgProgress = filteredOrders.length > 0
  ? Math.round(filteredOrders.reduce((sum, o) => sum + o.progress, 0) / filteredOrders.length)
  : 0;
```

### Problema

Un pedido chico pesa igual que uno grande.

Ejemplo:

- Pedido A: 10 pares, 100%
- Pedido B: 10,000 pares, 0%

Promedio simple:

- `50%`

Promedio real ponderado:

- casi `0%`

### Fix

Usar ponderado por pares:

```ts
sum(totalPares * progress) / sum(totalPares)
```

Mejor: calcularlo en backend SQL dentro de `orderPipeline`.

## P2 - Etapa Dominante Puede Ser Falsa

### Como funciona ahora

Frontend calcula `dominantStage` usando lotes disponibles:

```ts
const orderBatches = tenantBatches.filter(b => b.orderId === o.id);
```

### Problema

Si bootstrap no trae todos los lotes del pedido, la etapa dominante puede salir equivocada.

### Fix

Backend debe calcular etapa dominante por pedido usando todos los lotes:

```sql
row_number() over (
  partition by pedido
  order by sum(pares) desc
)
```

## Correct Target Architecture

## Backend

Extender `GET /api/erp/operativo` con:

```ts
interface ErpOperationalResponse {
  meta: ...
  active: ...
  wipSummary: {
    activeOrders: number | null;
    activeBatches: number | null;
    activePairs: number | null;
    globalProgress: number | null;
  };
  stagePipeline: StagePipelineRow[];
  orderRisk: OrderRiskSummary;
  orderPipeline: OrderPipelineRow[];
  productionHourly: ...
  quality: ...
  movements: ...
  models: ...
  catalogs: ...
  dailyProduction: ...
}
```

## Frontend

Dashboard Ejecutivo debe dejar de calcular estos globales con `filteredBatches`:

- `Avance Global`
- `Pipeline por etapa`
- `Pedidos en riesgo`
- `Top pedidos activos con mayor riesgo`

Pipeline por Pedido debe dejar de calcular estos globales con bootstrap:

- backlog
- avance promedio
- etapa dominante
- riesgo
- pares por etapa

Debe consumir:

- `wipSummary`
- `stagePipeline`
- `orderRisk`
- `orderPipeline`

## SQL Mapping Proposed

### Stage mapping

```sql
case
  when stage_id in ('alta_pedido','almacen','inyeccion','estabilizacion','aduana','banda','embarque') then stage_id
  when status_depto = '01' then 'alta_pedido'
  when status_depto = '10' then 'almacen'
  when status_depto = '15' then 'inyeccion'
  when status_depto in ('20','25') then 'aduana'
  when status_depto in ('30','35','39') then 'banda'
  when status_depto in ('40','50') then 'embarque'
  else 'inyeccion'
end
```

### Progress weights

```sql
case stage_id
  when 'alta_pedido' then 14
  when 'almacen' then 29
  when 'inyeccion' then 43
  when 'estabilizacion' then 57
  when 'aduana' then 71
  when 'banda' then 86
  when 'embarque' then 100
end
```

### Active WIP filter

```sql
where cancelado = false
  and coalesce(status_depto, '') not in ('40','50')
```

### Global progress

```sql
round(sum(pares * progress_weight)::numeric / nullif(sum(pares), 0))
```

### Risk

```sql
case
  when delivered_pairs >= total_pairs then 'BAJO'
  when fecha_salida < current_date then 'VENCIDO'
  when fecha_salida < current_date + interval '3 days' then 'ALTO'
  when fecha_salida < current_date + interval '7 days' then 'MEDIO'
  else 'BAJO'
end
```

## Test Plan

Backend tests:

- `wipSummary.activeBatches = 1371`
- `wipSummary.activePairs = 80069`
- `wipSummary.globalProgress = 27`
- sum of `stagePipeline.pairs = 80069`
- sum of `stagePipeline.batches = 1371`
- `orderRisk.totalRisk = 43`
- no-data range returns `null` active/global progress for active KPIs

Frontend checks:

- Dashboard Ejecutivo shows `27%` avance global for current full FDB range.
- Pipeline stage cards sum to `80,069` active pairs.
- Pedidos en riesgo card and table both show same risk source.
- Pipeline por Pedido average progress is weighted by pairs.
- No console errors or 401s.

## Final Recommendation

No usar `/api/bootstrap` para KPIs globales.

Usar `/api/bootstrap` solo para:

- detalle de lote/tarjeta
- busqueda local
- acciones/manual workflows

Usar `/api/erp/operativo` para:

- totales
- KPIs
- riesgo
- avance
- pipeline
- historicos

