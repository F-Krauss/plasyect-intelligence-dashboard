const HEAVY_CACHE_PREFIXES = [
  'plasyect_orders',
  'plasyect_batches',
  'plasyect_machines',
  'plasyect_bands',
  'plasyect_defects',
  'plasyect_audits',
  'plasyect_hourly_logs_',
  'plasyect_model_perf_logs_',
  'plasyect_quality_inspection_logs_',
  'plasyect_injection_logs_',
  'plasyect_banda_logs_',
  'plasyect_aduana_logs_',
  'plasyect_embarques_'
];

const isQuotaExceeded = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === 'QuotaExceededError' ||
    error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    error.code === 22 ||
    error.code === 1014);

export function getStoredString(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Local storage read failed for ${key}`, error);
    return null;
  }
}

export function getStoredJson<T>(key: string, fallback: T): T {
  const saved = getStoredString(key);
  if (!saved) return fallback;
  try {
    return JSON.parse(saved) as T;
  } catch (error) {
    console.warn(`Local storage parse failed for ${key}`, error);
    removeStoredItem(key);
    return fallback;
  }
}

export function removeStoredItem(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Local storage remove failed for ${key}`, error);
  }
}

export function clearHeavyLocalCaches(): void {
  try {
    Object.keys(localStorage)
      .filter(key => HEAVY_CACHE_PREFIXES.some(prefix => key === prefix || key.startsWith(prefix)))
      .forEach(key => localStorage.removeItem(key));
  } catch (error) {
    console.warn('Local storage cache cleanup failed', error);
  }
}

export function setStoredString(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    if (isQuotaExceeded(error)) {
      clearHeavyLocalCaches();
      try {
        localStorage.setItem(key, value);
        return true;
      } catch (retryError) {
        console.warn(`Local storage quota still full for ${key}`, retryError);
        return false;
      }
    }
    console.warn(`Local storage write failed for ${key}`, error);
    return false;
  }
}

export function setStoredJson(key: string, value: unknown): boolean {
  return setStoredString(key, JSON.stringify(value));
}
