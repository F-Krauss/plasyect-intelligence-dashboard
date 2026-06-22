create table if not exists public.bigzap_combinaciones (
  codigo text primary key,
  nombre text,
  synced_at timestamptz not null default now()
);

insert into public.bigzap_departamentos (codigo, nombre, stage_id, orden) values
  ('50', 'FACTURACION', 'facturacion', 10)
on conflict (codigo) do update set
  nombre = excluded.nombre,
  stage_id = excluded.stage_id,
  orden = excluded.orden;

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
  coalesce(l.combina, l.piecol) as color_codigo,
  cb.nombre as color_nombre,
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
  pe.pedido_cliente as pedido_oc,
  pe.fecha_salida as pedido_fecha_salida,
  l.synced_at
from public.bigzap_lotes l
left join ult u on u.programa = l.programa and u.lote = l.lote
left join public.bigzap_departamentos ds on ds.codigo = l.status_depto
left join public.bigzap_departamentos dact on dact.codigo = u.zona_actual
left join public.bigzap_departamentos dprev on dprev.codigo = u.zona_previa
left join public.bigzap_estilos e on e.codigo = l.estilo
left join public.bigzap_combinaciones cb on cb.codigo = coalesce(l.combina, l.piecol)
left join lateral (
  select lp.pedido, lp.cliente
  from public.bigzap_lotes_pedidos lp
  where lp.programa = l.programa and lp.lote = l.lote
  order by lp.pedido, lp.renglon
  limit 1
) ped on true
left join public.bigzap_pedidos pe on pe.folio = ped.pedido
left join public.bigzap_clientes c on c.codigo = ped.cliente;

alter table public.bigzap_combinaciones enable row level security;
grant all on all tables in schema public to service_role;
