import { Router } from "express";
import { env } from "../../config/env.js";
import { AppError, asyncHandler } from "../../http/errors.js";
import { runDueJobs } from "./service.js";

const router = Router();

router.post("/run", asyncHandler(async (request, response) => {
  if (!env.INTERNAL_JOB_TOKEN || request.header("x-internal-job-token") !== env.INTERNAL_JOB_TOKEN) {
    throw new AppError(401, "UNAUTHORIZED_JOB_RUNNER", "The internal job token is invalid.");
  }
  const result = await runDueJobs();
  response.status(200).json(result);
}));

export default router;
