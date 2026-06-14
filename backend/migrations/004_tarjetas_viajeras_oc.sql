-- Surface the customer PO (OC) on the tarjetas_viajeras view.
-- bigzap_pedidos.pedido_cliente ya se sincroniza pero la vista lo descartaba,
-- por lo que el lote (Batch) nunca traia su OC real. Lo agregamos como pedido_oc.

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
  pe.pedido_cliente as pedido_oc,
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
