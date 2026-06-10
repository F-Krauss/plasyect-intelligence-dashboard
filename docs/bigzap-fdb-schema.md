# BIGZAP.FDB — Esquema de Tarjetas Viajeras y Estrategia de Extracción

Análisis de la base de datos del ERP **BixApp / Big Zap** (`BIGZAP.FDB`) realizado sobre la copia
local del 2026-04 (167 MB). El objetivo: identificar las tablas que modelan las **tarjetas
viajeras** (lotes de pares que se escanean al pasar de un área a otra) y definir cómo extraer esa
información hacia PostgreSQL **sin modificar la base original**.

## Datos técnicos del archivo

| Propiedad | Valor |
|---|---|
| Motor | Firebird **3.0** (ODS 12.0) |
| Tamaño de página | 8 192 bytes |
| Tablas de usuario | 302 (ERP completo: facturación, nómina, CxP, producción…) |
| Rango de datos de producción | 2024-04-09 → 2026-04-21 |
| Conexión usada en el análisis | contenedor Docker `jacobalberty/firebird:v3.0`, `isql` embebido |

> ⚠️ El servidor de producción (Windows Server 2022) corre Firebird 3.x en el puerto 3050.
> Cualquier cliente que usemos debe hablar el protocolo de FB 3 (Srp o Legacy auth).

## Modelo de la tarjeta viajera

La **tarjeta viajera es el lote**: la identidad es el par `(PROGRAMA, LOTE)`. BixApp imprime una
tarjeta por lote (registro en `LOTIMP`, banderas `LC_IMPRESO`/`LC_IMPETI`) y cada vez que la
tarjeta se escanea al entrar a un departamento se inserta una fila en `AVANCE` y se actualiza
`LOTCAB.LC_STATUS` con el departamento actual.

```
PEDIDOS ──< LOTDET >── LOTCAB ──< AVANCE >── DEPA / SUBDEPTO
 (venta)    (reparto)   (lote /     (escaneos     (catálogo de
                         tarjeta)    por depto)    departamentos)
                            │
                            └──< PTMOV / PTLOTCAB  (producto terminado, embarques)
```

### Tablas principales

#### `LOTCAB` — cabecera de lote (≈ 37 000 filas)
PK `(LC_PROG, LC_LOTE)`.

| Campo | Significado |
|---|---|
| `LC_PROG` NUMERIC(7) | Folio del programa de producción |
| `LC_LOTE` NUMERIC(7) | Número de lote (consecutivo dentro de la planta) |
| `LC_ESTILO` CHAR(20) | Estilo (FK a `ESTILO.ES_CODEST`) |
| `LC_PIECOL` CHAR(9) | Código piel/color |
| `LC_COMBINA` CHAR(5) | Combinación (FK a `COMBINA`) |
| `LC_CORRIDA` CHAR(2) | Corrida de tallas |
| `LC_FECPRO` DATE | Fecha de programación/producción (indexada) |
| `LC_PARLOT` NUMERIC(5) | **Pares del lote** (modas reales: 12 y 20 pares) |
| `LC_STATUS` CHAR(2) | **Departamento actual** del lote (ver `DEPA`; `99` = especial/cerrado) |
| `LC_CANCELA` CHAR(2) | `AC` = activo, `CA` = cancelado |
| `LC_FECCAN` DATE | Fecha de cancelación |
| `LC_SEMPRO/LC_ANOPRO` | Semana/año de producción |
| `LC_PTO01..LC_PTO30` | Pares por punto/talla de la corrida |
| `LC_IMPRESO/LC_IMPETI` CHAR(1) | Tarjeta viajera / etiqueta impresa (S/N) |

Distribución de `LC_STATUS` en la copia analizada: `01`=583, `15`=406, `25`=294, `30`=88,
`40`=11 410, `50`=24 145, `99`=97.

#### `AVANCE` — bitácora de escaneos (≈ 199 000 filas) ← **la tabla clave**
PK `(AV_PROGRAMA, AV_LOTE, AV_DEPTO)`: una fila por lote por departamento, creada al escanear.

| Campo | Significado |
|---|---|
| `AV_PROGRAMA, AV_LOTE` | FK al lote (`LOTCAB`) |
| `AV_DEPTO` CHAR(2) | Departamento al que **entró** el lote |
| `AV_FECHA` DATE | Fecha del escaneo (índice `AV_TKAVANCE`) |
| `AV_HORA` INTEGER | Hora del escaneo en **centésimas de segundo desde medianoche** (máx observado 8 637 934 < 8 640 000). `hora = AV_HORA / 100` segundos del día |
| `AV_GENPOR` CHAR(2) | "Generado por" (código de origen/estación; semántica por confirmar con el proveedor) |
| `AV_SUBDEPTO` CHAR(3) | Subdepartamento (turnos de inyección, banda entrada/salida) |

