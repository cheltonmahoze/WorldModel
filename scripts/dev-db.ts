/**
 * Local development database lifecycle manager.
 *
 * Nexus OS targets PostgreSQL. In local sandboxes / CI we run a real PostgreSQL
 * 17 cluster (managed through the `embedded-postgres` binaries) so the entire
 * application — Prisma, transactions, JSONB, arrays, window functions — behaves
 * exactly as it does in production.
 *
 *   npm run db:start   # boot the cluster (foreground, keeps the server alive)
 *   npm run db:stop    # graceful shutdown
 *   npm run db:status  # liveness + connection string
 *   npm run db:reset   # drop the data directory and boot fresh
 */
import { existsSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";

const DATA_DIR = path.join(process.cwd(), ".pgdata");
const PORT = Number(process.env.PG_PORT ?? 55432);
const USER = process.env.PG_USER ?? "nexus";
const PASSWORD = process.env.PG_PASSWORD ?? "nexus";
const DB_NAME = process.env.PG_DATABASE ?? "nexus_os";
const PID_FILE = path.join(DATA_DIR, "postmaster.pid");

export const DATABASE_URL = `postgresql://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DB_NAME}?schema=public`;

function createInstance() {
  return new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    port: PORT,
    user: USER,
    password: PASSWORD,
    authMethod: "scram-sha-256",
    persistent: true,
    initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-collate=C", "--lc-ctype=C"],
    onLog: (m) => process.stdout.write(`[pg] ${m}\n`),
    onError: (e) => process.stderr.write(`[pg:err] ${e instanceof Error ? e.message : String(e)}\n`),
  });
}

function readPid(): number | null {
  if (!existsSync(PID_FILE)) return null;
  try {
    const first = readFileSync(PID_FILE, "utf8").split("\n")[0];
    const pid = Number(first);
    return Number.isFinite(pid) ? pid : null;
  } catch {
    return null;
  }
}

async function isAlive(): Promise<boolean> {
  const pid = readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function start() {
  const pg = createInstance();
  const fresh = !existsSync(path.join(DATA_DIR, "PG_VERSION"));
  if (fresh) {
    process.stdout.write("→ initialising PostgreSQL cluster in .pgdata\n");
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(DB_NAME);
    process.stdout.write(`→ created database ${DB_NAME}\n`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!/already exists/i.test(message)) throw err;
  }
  process.stdout.write(`\n  Nexus OS database ready\n  DATABASE_URL=${DATABASE_URL}\n\n`);

  const shutdown = async () => {
    process.stdout.write("\n→ stopping PostgreSQL…\n");
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Keep the process (and therefore the cluster) alive.
  await new Promise(() => {});
}

async function stop() {
  const pid = readPid();
  if (!pid) {
    process.stdout.write("→ no running cluster found\n");
    return;
  }
  try {
    process.kill(pid, "SIGINT");
  } catch {
    /* already gone */
  }
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (!(await isAlive())) break;
  }
  if (await isAlive()) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
  process.stdout.write("→ PostgreSQL stopped\n");
}

async function main() {
  const command = process.argv[2] ?? "start";
  switch (command) {
    case "start": {
      if (await isAlive()) {
        process.stdout.write(`→ PostgreSQL already running (pid ${readPid()})\n  DATABASE_URL=${DATABASE_URL}\n`);
        return;
      }
      await start();
      break;
    }
    case "stop":
      await stop();
      break;
    case "status": {
      const alive = await isAlive();
      process.stdout.write(alive ? `running (pid ${readPid()})\n${DATABASE_URL}\n` : "stopped\n");
      break;
    }
    case "reset": {
      await stop();
      if (existsSync(DATA_DIR)) rmSync(DATA_DIR, { recursive: true, force: true });
      process.stdout.write("→ data directory removed\n");
      await start();
      break;
    }
    default:
      process.stdout.write(`Unknown command: ${command}\n`);
      process.exit(1);
  }
}

main().catch((err) => {
  process.stderr.write(`dev-db failed: ${err instanceof Error ? err.stack : String(err)}\n`);
  process.exit(1);
});
