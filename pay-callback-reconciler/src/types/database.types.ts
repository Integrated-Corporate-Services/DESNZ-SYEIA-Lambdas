/**
 * Database Types
 * Type definitions for database operations
 */

import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';

export type { Pool, PoolClient, QueryResult, QueryResultRow };

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: {
    rejectUnauthorized: boolean;
  };
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface QueryExecutor {
  query<T extends QueryResultRow = any>(text: string, params?: any[]): Promise<QueryResult<T>>;
}

export interface TransactionClient extends QueryExecutor {
  release(): void;
}

export type DatabaseConnection = Pool | PoolClient;