La **zona previa y zona actual** de un lote se derivan ordenando sus filas de `AVANCE` por
`(AV_FECHA, AV_HORA)`: la última fila es la zona actual, la penúltima la zona previa.

#### `DEPA` — catálogo de departamentos (8 filas)

| Código | Departamento | Equivalente en el dashboard |
|---|---|---|
| `01` | PROGRAMACION | alta_pedido |
| `10` | ALMACEN | almacen |
| `15` | INYECCION | inyeccion |
| `20` | CALIDAD | aduana (calidad) |
| `25` | ADUANA | aduana |
| `30` | BANDA | banda |
| `40` | EMBARQUE | embarque |
| `50` | FACTURACION | entregado |

En `AVANCE` aparecen además códigos **sin fila en `DEPA`**: `35` (= BANDA SALIDA según
`SUBDEPTO.SD_DEPPAD`), `39` (aparece después de 35; hipótesis: salida de tercera/calidad final)
y `''` (filas legadas de 2025-07). El sync debe tolerar códigos desconocidos.

#### `SUBDEPTO` — subdepartamentos (6 filas)
`201/202/203` = INYECCION T-1/T-2/T-3 (turnos), `250` = CALIDAD, `301` = BANDA ENTRADA,
`351` = BANDA SALIDA (con `SD_DEPPAD = 35`).

#### `LOTDET` — reparto lote→pedido (≈ 37 000 filas)
PK `(LD_PROG, LD_LOTE, LD_PEDIDO, LD_REN)`. Liga cada lote con el pedido de venta, renglón,
cliente (`LD_CODCTE`), corrida y pares (incluye `LD_PTO01..30` por talla).

#### `PEDIDOS` — pedidos de venta (548 filas)
PK `PE_FOLPED`. Cliente, fechas de pedido/recepción/salida, `PE_PARPED` (pares pedidos),
`PE_PARFAC` (pares facturados), pedido del cliente (`PE_PEDCTE`), tienda, temporada.

#### `PTMOV` — movimientos de producto terminado (≈ 25 000 filas)
Sin PK declarada (¡ojo!): `PT_DISTINGUE` **no es único** (24 879 distintos de 24 888).
Movimientos observados: `PT_MOVTO=70` entrada a PT (13 983 filas), `71/P` salida contra pedido
(7 031), `71/F` salida facturada (3 868). `PT_CALIDAD` (1=primera; valores >1 = segundas/terceras),
`PT_PARES`, pares por talla, y referencia a `(PT_PROG, PT_LOTE, PT_PEDIDO, PT_RENGLON)`.
Índice útil: `(PT_FECMOV, PT_MOVTO)`.

#### Tablas de soporte
- `ESTILO` — catálogo de estilos/modelos (nombre, línea, horma, foto…).
- `LOTIMP` — log de impresión de tarjetas viajeras `(LI_PROGRAMA, LI_LOTE, LI_FECHA)`.
- `USUARIOS` — usuarios BixApp (`US_USUARIO`, `US_NOMBRE`).
- `AREAS` — solo 2 filas (INYECCION, BANDA); se usa para producción por área.
- Vacías en esta planta (no usarlas): `BITTRASP`, `UBICA`, `DESTAJO`, `TURNOS`, `ATADOS`.
- Respaldos del proveedor con fecha en el nombre (`LOTCAB210125`, `PE010120`…): **ignorar**.

## Queries de extracción

Todas son `SELECT` puros sobre índices existentes; ninguna modifica datos.

