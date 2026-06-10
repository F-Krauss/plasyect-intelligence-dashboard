import Firebird, { type Database, type Transaction } from 'node-firebird';
import { config } from './config.js';

export type FbRow = Record<string, unknown>;

const options = {
  host: config.firebird.host,
  port: config.firebird.port,
  database: config.firebird.database,
  user: config.firebird.user,
  password: config.firebird.password,
  lowercase_keys: false,
  blobAsText: true
};

function attach(): Promise<Database> {
  return new Promise((resolve, reject) => {
    Firebird.attach(options, (err, db) => (err ? reject(err) : resolve(db)));
  });
}

function beginReadOnly(db: Database): Promise<Transaction> {
  const isolation = Firebird.ISOLATION_READ_COMMITED_READ_ONLY ?? Firebird.ISOLATION_READ_COMMITED;
  return new Promise((resolve, reject) => {
    db.transaction(isolation, (err, tr) => (err ? reject(err) : resolve(tr)));
  });
}

function trQuery(tr: Transaction, sql: string, params: unknown[]): Promise<FbRow[]> {
  return new Promise((resolve, reject) => {
    tr.query(sql, params, (err, result) => (err ? reject(err) : resolve(result ?? [])));
  });
}

export type FbQuery = (sql: string, params?: unknown[]) => Promise<FbRow[]>;

/**
 * Abre una conexion y una transaccion de SOLO LECTURA, ejecuta el bloque y
 * cierra todo. Nunca emite escrituras a la base de BixApp.
 */
export async function withFirebird<T>(fn: (query: FbQuery) => Promise<T>): Promise<T> {
  const db = await attach();
  try {
    const tr = await beginReadOnly(db);
    try {
      const result = await fn((sql, params = []) => trQuery(tr, sql, params));
      await new Promise<void>((resolve, reject) => tr.commit((err) => (err ? reject(err) : resolve())));
      return result;
    } catch (error) {
      await new Promise<void>((resolve) => tr.rollback(() => resolve()));
      throw error;
    }
  } finally {
    await new Promise<void>((resolve) => db.detach(() => resolve()));
  }
}

/** CHAR de Firebird llega con relleno de espacios: normaliza a string limpio o null. */
export function fbString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

export function fbNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isNaN(num) ? null : num;
}

/** DATE de Firebird llega como Date local; regresa 'YYYY-MM-DD' sin desfases de zona. */
export function fbDate(value: unknown): string | null {
  if (!(value instanceof Date)) return null;
  const y = value.getFullYear();
  const m = String(value.getMonth() + 1).padStart(2, '0');
  const d = String(value.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
