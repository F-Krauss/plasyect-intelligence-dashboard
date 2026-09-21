create table if not exists public.bigzap_programacion_renglones (
  pedido integer not null,
  renglon integer not null,
  entrega date,
  fecha_salida date,
  fecha_cancelacion date,
  fecha_programacion date,
  estilo text,
  piecol text,
  combina text,
  corrida text,
  cliente text,
  pedido_cliente text,
  pares_renglon integer,
  pares_programar integer,
  pares_aprogramados integer,
  liberado boolean,
  status text,
  synced_at timestamptz not null default now(),
  primary key (pedido, renglon)
);

create index if not exists bigzap_programacion_fecha_idx
  on public.bigzap_programacion_renglones (fecha_programacion);

alter table public.bigzap_programacion_renglones enable row level security;
grant all on all tables in schema public to service_role;
