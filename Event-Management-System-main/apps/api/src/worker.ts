import { runWorkerLoop } from "./modules/jobs/service.js";

runWorkerLoop().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
