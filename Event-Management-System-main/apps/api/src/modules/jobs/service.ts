import { JobStatus, Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AppError } from "../../http/errors.js";
import { prisma } from "../../lib/prisma.js";
import { sendOrderConfirmation } from "../../lib/email.js";
import { getStripe } from "../../lib/stripe.js";
import { env } from "../../config/env.js";
import { expirePendingOrder } from "../orders/service.js";
import { sendPasswordResetEmail } from "../../lib/email.js";
import { sendWaitlistOfferEmail } from "../../lib/email.js";
import { expireWaitlistOffer } from "../events/waitlist.js";

type ClaimedJob = {
  id: string;
  kind: string;
  payload: Prisma.JsonValue;
  attempts: number;
};

function payloadString(payload: Prisma.JsonValue, key: string): string {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new AppError(500, "JOB_PAYLOAD_INVALID", "The background job payload is invalid.");
  }
  const value = payload[key];
  if (typeof value !== "string") throw new AppError(500, "JOB_PAYLOAD_INVALID", `The job payload is missing ${key}.`);
  return value;
}

async function claimJobs(limit: number, workerId: string): Promise<ClaimedJob[]> {
  return prisma.$queryRaw<ClaimedJob[]>(Prisma.sql`
    WITH claimable AS (
      SELECT "id"
      FROM "OutboxJob"
      WHERE ("status" = ${JobStatus.PENDING} OR ("status" = ${JobStatus.PROCESSING} AND "lockedAt" < NOW() - INTERVAL '10 minutes'))
        AND "availableAt" <= NOW()
      ORDER BY "availableAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${limit}
    )
    UPDATE "OutboxJob" AS job
    SET "status" = ${JobStatus.PROCESSING},
        "attempts" = job."attempts" + 1,
        "lockedAt" = NOW(),
        "lockedBy" = ${workerId},
        "updatedAt" = NOW()
    FROM claimable
    WHERE job."id" = claimable."id"
    RETURNING job."id", job."kind", job."payload", job."attempts"
  `);
}

async function runJob(job: ClaimedJob): Promise<void> {
  const orderId = ["EXPIRE_ORDER_HOLD", "SEND_ORDER_CONFIRMATION", "REFUND_STRIPE_PAYMENT"].includes(job.kind)
    ? payloadString(job.payload, "orderId")
    : undefined;

  switch (job.kind) {
    case "EXPIRE_ORDER_HOLD":
      await expirePendingOrder(orderId!);
      return;
    case "SEND_ORDER_CONFIRMATION":
      await sendOrderConfirmation(orderId!);
      return;
    case "SEND_PASSWORD_RESET_EMAIL":
      await sendPasswordResetEmail(payloadString(job.payload, "userId"), payloadString(job.payload, "encryptedToken"));
      return;
    case "SEND_WAITLIST_OFFER":
      await sendWaitlistOfferEmail(payloadString(job.payload, "entryId"));
      return;
    case "EXPIRE_WAITLIST_OFFER":
      await expireWaitlistOffer(payloadString(job.payload, "entryId"));
      return;
    case "REFUND_STRIPE_PAYMENT": {
      const payment = await prisma.payment.findUnique({ where: { orderId: orderId! } });
      if (!payment?.providerPaymentId) throw new AppError(409, "REFUND_NOT_READY", "The Stripe payment intent is not available yet.");
      const refund = await getStripe().refunds.create({ payment_intent: payment.providerPaymentId }, { idempotencyKey: `refund:${orderId}` });
      await prisma.$transaction([
        prisma.payment.update({ where: { orderId: orderId! }, data: { status: "REFUNDED", providerPaymentId: refund.payment_intent?.toString() ?? payment.providerPaymentId } }),
        prisma.order.update({ where: { id: orderId! }, data: { status: "REFUNDED" } })
      ]);
      return;
    }
    default:
      throw new AppError(500, "UNKNOWN_JOB", `Unknown outbox job: ${job.kind}`);
  }
}

async function finishJob(job: ClaimedJob, workerId: string): Promise<void> {
  await prisma.outboxJob.updateMany({
    where: { id: job.id, lockedBy: workerId, status: JobStatus.PROCESSING },
    data: { status: JobStatus.SUCCEEDED, lockedAt: null, lockedBy: null, lastError: null }
  });
}

async function failJob(job: ClaimedJob, workerId: string, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : "Unknown job failure";
  const retry = job.attempts < 5;
  await prisma.outboxJob.updateMany({
    where: { id: job.id, lockedBy: workerId, status: JobStatus.PROCESSING },
    data: {
      status: retry ? JobStatus.PENDING : JobStatus.FAILED,
      availableAt: new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60 * 1000),
      lockedAt: null,
      lockedBy: null,
      lastError: message
    }
  });
}

export async function runDueJobs(limit = 20): Promise<{ claimed: number; succeeded: number; failed: number }> {
  const workerId = randomUUID();
  const jobs = await claimJobs(limit, workerId);
  let succeeded = 0;
  let failed = 0;
  for (const job of jobs) {
    try {
      await runJob(job);
      await finishJob(job, workerId);
      succeeded += 1;
    } catch (error) {
      await failJob(job, workerId, error);
      failed += 1;
    }
  }
  return { claimed: jobs.length, succeeded, failed };
}

export async function runWorkerLoop(): Promise<never> {
  if (!env.INTERNAL_JOB_TOKEN) {
    throw new AppError(503, "JOBS_NOT_CONFIGURED", "Internal job authentication is not configured.");
  }
  for (;;) {
    await runDueJobs();
    await new Promise((resolve) => setTimeout(resolve, 5_000));
  }
}