```sql
-- 1) Lotes / tarjetas viajeras (incremental por fecha de programación o lotes tocados)
SELECT LC_PROG, LC_LOTE, LC_ESTILO, LC_PIECOL, LC_COMBINA, LC_CORRIDA,
       LC_FECPRO, LC_PARLOT, LC_STATUS, LC_CANCELA, LC_FECCAN,
       LC_SEMPRO, LC_ANOPRO, LC_PLANTA, LC_SUBDEPTO, LC_IMPRESO, LC_IMPETI,
       LC_PTO01, LC_PTO02, ..., LC_PTO30
FROM LOTCAB
WHERE LC_FECPRO >= ? OR LC_FECCAN >= ?;

-- 2) Escaneos de tarjeta (incremental; índice AV_TKAVANCE sobre AV_FECHA)
SELECT AV_PROGRAMA, AV_LOTE, AV_DEPTO, AV_FECHA, AV_HORA, AV_GENPOR, AV_SUBDEPTO
FROM AVANCE
WHERE AV_FECHA >= ?;        -- watermark - margen de 2 días; upsert idempotente por PK

-- 3) Reparto lote → pedido (por lotes tocados)
SELECT LD_PROG, LD_LOTE, LD_PEDIDO, LD_REN, LD_CODCTE, LD_CORRIDA, LD_PARES
FROM LOTDET WHERE LD_PROG = ? AND LD_LOTE = ?;

-- 4) Pedidos (tabla chica: refresco completo en cada ciclo)
SELECT PE_FOLPED, PE_CODCTE, PE_FECPED, PE_FECREC, PE_FECSAL, PE_FECCAN,
       PE_PARPED, PE_PARFAC, PE_PEDCTE, PE_TIENDA, PE_TEMPORADA
FROM PEDIDOS;

-- 5) Producto terminado / embarques (incremental; índice (PT_FECMOV, PT_MOVTO))
SELECT PT_FECMOV, PT_MOVTO, PT_TIPO, PT_DOCTO, PT_PROG, PT_LOTE, PT_PEDIDO,
       PT_RENGLON, PT_CALIDAD, PT_PARES, PT_DISTINGUE, PT_OBSERVA
FROM PTMOV
WHERE PT_FECMOV >= ?;

-- 6) Catálogos (cada ciclo; son diminutos)
SELECT DP_CODDEP, DP_DESCRIP FROM DEPA;
SELECT SD_CODIGO, SD_DESCRIP, SD_DEPPAD, SD_PLANTA FROM SUBDEPTO;
SELECT ES_CODEST, ES_NOMEST, ES_LINEA, ES_VIGENTE FROM ESTILO;
```

Conversión de hora: `timestamp = AV_FECHA + (AV_HORA / 100) segundos`.

## Estrategia de publicación (sin tocar la base original)

**Restricción**: no se permite modificar la FDB → quedan descartados triggers con `POST_EVENT`
y la creación de `GRANT`s dentro de la base. La detección de cambios se hace por **polling
incremental** + un **watcher opcional del archivo** para latencia casi inmediata:

1. **Servicio de Windows** (`sync-service/`, Node.js) corriendo en el mismo servidor que BixApp.
2. Se conecta a Firebird por TCP (`localhost:3050`) con **transacciones de solo lectura**
   (`ISOLATION_READ_COMMITTED_READ_ONLY`). Así es exactamente como leen los reportes del propio
   BixApp; el motor no altera los datos de usuario.
3. Cada `SYNC_INTERVAL` (default 15 s) consulta los watermarks (`AV_FECHA`, `PT_FECMOV`,
   `LC_FECPRO`) y trae solo lo nuevo. Además, si se configura `FDB_WATCH_PATH`, el servicio
   observa el `mtime` de `BIGZAP.FDB` y dispara un ciclo inmediato al detectar escritura
   (con debounce), logrando "publicar en cada actualización" sin tocar el ERP.
4. Hace `INSERT ... ON CONFLICT ... DO UPDATE` (upsert idempotente) en las tablas espejo
   `bigzap_*` de PostgreSQL/Supabase (migración `002_bigzap_tarjetas.sql`) y registra cada
   corrida en `erp_sync_runs`.
5. Un refresco completo nocturno (configurable) reconcilia cualquier fila perdida.

### Credenciales en producción
- Opción A (recomendada para no tocar nada): usar `SYSDBA` o el usuario que ya usa BixApp,
  con transacciones read-only. Cero cambios en la base.
- Opción B (menor privilegio): `CREATE USER dashboard_ro ...` en el servidor y `GRANT SELECT`
  sobre las 8 tablas. *Nota*: los `GRANT` se guardan dentro de la FDB (tabla
  `RDB$USER_PRIVILEGES`); si la regla "no modificar" es estricta, usar la opción A.

### Identidad de la tarjeta en el dashboard
`tarjeta = "{PROG}-{LOTE}"` (p. ej. `5498-40638`). El campo `Batch.tarjetaViajera` del frontend
se llena con ese folio; `etapaActual` se mapea desde `LC_STATUS`/último `AVANCE` con la tabla de
equivalencias de arriba.
