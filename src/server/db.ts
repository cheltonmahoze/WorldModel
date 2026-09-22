import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env, isProduction } from "@/server/env";

/**
 * Prisma Client wired to PostgreSQL through the pg driver adapter and the WASM
 * query compiler (see prisma/schema.prisma → generator.engineType = "client").
 *
 * A single instance is shared per process; in development it is stored on
 * globalThis so Next.js hot reloads do not exhaust the connection pool.
 */

const globalForPrisma = globalThis as unknown as { __nexusPrisma?: PrismaClient };

function createClient() {
  const adapter = new PrismaPg({
    connectionString: env.DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  return new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["error", "warn"],
  });
}

export const db = globalForPrisma.__nexusPrisma ?? createClient();

if (!isProduction) globalForPrisma.__nexusPrisma = db;

export type DbClient = typeof db;
