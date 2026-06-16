import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8080),
  JWT_SECRET: z.string().default('dev-only-change-me'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  // Conexion Postgres directa a Supabase (mismo credential que el sync-service).
  // Es la via preferida: lee tablas bigzap_* y la vista tarjetas_viajeras.
  DATABASE_URL: z.string().optional(),
  PGSSL: z.string().default('true'),
  GCP_PROJECT_ID: z.string().default('dashboard-plasyect'),
  DOCUMENT_AI_LOCATION: z.string().default('us'),
  DOCUMENT_AI_PROCESSOR_ID: z.string().optional(),
  // Tenant al que se asignan los lotes/pedidos reales de BixApp (1 planta por ahora).
  DEFAULT_TENANT_ID: z.string().default('plasyect_matriz'),
  // Maximo de tarjetas viajeras activas que carga el bootstrap del dashboard.
  BIGZAP_BATCH_LIMIT: z.coerce.number().int().min(1).max(5000).default(800),
  // Ventana (dias) para seguir mostrando lotes ya facturados como "recientes".
  BIGZAP_ACTIVE_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  // Ventana que usa la vista de planta BigZap para WIP vivo. Excluye rezagos
  // viejos que siguen abiertos en LOTCAB pero no aparecen como pares en proceso.
  BIGZAP_PLANT_ACTIVE_DAYS: z.coerce.number().int().min(1).max(365).default(55),
  // Zona horaria de la planta. escaneado_at se guarda como timestamptz (UTC);
  // hora del dia / turno / fecha de los tableros deben calcularse en esta TZ,
  // no en UTC. Debe coincidir con PLANT_TZ del sync-service.
  PLANT_TZ: z.string().default('America/Mexico_City')
});

export const config = configSchema.parse(process.env);

export const corsOrigins = config.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const hasSupabaseConfig = Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
export const hasDatabaseUrl = Boolean(config.DATABASE_URL);
