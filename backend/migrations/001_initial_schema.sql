create extension if not exists pgcrypto;

create table if not exists public.tenants (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_users (
  id text primary key,
  email text not null unique,
  role text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.clients (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.models (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  tenant_id text not null references public.tenants(id),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.batches (
  id text primary key,
  tenant_id text not null references public.tenants(id),
  order_id text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.machines (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bands (
  id text primary key,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.quality_defects (
  id text primary key,
  tenant_id text,
  batch_id text,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id text primary key,
  tenant_id text not null references public.tenants(id),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ocr_documents (
  id text primary key,
  tenant_id text not null references public.tenants(id),
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ocr_fields (
  id uuid primary key default gen_random_uuid(),
  document_id text not null references public.ocr_documents(id) on delete cascade,
  field_key text not null,
  value text,
  confidence numeric,
  corrected boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, field_key)
);

create table if not exists public.erp_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'big_zap_fdb',
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text,
  payload jsonb not null default '{}'::jsonb
);

create table if not exists public.tarjetas_viajeras_cache (
  id text primary key,
  source text not null default 'big_zap_fdb',
  payload jsonb not null,
  last_synced_at timestamptz not null default now()
);

create index if not exists orders_tenant_idx on public.orders (tenant_id);
create index if not exists batches_tenant_idx on public.batches (tenant_id);
create index if not exists batches_order_idx on public.batches (order_id);
create index if not exists defects_batch_idx on public.quality_defects (batch_id);
create index if not exists audits_tenant_idx on public.audit_logs (tenant_id);
create index if not exists ocr_documents_tenant_idx on public.ocr_documents (tenant_id);

alter table public.tenants enable row level security;
alter table public.app_users enable row level security;
alter table public.clients enable row level security;
alter table public.models enable row level security;
alter table public.orders enable row level security;
alter table public.batches enable row level security;
alter table public.machines enable row level security;
alter table public.bands enable row level security;
alter table public.quality_defects enable row level security;
alter table public.audit_logs enable row level security;
alter table public.ocr_documents enable row level security;
alter table public.ocr_fields enable row level security;
alter table public.erp_sync_runs enable row level security;
alter table public.tarjetas_viajeras_cache enable row level security;

revoke all on all tables in schema public from anon, authenticated;
grant usage on schema public to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

insert into public.tenants (id, payload) values
  ('plasyect_matriz', '{"id":"plasyect_matriz","name":"Plasyect Matriz - EVA Sandalias","location":"Leon, Gto. Planta Central","primaryColor":"indigo"}'),
  ('plasyect_suelas', '{"id":"plasyect_suelas","name":"Plasyect Division Suelas","location":"San Francisco del Rincon, Gto.","primaryColor":"emerald"}'),
  ('plasyect_sandalias', '{"id":"plasyect_sandalias","name":"Plasyect Inyeccion Directa","location":"Purisima del Rincon, Gto.","primaryColor":"sky"}')
on conflict (id) do nothing;

insert into public.app_users (id, email, role, payload) values
  ('lf.bedia@gmail.com', 'lf.bedia@gmail.com', 'DIRECTOR_GENERAL', '{"username":"Luis Felipe Bedia","email":"lf.bedia@gmail.com","role":"DIRECTOR_GENERAL","require2FA":true,"has2FAVerified":true}')
on conflict (id) do nothing;
