-- Composite index for depto-based joins + date-range scans in production queries.
-- relevant_lots CTE uses escaneado_at range; scans CTE then joins on (programa, lote).
create index if not exists bigzap_avance_depto_escaneado_idx
  on public.bigzap_avance (depto, escaneado_at)
  where escaneado_at is not null;

-- Covering index for lot_last_scan CTE: max(escaneado_at) per (programa, lote).
-- bigzap_avance_lote_escaneado_idx already covers this but this one drops nulls.
create index if not exists bigzap_avance_lote_scan_nn_idx
  on public.bigzap_avance (programa, lote, escaneado_at desc)
  where escaneado_at is not null;
