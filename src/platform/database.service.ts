import { Injectable, OnModuleDestroy } from "@nestjs/common";
import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

export type DatabaseClient = Pick<PoolClient, "query">;

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly connectionString = process.env.DATABASE_URL?.trim() ?? "";
  private readonly pool = new Pool({
    connectionString: this.connectionString || undefined,
    max: Number(process.env.DATABASE_POOL_SIZE ?? 10),
    ssl:
      process.env.DATABASE_SSL === "require"
        ? { rejectUnauthorized: false }
        : undefined,
  });

  configured() {
    return Boolean(this.connectionString);
  }

  async ping() {
    if (!this.configured()) return false;
    try {
      await this.pool.query("select 1");
      return true;
    } catch {
      return false;
    }
  }

  query<T extends QueryResultRow = QueryResultRow>(
    text: string,
    values: readonly unknown[] = [],
  ): Promise<QueryResult<T>> {
    if (!this.configured()) {
      throw new Error("DATABASE_URL is not configured.");
    }
    return this.pool.query<T>(text, [...values]);
  }

  async transaction<T>(work: (client: DatabaseClient) => Promise<T>): Promise<T> {
    if (!this.configured()) {
      throw new Error("DATABASE_URL is not configured.");
    }
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
  }
}
