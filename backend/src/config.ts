import 'dotenv/config';
import { z } from 'zod';

const configSchema = z.object({
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8080),
  JWT_SECRET: z.string().default('dev-only-change-me'),
  CORS_ORIGINS: z.string().default('http://localhost:3000,http://localhost:5173'),
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  GCP_PROJECT_ID: z.string().default('dashboard-plasyect'),
  DOCUMENT_AI_LOCATION: z.string().default('us'),
  DOCUMENT_AI_PROCESSOR_ID: z.string().optional(),
  // Tenant al que se asignan los lotes/pedidos reales de BixApp (1 planta por ahora).
  DEFAULT_TENANT_ID: z.string().default('plasyect_matriz'),
  // Maximo de tarjetas viajeras activas que carga el bootstrap del dashboard.
  BIGZAP_BATCH_LIMIT: z.coerce.number().int().min(1).max(5000).default(800),
  // Ventana (dias) para seguir mostrando lotes ya facturados como "recientes".
  BIGZAP_ACTIVE_DAYS: z.coerce.number().int().min(1).max(365).default(30)
});

export const config = configSchema.parse(process.env);

export const corsOrigins = config.CORS_ORIGINS.split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

export const hasSupabaseConfig = Boolean(config.SUPABASE_URL && config.SUPABASE_SERVICE_ROLE_KEY);
