/**
 * Runs `prisma generate`, falling back to an offline-capable path when Prisma's
 * binary CDN (binaries.prisma.sh) is unreachable.
 *
 * Nexus OS uses Prisma's WASM query compiler together with the `pg` driver
 * adapter, so no native engine is needed at runtime or generation time. The
 * fallback only tells the CLI to stop trying to download binaries it will never
 * load — the generated client is identical.
 */
import { spawnSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
/** Tiny placeholder file: the CLI copies whatever path it is given, so we must
 *  never point it at a real binary (it would be duplicated into the client). */
const DUMMY = path.join(root, "scripts", ".engine-stub");
if (!existsSync(DUMMY)) {
  writeFileSync(DUMMY, "Nexus OS: placeholder for Prisma engine paths (WASM query compiler is used instead)\n");
} // any existing file; never actually loaded

function generate(extraEnv: Record<string, string | undefined> = {}) {
  return spawnSync("npx", ["prisma", "generate", "--no-hints"], {
    cwd: root,
    stdio: "pipe",
    env: { ...process.env, ...extraEnv } as NodeJS.ProcessEnv,
    encoding: "utf8",
  });
}

const first = generate({});
if (first.status === 0) {
  process.stdout.write(first.stdout);
  process.exit(0);
}

const output = `${first.stdout ?? ""}${first.stderr ?? ""}`;
const isDownloadFailure = /binaries\.prisma\.sh|failed, reason|ERR_SOCKET|ECONNREFUSED|ETIMEDOUT/i.test(output);

if (!isDownloadFailure) {
  process.stderr.write(output);
  process.exit(first.status ?? 1);
}

process.stdout.write(
  "• binaries.prisma.sh unreachable — generating with WASM query compiler (driver adapter mode)\n",
);
const retry = generate({
  PRISMA_SCHEMA_ENGINE_BINARY: DUMMY,
  PRISMA_QUERY_ENGINE_LIBRARY: DUMMY,
});
process.stdout.write(`${retry.stdout ?? ""}${retry.stderr ?? ""}`);
if (retry.status === 0) {
  // Runtime never loads these binaries: the client uses the WASM query
  // compiler through the pg driver adapter.
  process.stdout.write("✓ client generated (WASM query compiler + pg driver adapter)\n");
}
process.exit(retry.status ?? 1);
