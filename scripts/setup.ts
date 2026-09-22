/**
 * One-shot environment bootstrap: `npm run setup`
 *
 * 1. materialises .env from .env.example with generated secrets
 * 2. boots the local PostgreSQL cluster
 * 3. generates the Prisma client
 * 4. pushes the schema and seeds realistic demo data
 *
 * Idempotent: safe to run repeatedly.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

const root = process.cwd();
const envPath = path.join(root, ".env");
const examplePath = path.join(root, ".env.example");

function run(cmd: string, label: string) {
  process.stdout.write(`\n▶ ${label}\n`);
  execSync(cmd, { stdio: "inherit", cwd: root });
}

function ensureEnv() {
  const template = readFileSync(examplePath, "utf8");
  const existing = existsSync(envPath) ? readFileSync(envPath, "utf8") : null;
  const secret = randomBytes(48).toString("base64");
  let content = template.replace(
    /SESSION_SECRET="[^"]*"/,
    `SESSION_SECRET="${existing?.match(/SESSION_SECRET="([^"]+)"/)?.[1] ?? secret}"`,
  );
  if (existing?.includes("DATABASE_URL=")) {
    const url = existing.match(/DATABASE_URL="([^"]+)"/)?.[1];
    if (url) content = content.replace(/DATABASE_URL="[^"]*"/, `DATABASE_URL="${url}"`);
  }
  writeFileSync(envPath, content, "utf8");
  process.stdout.write(existsSync(envPath) ? "✓ .env ready\n" : "✓ .env created\n");
}

async function main() {
  ensureEnv();
  const { spawn } = await import("node:child_process");
  // Boot the database in the background (long-lived process).
  process.stdout.write("\n▶ starting PostgreSQL\n");
  const started = spawn("npx", ["tsx", "scripts/dev-db.ts", "start"], {
    cwd: root,
    stdio: "inherit",
    detached: false,
  });
  await new Promise((r) => setTimeout(r, 4000));
  if (started.exitCode !== null && started.exitCode !== 0) {
    throw new Error("failed to start PostgreSQL");
  }
  run("npx prisma generate", "generating Prisma client");
  run("npx prisma db push --skip-generate", "applying schema");
  run("npx tsx scripts/run-seed.ts", "seeding demo data");
  process.stdout.write("\n✓ Nexus OS is ready. Run `npm run dev` (the preview server).\n");
  process.exit(0);
}

main().catch((err) => {
  process.stderr.write(`setup failed: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
});
