# Plasyect Dashboard – Structured Change Log

This document organizes the requested changes for **Plasyect v2 dashboards** by module. Each section describes what to add, remove, or adjust. Use these notes to guide development work.

## Pipeline por lote

- **Alta de pedido**
  - When confirming a new order, the **Lote** field should behave the same as **Tarjeta Viajera**.
- **Critical risk**: Remove the **“Riesgo crítico”** indicator for now.
- **Lotes detenidos**: Remove the section showing stopped lots.
- **Embarcados hoy**: Display only lots that reached the **“Embarque”** stage today.
- **Cuello de botella**: Identify the station with the longest processing time or highest pending counts.
- **KPIs for vencidos**: Add KPIs showing expired lots (**lotes vencidos**).
- **Mini tarjeta**: The mini-card in the pipeline should **not** display progress; keep progress indicators only on the right side.
- **Engineer and Move button**: Remove the engineer label and the **Move** button from the mini-card.
- **Scanner logic**: When a lot is scanned, it should automatically advance to the next stage in the pipeline.
- **Estabilización**: Remove the **Estabilización** phase from this pipeline.
- **Reporte de inventario**: Provide an inventory report view.
- **Locations**: Show both **zona previa** and **zona actual** for each lot.
- **Status**: Add **Status = Entregado**.

## Pipeline por pedido

- **Backlog definition**: Backlog should be **En proceso - Embarcados**.
- **Remove metrics**: Drop **Avance ponderado** and **SLA en riesgo** from this pipeline.
- **Pedidos vencidos**: Identify orders past their delivery date.
- **First chart**: Put **Entrega** at the top and **Almacén** at the bottom.
- **Second chart**: Change the label to **Cantidad de pares producida por día**.
- **Right-hand table**: Replace **pares totales de pedido** with **pares entregados**.
- **Risk of deviation**: Remove **Riesgo de desviación por hora**.

## Sábana de datos

- Remove **tiempo promedio**.
- Remove **etapa dominante**.
- Keep **riesgo** information.

## Panel diagnóstico

- Remove **etapa dominante**.
- Keep **alertas de calidad**.

## Rango de riesgo

- This module must display risk information specific to the selected order.

## Producción por área

- Remove **Estabilización** from filters.
- Add **Entregas**.
- Add **Salidas de tercera**.

## KPIs dashboard

- Remove **Sin registro** KPI.
- Make charts larger.
- Remove **rendimiento de operadores y supervisores**.
- Remove **Eficiencia**.
- Keep **OEE promedio por turno**.

## Bitácora de control por hora

- Group the hourly control log by **Tarjeta Viajera**.

## Modelos y productos

- Remove **Max lead time** KPI.
- Remove **Participación líder** KPI.
- Make charts larger.
- Remove **Productividad media por molde** chart.
- Add all stations to the operational table.
- Change averages to accumulated values where applicable.
- Remove **reproceso** from the table.
- Remove **status** from the table.
- Add **Cumplimiento promedio por pedido**.
- Add a button to generate AI insights from the current data.

## Aduana de calidad y logística

- Remove the following modules from the sidebar:
  - **Aduana de calidad**
  - **Área inyección**
  - **Banda y detallado**
  - **Aduana liberación**
  - **Embarque y logística**
- Remove the button to **registrar incidencia física**.

## General / Pending

- Dashboard for **OCR** and **EVA validation** remains pending.
- Refactor the entire page to match the **MÍA** design model.
- Implement **OCR por turno**.
- Use **Tarjeta Viajera** for real-time tracking.
