-- Mirror de BixApp/BigZap (Firebird) para tarjetas viajeras.
-- Las tablas bigzap_* las llena el servicio sync-service/ que corre en el
-- Windows Server junto al ERP. Solo lectura desde el dashboard.

create table if not exists public.bigzap_departamentos (
  codigo text primary key,
  nombre text not null,
  stage_id text,
  orden integer,
  synced_at timestamptz not null default now()
);

create table if not exists public.bigzap_subdeptos (
  codigo text primary key,
  nombre text not null,
  depto_padre text,
  planta text,
  synced_at timestamptz not null default now()
);

create table if not exists public.bigzap_estilos (
  codigo text primary key,
  nombre text,
  linea text,
  vigente boolean,
  synced_at timestamptz not null default now()
);

create table if not exists public.bigzap_clientes (
  codigo text primary key,
  nombre text,
  rfc text,
  clasif text,
  synced_at timestamptz not null default now()
);

create table if not exists public.bigzap_lotes (
  programa integer not null,
  lote integer not null,
  tarjeta text generated always as ((programa)::text || '-' || (lote)::text) stored,
  estilo text,
  piecol text,
  combina text,
  corrida text,
  fecha_programacion date,
  pares integer,
  status_depto text,
  cancelado boolean not null default false,
  fecha_cancelacion date,
  semana_produccion text,
  anio_produccion text,
  planta text,
  subdepto text,
  tarjeta_impresa boolean,
  etiqueta_impresa boolean,
  pares_por_talla jsonb,
  synced_at timestamptz not null default now(),
  primary key (programa, lote)
);
create index if not exists bigzap_lotes_status_idx on public.bigzap_lotes (status_depto);
create index if not exists bigzap_lotes_fecha_idx on public.bigzap_lotes (fecha_programacion);
create index if not exists bigzap_lotes_tarjeta_idx on public.bigzap_lotes (tarjeta);
create index if not exists bigzap_lotes_estilo_idx on public.bigzap_lotes (estilo);

-- Bitacora de escaneos de tarjeta viajera (AVANCE en Firebird).
-- hora_cs = centesimas de segundo desde medianoche, tal como lo guarda BixApp.
create table if not exists public.bigzap_avance (
  programa integer not null,
  lote integer not null,
  depto text not null,
  fecha date not null,
  hora_cs integer not null,
  escaneado_at timestamptz,
  gen_por text,
  subdepto text,
  synced_at timestamptz not null default now(),
  primary key (programa, lote, depto)
);
create index if not exists bigzap_avance_fecha_idx on public.bigzap_avance (fecha);
create index if not exists bigzap_avance_lote_idx on public.bigzap_avance (programa, lote);
create index if not exists bigzap_avance_escaneado_idx on public.bigzap_avance (escaneado_at);
create index if not exists bigzap_avance_lote_escaneado_idx on public.bigzap_avance (programa, lote, escaneado_at desc);

create table if not exists public.bigzap_pedidos (
  folio integer primary key,
  cliente text,
  fecha_pedido date,
  fecha_recepcion date,
  fecha_salida date,
  fecha_cancelacion date,
  pares_pedidos integer,
  pares_facturados integer,
  pedido_cliente text,
  tienda text,
  temporada text,
  synced_at timestamptz not null default now()
);

create table if not exists public.bigzap_lotes_pedidos (
  programa integer not null,
  lote integer not null,
  pedido integer not null,
  renglon integer not null,
  cliente text,
  corrida text,
  pares integer,
  synced_at timestamptz not null default now(),
  primary key (programa, lote, pedido, renglon)
);
create index if not exists bigzap_lotes_pedidos_pedido_idx on public.bigzap_lotes_pedidos (pedido);

-- PTMOV no tiene PK en Firebird y PT_DISTINGUE no es unico:
-- id = md5 de la llave natural completa, calculado por el sync.
create table if not exists public.bigzap_pt_movimientos (
  id text primary key,
  fecha_movimiento date,
  movto text,
  tipo text,
  docto text,
  programa integer,
  lote integer,
  pedido integer,
  renglon integer,
  calidad integer,
  pares integer,
  distingue bigint,
  observa text,
  synced_at timestamptz not null default now()
);
create index if not exists bigzap_ptmov_fecha_idx on public.bigzap_pt_movimientos (fecha_movimiento);
create index if not exists bigzap_ptmov_lote_idx on public.bigzap_pt_movimientos (programa, lote);

