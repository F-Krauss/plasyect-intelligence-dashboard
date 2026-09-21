-- Producto terminado (finished goods): PTLOTCAB / PTLOTDET del FDB BixApp.
-- Espejo de LOTCAB/LOTDET pero para lotes ya terminados/embarcados; se usa para
-- KPIs de inventario de PT, embarques y detalle por pedido. Se llena via sync-service
-- (upsertJson), por eso la tabla debe existir antes de la primera corrida.

create table if not exists public.bigzap_pt_lotes (
  programa integer not null,
  lote integer not null,
  estilo text,
  piecol text,
  combina text,
  corrida text,
  fecha_pt date,
  observacion text,
  pares integer,
  status text,
  calidad integer,
  disponible text,
  precio_dir numeric,
  almacen text,
  pasillo text,
  tarima text,
  pares_por_talla jsonb,
  synced_at timestamptz not null default now(),
  primary key (programa, lote)
);

create index if not exists bigzap_pt_lotes_fecha_idx on public.bigzap_pt_lotes (fecha_pt);
create index if not exists bigzap_pt_lotes_status_idx on public.bigzap_pt_lotes (status);

create table if not exists public.bigzap_pt_lotes_detalle (
  programa integer not null,
  lote integer not null,
  pedido integer not null,
  renglon integer not null,
  cliente text,
  corrida text,
  pares integer,
  calidad integer,
  disponible text,
  origen text,
  modelo text,
  pares_por_talla jsonb,
  synced_at timestamptz not null default now(),
  primary key (programa, lote, pedido, renglon)
);

create index if not exists bigzap_pt_lotes_detalle_pedido_idx on public.bigzap_pt_lotes_detalle (pedido);

alter table public.bigzap_pt_lotes enable row level security;
alter table public.bigzap_pt_lotes_detalle enable row level security;
grant all on all tables in schema public to service_role;
