/**
 * Applies the SQL migrations in prisma/migrations to the configured database.
 *
 * Compatibility: writes Prisma's own `_prisma_migrations` bookkeeping table
 * (same columns, same sha256 checksum format), so a later `prisma migrate status`
 * / `prisma migrate deploy` in an environment with engine binaries sees the
 * database as fully migrated instead of trying to re-apply anything.
 *
 *   npm run db:push            # apply pending migrations
 *   npm run db:push -- --reset # drop the public schema first (destructive)
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { config as loadEnv } from "dotenv";

loadEnv({ path: path.join(process.cwd(), ".env") });

const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id" VARCHAR(36) PRIMARY KEY NOT NULL,
  "checksum" VARCHAR(64) NOT NULL,
  "finished_at" TIMESTAMPTZ,
  "migration_name" VARCHAR(255) NOT NULL,
  "logs" TEXT,
  "rolled_back_at" TIMESTAMPTZ,
  "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);`;

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set (copy .env.example to .env)");
  const reset = process.argv.includes("--reset");
  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    if (reset) {
      process.stdout.write("→ dropping schema public (reset)\n");
      await client.query(`DROP SCHEMA IF EXISTS "public" CASCADE; CREATE SCHEMA "public";`);
    }
    await client.query(BOOTSTRAP_SQL);

    const applied = new Map<string, string>();
    const { rows } = await client.query<{ migration_name: string; checksum: string }>(
      `SELECT "migration_name", "checksum" FROM "_prisma_migrations" WHERE "rolled_back_at" IS NULL`,
    );
    for (const row of rows) applied.set(row.migration_name, row.checksum);

    if (!existsSync(MIGRATIONS_DIR)) {
      throw new Error("no prisma/migrations directory — run `npm run migrate:generate` first");
    }

    const migrations = readdirSync(MIGRATIONS_DIR)
      .filter((entry) => statSync(path.join(MIGRATIONS_DIR, entry)).isDirectory())
      .sort();

    let appliedCount = 0;
    for (const name of migrations) {
      const file = path.join(MIGRATIONS_DIR, name, "migration.sql");
      if (!existsSync(file)) continue;
      const sql = readFileSync(file, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const previous = applied.get(name);
      if (previous) {
        if (previous !== checksum) {
          throw new Error(
            `migration ${name} was modified after being applied (checksum mismatch)\n  database: ${previous}\n  file:     ${checksum}`,
          );
        }
        continue;
      }
      const startedAt = new Date();
      process.stdout.write(`→ applying ${name}\n`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          `INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count")
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [crypto.randomUUID(), checksum, new Date(), name, startedAt, 1],
        );
        await client.query("COMMIT");
        appliedCount++;
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      }
    }

    process.stdout.write(
      appliedCount === 0
        ? "✓ database schema is up to date\n"
        : `✓ applied ${appliedCount} migration(s)\n`,
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  process.stderr.write(`db-migrate failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