create table if not exists public.bigzap_sync_state (
  tabla text primary key,
  watermark text,
  updated_at timestamptz not null default now()
);

-- Catalogo de departamentos con mapeo a las etapas del dashboard.
-- El sync solo actualiza "nombre"; stage_id/orden se administran aqui.
insert into public.bigzap_departamentos (codigo, nombre, stage_id, orden) values
  ('01', 'PROGRAMACION', 'alta_pedido', 1),
  ('10', 'ALMACEN', 'almacen', 2),
  ('15', 'INYECCION', 'inyeccion', 3),
  ('20', 'CALIDAD', 'aduana', 4),
  ('25', 'ADUANA', 'aduana', 5),
  ('30', 'BANDA', 'banda', 6),
  ('35', 'BANDA SALIDA', 'banda', 7),
  ('39', 'SALIDA TERCERAS', 'banda', 8),
  ('40', 'EMBARQUE', 'embarque', 9),
  ('50', 'FACTURACION', 'embarque', 10)
on conflict (codigo) do nothing;

-- Vista en vocabulario del dashboard: zona previa / zona actual / ultimo escaneo.
-- Una sola pasada de window function + agregacion para mantenerla rapida.
-- DROP previo: CREATE OR REPLACE no permite cambiar el orden/nombre de columnas
-- entre versiones del esquema.
drop view if exists public.tarjetas_viajeras;
create view public.tarjetas_viajeras as
with mov as (
  select programa, lote, depto, escaneado_at,
         row_number() over (partition by programa, lote order by escaneado_at desc) as rn
  from public.bigzap_avance
),
ult as (
  select programa, lote,
         max(depto) filter (where rn = 1) as zona_actual,
         max(escaneado_at) filter (where rn = 1) as ultimo_escaneo,
         max(depto) filter (where rn = 2) as zona_previa
  from mov
  where rn <= 2
  group by programa, lote
)
select
  l.tarjeta,
  l.programa,
  l.lote,
  l.estilo,
  e.nombre as estilo_nombre,
  l.piecol,
  l.combina,
  l.corrida,
  l.pares,
  l.fecha_programacion,
  l.status_depto,
  ds.nombre as status_depto_nombre,
  ds.stage_id,
  u.zona_actual,
  dact.nombre as zona_actual_nombre,
  u.zona_previa,
  dprev.nombre as zona_previa_nombre,
  u.ultimo_escaneo,
  l.cancelado,
  l.tarjeta_impresa,
  l.pares_por_talla,
  ped.pedido as pedido_folio,
  ped.cliente as cliente_codigo,
  c.nombre as cliente_nombre,
  pe.fecha_salida as pedido_fecha_salida,
  l.synced_at
from public.bigzap_lotes l
left join ult u on u.programa = l.programa and u.lote = l.lote
left join public.bigzap_departamentos ds on ds.codigo = l.status_depto
left join public.bigzap_departamentos dact on dact.codigo = u.zona_actual
left join public.bigzap_departamentos dprev on dprev.codigo = u.zona_previa
left join public.bigzap_estilos e on e.codigo = l.estilo
left join lateral (
  select lp.pedido, lp.cliente
  from public.bigzap_lotes_pedidos lp
  where lp.programa = l.programa and lp.lote = l.lote
  order by lp.pedido, lp.renglon
  limit 1
) ped on true
left join public.bigzap_pedidos pe on pe.folio = ped.pedido
left join public.bigzap_clientes c on c.codigo = ped.cliente;

alter table public.bigzap_departamentos enable row level security;
alter table public.bigzap_subdeptos enable row level security;
alter table public.bigzap_estilos enable row level security;
alter table public.bigzap_clientes enable row level security;
alter table public.bigzap_lotes enable row level security;
alter table public.bigzap_avance enable row level security;
alter table public.bigzap_pedidos enable row level security;
alter table public.bigzap_lotes_pedidos enable row level security;
alter table public.bigzap_pt_movimientos enable row level security;
alter table public.bigzap_sync_state enable row level security;

grant all on all tables in schema public to service_role;
