#!/usr/bin/env tsx
/**
 * NEXUS OS background worker.
 *
 * Claims due rows from the `Job` table, executes the handler registered in
 * `src/server/jobs.ts`, and records the outcome (duration, result, retry state,
 * audit entry). It is safe to run more than one instance: claiming is a
 * conditional update, and stale RUNNING rows are reclaimed after a timeout.
 *
 *   npm run worker                 # continuous loop
 *   npm run worker -- --once       # drain one batch and exit (CI / cron)
 *   npm run worker -- --interval=30 --batch=25
 */
import { processJobs } from "@/server/jobs";
import { db } from "@/server/db";

type Options = { once: boolean; intervalSeconds: number; batch: number };

function parseArgs(argv: string[]): Options {
  const options: Options = { once: false, intervalSeconds: 15, batch: 10 };
  for (const arg of argv) {
    if (arg === "--once") options.once = true;
    else if (arg.startsWith("--interval=")) options.intervalSeconds = Math.max(1, Number(arg.split("=")[1]) || 15);
    else if (arg.startsWith("--batch=")) options.batch = Math.min(100, Math.max(1, Number(arg.split("=")[1]) || 10));
  }
  return options;
}

const stamp = () => new Date().toISOString().slice(11, 19);
const log = (message: string) => console.log(`[worker ${stamp()}] ${message}`);

async function drain(options: Options, cycles: number) {
  let processed = 0;
  let failed = 0;

  for (let cycle = 0; cycle < cycles; cycle += 1) {
    const outcomes = await processJobs(options.batch, (message) => log(message));
    processed += outcomes.length;
    failed += outcomes.filter((entry) => !entry.outcome.ok).length;
    if (!outcomes.length) break;
    if (outcomes.length < options.batch) break;
  }

  return { processed, failed };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  log(`starting · batch=${options.batch} interval=${options.intervalSeconds}s mode=${options.once ? "once" : "loop"}`);

  const shutdown = async (signal: string) => {
    log(`received ${signal} — finishing current batch and exiting`);
    await db.$disconnect().catch(() => undefined);
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  if (options.once) {
    const { processed, failed } = await drain(options, 20);
    log(processed ? `done · ${processed} job(s) processed, ${failed} failed` : "done · queue is empty");
    await db.$disconnect();
    return;
  }

  // Continuous mode: drain until empty, then sleep for the poll interval.
  for (;;) {
    const { processed, failed } = await drain(options, 20);
    if (processed) log(`cycle complete · ${processed} job(s), ${failed} failed`);
    else log("idle · no due jobs");
    await new Promise((resolve) => setTimeout(resolve, options.intervalSeconds * 1000));
  }
}

main().catch(async (error) => {
  console.error("[worker] fatal", error instanceof Error ? error.message : error);
  await db.$disconnect().catch(() => undefined);
  process.exit(1);
});
