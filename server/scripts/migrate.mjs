import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = path.join(root, ".env");
if (!process.env.DATABASE_URL && existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const connectionString = process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("DATABASE_URL is required.");

const directory = path.join(root, "migrations");
const pool = new pg.Pool({
  connectionString,
  ssl: process.env.DATABASE_SSL === "require"
    ? { rejectUnauthorized: false }
    : undefined,
});
const client = await pool.connect();

try {
  await client.query("select pg_advisory_lock($1)", [741_852_963]);
  await client.query(`
    create table if not exists schema_migrations (
      name text primary key,
      checksum text not null,
      applied_at timestamptz not null default now()
    )
  `);
  const names = (await readdir(directory))
    .filter((name) => /^\d+.*\.sql$/.test(name))
    .sort();
  for (const name of names) {
    const sql = await readFile(path.join(directory, name), "utf8");
    const checksum = createHash("sha256").update(sql).digest("hex");
    const existing = await client.query(
      "select checksum from schema_migrations where name = $1",
      [name],
    );
    if (existing.rows[0]) {
      if (existing.rows[0].checksum !== checksum) {
        throw new Error(`Applied migration ${name} has changed.`);
      }
      continue;
    }
    await client.query("begin");
    try {
      await client.query(sql);
      await client.query(
        "insert into schema_migrations (name, checksum) values ($1, $2)",
        [name, checksum],
      );
      await client.query("commit");
      console.info(`Applied ${name}`);
    } catch (error) {
      await client.query("rollback");
      throw error;
    }
  }
} finally {
  await client.query("select pg_advisory_unlock($1)", [741_852_963]).catch(() => undefined);
  client.release();
  await pool.end();
}
