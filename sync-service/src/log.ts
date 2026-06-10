function stamp(): string {
  return new Date().toISOString();
}

export const log = {
  info(message: string, extra?: Record<string, unknown>): void {
    console.log(`${stamp()} INFO  ${message}${extra ? ' ' + JSON.stringify(extra) : ''}`);
  },
  warn(message: string, extra?: Record<string, unknown>): void {
    console.warn(`${stamp()} WARN  ${message}${extra ? ' ' + JSON.stringify(extra) : ''}`);
  },
  error(message: string, error?: unknown): void {
    const detail = error instanceof Error ? `${error.message}` : error !== undefined ? String(error) : '';
    console.error(`${stamp()} ERROR ${message}${detail ? ` :: ${detail}` : ''}`);
  }
};
