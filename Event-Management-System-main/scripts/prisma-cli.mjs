import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const apiDirectory = path.resolve(scriptDirectory, "../apps/api");

// Preserve compatibility with the existing prototype while allowing a future
// apps/api/.env to override it without duplicating secrets in source control.
dotenv.config({ path: path.resolve(apiDirectory, "../../server/.env") });
dotenv.config({ path: path.resolve(apiDirectory, ".env"), override: true });
process.env.DATABASE_URL ??= process.env.DATABASE_URL_POOLED;
process.env.DIRECT_DATABASE_URL ??= process.env.DATABASE_URL;

const result = spawnSync("npx", ["prisma", ...process.argv.slice(2)], {
  cwd: apiDirectory,
  env: process.env,
  stdio: "inherit",
  shell: true
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
