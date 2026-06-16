declare module 'node-firebird' {
  export interface Options {
    host?: string;
    port?: number;
    database?: string;
    user?: string;
    password?: string;
    role?: string;
    lowercase_keys?: boolean;
    pageSize?: number;
    retryConnectionInterval?: number;
    blobAsText?: boolean;
    encoding?: string;
  }

  export interface Transaction {
    query(sql: string, params: unknown[], callback: (err: Error | null, result: Record<string, unknown>[]) => void): void;
    commit(callback: (err: Error | null) => void): void;
    rollback(callback: (err: Error | null) => void): void;
  }

  export interface Database {
    query(sql: string, params: unknown[], callback: (err: Error | null, result: Record<string, unknown>[]) => void): void;
    transaction(
      options: number[] | { isolation: number[]; readOnly?: boolean },
      callback: (err: Error | null, transaction: Transaction) => void
    ): void;
    detach(callback?: (err: Error | null) => void): void;
  }

  export const ISOLATION_READ_COMMITTED: number[];
  export const ISOLATION_READ_COMMITTED_READ_ONLY: number[];
  export const ISOLATION_READ_UNCOMMITTED: number[];
  export const ISOLATION_REPEATABLE_READ: number[];
  export const ISOLATION_SERIALIZABLE: number[];

  export function attach(options: Options, callback: (err: Error | null, db: Database) => void): void;

  const Firebird: {
    attach: typeof attach;
    ISOLATION_READ_COMMITTED: number[];
    ISOLATION_READ_COMMITTED_READ_ONLY: number[];
    ISOLATION_READ_UNCOMMITTED: number[];
    ISOLATION_REPEATABLE_READ: number[];
    ISOLATION_SERIALIZABLE: number[];
  };
  export default Firebird;
}
