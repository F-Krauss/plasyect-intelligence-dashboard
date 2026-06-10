import fs from 'node:fs';
import { config } from './config.js';
import { log } from './log.js';
import { pool } from './pg.js';
import { runSyncCycle } from './sync.js';

let stopping = false;
let dirty = false;
let wake: (() => void) | null = null;

function interruptibleSleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms);
    wake = done;
    function done(): void {
      clearTimeout(timer);
      wake = null;
      resolve();
    }
  });
}

function fixedSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startWatcher(): void {
  if (!config.watchPath) return;
  if (!fs.existsSync(config.watchPath)) {
    log.warn(`FDB_WATCH_PATH no existe, se omite el watcher: ${config.watchPath}`);
    return;
  }
  fs.watchFile(config.watchPath, { interval: 2000 }, (curr, prev) => {
    if (curr.mtimeMs !== prev.mtimeMs || curr.size !== prev.size) {
      dirty = true;
      wake?.();
    }
  });
  log.info(`Observando escrituras en ${config.watchPath} (solo mtime, no abre el archivo)`);
}

async function main(): Promise<void> {
  log.info('plasyect-bigzap-sync iniciando', {
    firebird: `${config.firebird.host}:${config.firebird.port}`,
    pollSeconds: config.pollSeconds,
    once: config.runOnce,
    full: config.forceFull
  });

  if (config.runOnce) {
    const result = await runSyncCycle(config.forceFull);
    await pool.end();
    process.exit(result.ok ? 0 : 1);
  }

  startWatcher();

  let firstCycle = true;
  let lastFullDay: string | null = null;

  while (!stopping) {
    const today = new Date();
    const isoToday = today.toISOString().slice(0, 10);
    const scheduledFull =
      config.fullResyncHour !== null && today.getHours() === config.fullResyncHour && lastFullDay !== isoToday;
    const full = (firstCycle && config.forceFull) || scheduledFull;

    const result = await runSyncCycle(full);
    if (result.ok && full) lastFullDay = isoToday;
    firstCycle = false;
    dirty = false;

    await interruptibleSleep(config.pollSeconds * 1000);
    if (dirty && !stopping) {
      // Debounce: deja que BixApp termine la rafaga de escrituras.
      await fixedSleep(1500);
    }
  }

  await pool.end();
  log.info('plasyect-bigzap-sync detenido');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    log.info(`Senal ${signal} recibida, deteniendo...`);
    stopping = true;
    wake?.();
  });
}

main().catch((error) => {
  log.error('Error fatal', error);
  process.exit(1);
});
