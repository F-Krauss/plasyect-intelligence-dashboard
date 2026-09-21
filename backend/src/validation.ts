import { z } from 'zod';

export const idParamSchema = z.object({ id: z.string().min(1) });

export const entitySchema = z.object({
  id: z.string().min(1)
}).passthrough();

export const patchSchema = z.record(z.string(), z.unknown());

export const stageBodySchema = z.object({
  stage: z.enum(['alta_pedido', 'almacen', 'inyeccion', 'estabilizacion', 'aduana', 'banda', 'embarque'])
});

export const statusBodySchema = z.object({
  status: z.string().min(1)
});

export const discountBodySchema = z.object({
  discountPercentage: z.number().min(0).max(100),
  discountAuthorized: z.boolean()
});

export const erpListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(1000).default(200),
  status: z.string().min(1).max(3).optional(),
  stage: z.string().min(1).max(40).optional()
});

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export const dateRangeQuerySchema = z.object({
  fechaInicio: z.string().regex(ISO_DATE, 'Fecha ISO requerida (YYYY-MM-DD)'),
  fechaFin: z.string().regex(ISO_DATE, 'Fecha ISO requerida (YYYY-MM-DD)')
});

export const movimientosQuerySchema = dateRangeQuerySchema.extend({
  limit: z.coerce.number().int().min(1).max(500).default(50)
});

export const aiChatBodySchema = z.object({
  message: z.string().min(1).max(2000),
  history: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000)
  })).max(20).default([])
});
