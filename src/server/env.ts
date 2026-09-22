import { z } from "zod";

/**
 * Typed, validated runtime configuration. Imported by server code only.
 * Secrets never reach the client: only values explicitly expose to the browser
 * are referenced from client components.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_NAME: z.string().default("Nexus OS"),
  APP_URL: z.string().default("http://localhost:3000"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  SESSION_SECRET: z.string().min(24, "SESSION_SECRET must be at least 24 characters"),
  SESSION_TTL_MINUTES: z.coerce.number().int().positive().default(10080),
  PASSWORD_RESET_TTL_MINUTES: z.coerce.number().int().positive().default(45),
  EMAIL_VERIFICATION_TTL_MINUTES: z.coerce.number().int().positive().default(1440),
  INVITE_TTL_MINUTES: z.coerce.number().int().positive().default(10080),
  /** Length of the self-serve trial created at signup. */
  TRIAL_DAYS: z.coerce.number().int().positive().default(14),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().int().positive().default(240),
  AI_ENGINE: z.enum(["deterministic", "llm"]).default("deterministic"),
  /** Provider used for brief phrasing when AI_ENGINE="llm"; unset keeps it deterministic. */
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  /**
   * Open workspace access. When enabled, an unauthenticated visitor is signed
   * straight into the demo tenant instead of being stopped by the login screen,
   * so the product can be reviewed by anyone with the link. Every session it
   * creates is a real, auditable session row with the demo owner's own
   * permissions — nothing about the RBAC or tenant isolation model changes.
   * Set OPEN_WORKSPACE="false" to require a normal sign-in.
   */
  OPEN_WORKSPACE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  /** Account used by the open-access entry point. */
  DEMO_EMAIL: z.string().default("alex.morgan@nexus-demo.com"),
  SLACK_WEBHOOK_URL: z.string().optional(),
});

function load() {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}\n\nCopy .env.example to .env and run \`npm run setup\`.`);
  }
  return parsed.data;
}

export const env = load();

export const isProduction = env.NODE_ENV === "production";
export const isDevelopment = env.NODE_ENV === "development";
export const isTest = env.NODE_ENV === "test";
