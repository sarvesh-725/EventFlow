import dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { z } from "zod";

// During the migration, accept the user's existing server/.env without moving
// or duplicating secrets. The v2 apps/api/.env is loaded afterward so it can
// override legacy values. Deployment environments inject variables directly.
const apiConfigDirectory = path.dirname(fileURLToPath(import.meta.url));
const candidateEnvFiles = [
  path.resolve(apiConfigDirectory, "../../../../server/.env"),
  path.resolve(process.cwd(), "server/.env"),
  path.resolve(apiConfigDirectory, "../../../../.env"),
  path.resolve(process.cwd(), ".env"),
  path.resolve(apiConfigDirectory, "../../.env"),
  path.resolve(process.cwd(), "apps/api/.env")
];

for (const envFile of candidateEnvFiles) {
  dotenv.config({ path: envFile, override: true });
}

if (!process.env.DATABASE_URL && process.env.DATABASE_URL_POOLED) {
  process.env.DATABASE_URL = process.env.DATABASE_URL_POOLED;
}

// DATABASE_URL is the runtime connection. DATABASE_URL_POOLED remains a
// backwards-compatible alias for the legacy prototype and is only used when
// DATABASE_URL was not supplied.
const rawDatabaseUrl = process.env.DATABASE_URL;

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().url().optional(),
  DIRECT_DATABASE_URL: z.string().url().optional(),
  SESSION_SECRET: z.string().min(32).optional(),
  TICKET_TOKEN_SECRET: z.string().min(32).optional(),
  INTERNAL_JOB_TOKEN: z.string().min(32).optional(),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  API_ORIGIN: z.string().url().default("http://localhost:5000"),
  PAYMENT_SUCCESS_URL: z.string().url().optional(),
  PAYMENT_CANCEL_URL: z.string().url().optional(),
  ORDER_HOLD_MINUTES: z.coerce.number().int().positive().max(120).default(15),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_REPLY_TO: z.string().email().optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional()
});

const parsed = envSchema.parse({
  ...process.env,
  DATABASE_URL: rawDatabaseUrl
});

export const env = parsed;

export function assertDatabaseConfigured(): string {
  if (!env.DATABASE_URL) {
    throw new Error(
      "DATABASE_URL is required. Set DATABASE_URL_POOLED or DATABASE_URL in the environment."
    );
  }

  return env.DATABASE_URL;
}

export function assertProductionConfiguration(): void {
  if (env.NODE_ENV !== "production") return;

  const missing = [
    ["DATABASE_URL", env.DATABASE_URL],
    ["SESSION_SECRET", env.SESSION_SECRET],
    ["TICKET_TOKEN_SECRET", env.TICKET_TOKEN_SECRET],
    ["INTERNAL_JOB_TOKEN", env.INTERNAL_JOB_TOKEN]
  ].filter(([, value]) => !value).map(([name]) => name);

  if (env.WEB_ORIGIN.includes("localhost")) missing.push("WEB_ORIGIN");
  if (env.API_ORIGIN.includes("localhost")) missing.push("API_ORIGIN");
  if (env.STRIPE_SECRET_KEY && !env.STRIPE_WEBHOOK_SECRET) missing.push("STRIPE_WEBHOOK_SECRET");

  const resendConfigured = Boolean(env.RESEND_API_KEY || env.EMAIL_FROM);
  if (resendConfigured && (!env.RESEND_API_KEY || !env.EMAIL_FROM)) missing.push("RESEND_API_KEY and EMAIL_FROM");

  const cloudinaryConfigured = Boolean(env.CLOUDINARY_CLOUD_NAME || env.CLOUDINARY_API_KEY || env.CLOUDINARY_API_SECRET);
  if (cloudinaryConfigured && (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET)) {
    missing.push("CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(`Missing production configuration: ${missing.join(", ")}`);
  }
}
