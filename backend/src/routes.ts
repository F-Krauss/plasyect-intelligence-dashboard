import { Router } from 'express';
import { issueToken, requireAuth } from './auth.js';
import { createErpService, getTarjetaViajeraStub, type ErpService } from './erp.js';
import type { DashboardRepository } from './repository.js';
import { defaultUser } from './seed.js';
import { dateRangeQuerySchema, discountBodySchema, entitySchema, erpListQuerySchema, idParamSchema, movimientosQuerySchema, patchSchema, stageBodySchema, statusBodySchema } from './validation.js';

export function createRoutes(repository: DashboardRepository, erp: ErpService = createErpService()): Router {
  const router = Router();

  router.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'plasyect-api', time: new Date().toISOString() });
  });

  router.post('/api/auth/auto', (_req, res) => {
    res.json({ token: issueToken(defaultUser), user: defaultUser });
  });

  router.use('/api', requireAuth);

  router.get('/api/bootstrap', async (_req, res, next) => {
    try {
      res.json(await repository.bootstrap());
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/orders', list(repository, 'orders'));
  router.post('/api/orders', create(repository, 'orders'));
  router.patch('/api/orders/:id', patch(repository, 'orders'));
  router.patch('/api/orders/:id/discount', async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const body = discountBodySchema.parse(req.body);
      const updated = await repository.patch('orders', id, body);
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/batches', list(repository, 'batches'));
  router.post('/api/batches', create(repository, 'batches'));
  router.patch('/api/batches/:id', patch(repository, 'batches'));
  router.patch('/api/batches/:id/stage', async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { stage } = stageBodySchema.parse(req.body);
      const delivered = stage === 'embarque';
      const updated = await repository.patch('batches', id, {
        stage,
        etapaActual: stage,
        status: delivered ? 'ENTREGADO' : undefined,
        estatus: delivered ? 'ENTREGADO' : undefined,
        ultimoEscaneo: new Date().toISOString(),
        lastUpdate: new Date().toISOString()
      });
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });
  router.patch('/api/batches/:id/status', async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const { status } = statusBodySchema.parse(req.body);
      const updated = await repository.patch('batches', id, { status, lastUpdate: new Date().toISOString() });
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });
  router.delete('/api/batches/:id', async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const updated = await repository.patch('batches', id, { status: 'ARCHIVED', archivedAt: new Date().toISOString() });
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });
  router.patch('/api/batches/:id/restore', async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const updated = await repository.patch('batches', id, { status: 'OPTIMO', archivedAt: null, lastUpdate: new Date().toISOString() });
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/defects', list(repository, 'defects'));
  router.post('/api/defects', create(repository, 'defects'));
  router.patch('/api/defects/:id', patch(repository, 'defects'));
  router.patch('/api/defects/:id/resolve', async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const updated = await repository.patch('defects', id, { resolved: true });
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/audits', list(repository, 'audits'));
  router.post('/api/audits', create(repository, 'audits'));

  router.get('/api/ocr-docs', list(repository, 'ocrDocuments'));
  router.post('/api/ocr-docs', create(repository, 'ocrDocuments'));
  router.patch('/api/ocr-docs/:id', patch(repository, 'ocrDocuments'));

  router.get('/api/erp/tarjetas', async (req, res, next) => {
    try {
      if (!erp.enabled) return res.status(503).json(getTarjetaViajeraStub('lista'));
      const query = erpListQuerySchema.parse(req.query);
      res.json(await erp.listTarjetas(query));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/erp/tarjetas/:id', async (req, res, next) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      if (!erp.enabled) return res.status(503).json(getTarjetaViajeraStub(id));
      const detalle = await erp.getTarjeta(id);
      if (!detalle) return res.status(404).json({ error: 'not_found', id });
      res.json(detalle);
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/erp/ejecutivo', async (req, res, next) => {
    try {
      const { fechaInicio, fechaFin } = dateRangeQuerySchema.parse(req.query);
      const data = await erp.getEjecutivoDashboard(fechaInicio, fechaFin);
      res.json(data);
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/erp/movimientos', async (req, res, next) => {
    try {
      const { fechaInicio, fechaFin, limit } = movimientosQuerySchema.parse(req.query);
      res.json(await erp.getMovimientos(fechaInicio, fechaFin, limit));
    } catch (error) {
      next(error);
    }
  });

  router.get('/api/erp/sync/status', async (_req, res, next) => {
    try {
      if (!erp.enabled) return res.status(503).json(getTarjetaViajeraStub('sync'));
      const run = await erp.getSyncStatus();
      res.json(run ?? { status: 'sin_corridas', message: 'sync-service aun no reporta corridas en erp_sync_runs.' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

function list(repository: DashboardRepository, entity: Parameters<DashboardRepository['list']>[0]) {
  return async (_req: unknown, res: { json: (body: unknown) => void }, next: (error: unknown) => void) => {
    try {
      res.json(await repository.list(entity));
    } catch (error) {
      next(error);
    }
  };
}

function create(repository: DashboardRepository, entity: Parameters<DashboardRepository['create']>[0]) {
  return async (req: { body: unknown }, res: { status: (code: number) => { json: (body: unknown) => void } }, next: (error: unknown) => void) => {
    try {
      const payload = entitySchema.parse(req.body);
      res.status(201).json(await repository.create(entity, payload as Parameters<DashboardRepository['create']>[1]));
    } catch (error) {
      next(error);
    }
  };
}

function patch(repository: DashboardRepository, entity: Parameters<DashboardRepository['patch']>[0]) {
  return async (req: { params: unknown; body: unknown }, res: { status: (code: number) => { json: (body: unknown) => void }; json: (body: unknown) => void }, next: (error: unknown) => void) => {
    try {
      const { id } = idParamSchema.parse(req.params);
      const body = patchSchema.parse(req.body);
      const updated = await repository.patch(entity, id, body);
      if (!updated) return res.status(404).json({ error: 'not_found' });
      res.json(updated);
    } catch (error) {
      next(error);
    }
  };
}
