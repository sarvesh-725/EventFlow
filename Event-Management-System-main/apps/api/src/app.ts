import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { env } from "./config/env.js";
import { prisma } from "./lib/prisma.js";
import { toHttpError, asyncHandler } from "./http/errors.js";
import authRouter from "./modules/auth/routes.js";
import eventsRouter from "./modules/events/routes.js";
import ordersRouter from "./modules/orders/routes.js";
import { stripeWebhookHandler } from "./modules/payments/stripe-webhook.js";
import jobsRouter from "./modules/jobs/routes.js";
import adminRouter from "./modules/admin/routes.js";
import uploadsRouter from "./modules/uploads/routes.js";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.set("trust proxy", 1);
  app.use(helmet());
  app.use(pinoHttp());
  app.use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true
    })
  );
  app.use(cookieParser());
  app.post("/api/v1/payments/stripe/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.status(200).json({
      status: "ok",
      service: "eventflow-api",
      environment: env.NODE_ENV
    });
  });

  app.get("/ready", asyncHandler(async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ready" });
  }));

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/events", eventsRouter);
  app.use("/api/v1/orders", ordersRouter);
  app.use("/internal/jobs", jobsRouter);
  app.use("/api/v1/admin", adminRouter);
  app.use("/api/v1/uploads", uploadsRouter);

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const httpError = toHttpError(error);
    if (httpError.statusCode >= 500) console.error(error);
    res.status(httpError.statusCode).json({
      error: {
        code: httpError.code,
        message: httpError.message,
        ...(httpError.details ? { details: httpError.details } : {})
      }
    });
  });

  return app;
}
