import cors from 'cors';
import express, { type ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { config, corsOrigins, hasDatabaseUrl, hasSupabaseConfig } from './config.js';
import { createRepository } from './repository.js';
import { createRoutes } from './routes.js';

const app = express();

app.use(cors({
  origin(origin, callback) {
    if (!origin || corsOrigins.includes('*') || corsOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(createRoutes(createRepository()));

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'validation_error', issues: error.issues });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'internal_error' });
};

app.use(errorHandler);

app.listen(config.PORT, () => {
  console.log(`plasyect-api listening on ${config.PORT}`);
  if (hasDatabaseUrl) console.log('Persistencia: Postgres directo (DATABASE_URL).');
  else if (hasSupabaseConfig) console.log('Persistencia: Supabase REST (service_role).');
  else console.warn('Sin DATABASE_URL ni Supabase: usando datos en memoria (seed).');
});

export { app };
