import { Prisma, OrderStatus, PaymentStatus } from "@prisma/client";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { env } from "../../config/env.js";
import { AppError } from "../../http/errors.js";
import { prisma } from "../../lib/prisma.js";

function ticketSecret(): string {
  if (!env.TICKET_TOKEN_SECRET) {
    throw new AppError(503, "TICKETS_NOT_CONFIGURED", "Ticket token signing is not configured.");
  }
  return env.TICKET_TOKEN_SECRET;
}

function createPublicCode(): string {
  return `EF-${randomBytes(18).toString("base64url").toUpperCase()}`;
}

export function hashPublicCode(code: string): string {
  return createHmac("sha256", ticketSecret()).update(code).digest("hex");
}

export function verifyPublicCode(code: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashPublicCode(code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function encryptionKey(): Buffer {
  return createHash("sha256").update(ticketSecret()).digest();
}

function encryptPublicCode(code: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptPublicCode(encrypted: string): string {
  const [ivPart, tagPart, ciphertextPart] = encrypted.split(".");
  if (!ivPart || !tagPart || !ciphertextPart) throw new AppError(500, "TICKET_TOKEN_INVALID", "A ticket token is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]).toString("utf8");
}

export async function createTicketsForPaidOrder(
  orderId: string,
  webhookEventId: string,
  providerPaymentId?: string | null,
  checkoutSessionId?: string | null
): Promise<void> {
  try {
    await prisma.$transaction(async (transaction) => {
      const alreadyProcessed = await transaction.processedWebhook.findUnique({
        where: { provider_eventId: { provider: webhookEventId.startsWith("free:") ? "internal" : "stripe", eventId: webhookEventId } }
      });
      if (alreadyProcessed) return;

      const order = await transaction.order.findUnique({
        where: { id: orderId },
        include: { items: true, purchaser: true }
      });
      if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "The order was not found.");

      const provider = webhookEventId.startsWith("free:") ? "internal" : "stripe";
      if (order.status === OrderStatus.PAID) {
        await transaction.processedWebhook.create({ data: { provider, eventId: webhookEventId } });
        return;
      }

      if (order.status !== OrderStatus.PENDING) {
        if (provider === "stripe" && providerPaymentId) {
          await transaction.payment.upsert({
            where: { orderId: order.id },
            create: {
              orderId: order.id,
              provider,
              providerPaymentId: providerPaymentId ?? undefined,
              checkoutSessionId: checkoutSessionId ?? order.stripeCheckoutSessionId ?? undefined,
              status: PaymentStatus.SUCCEEDED,
              amountMinor: order.totalMinor,
              currency: order.currency
            },
            update: { status: PaymentStatus.SUCCEEDED, providerPaymentId: providerPaymentId ?? undefined }
          });
          await transaction.outboxJob.upsert({
            where: { dedupeKey: `refund-order:${order.id}` },
            create: {
              kind: "REFUND_STRIPE_PAYMENT",
              dedupeKey: `refund-order:${order.id}`,
              payload: { orderId: order.id },
              availableAt: new Date()
            },
            update: {}
          });
        }
        await transaction.processedWebhook.create({ data: { provider, eventId: webhookEventId } });
        return;
      }

      for (const item of order.items) {
        const moved = await transaction.ticketType.updateMany({
          where: { id: item.ticketTypeId, reservedQuantity: { gte: item.quantity } },
          data: {
            reservedQuantity: { decrement: item.quantity },
            soldQuantity: { increment: item.quantity }
          }
        });
        if (moved.count !== 1) {
          throw new AppError(500, "INVENTORY_INVARIANT", "Reserved inventory is inconsistent.");
        }

        for (let index = 0; index < item.quantity; index += 1) {
          const code = createPublicCode();
          await transaction.ticket.create({
            data: {
              orderId: order.id,
              orderItemId: item.id,
              eventId: order.eventId,
              attendeeUserId: order.purchaserId,
              publicCodeHash: hashPublicCode(code),
              publicCodeEncrypted: encryptPublicCode(code),
              publicCodeLast4: code.slice(-4),
              attendeeName: order.purchaser.name,
              attendeeEmail: order.purchaser.email
            }
          });
        }
      }

      await transaction.payment.upsert({
        where: { orderId: order.id },
        create: {
          orderId: order.id,
          provider,
          providerPaymentId: providerPaymentId ?? undefined,
          checkoutSessionId: checkoutSessionId ?? order.stripeCheckoutSessionId ?? undefined,
          status: PaymentStatus.SUCCEEDED,
          amountMinor: order.totalMinor,
          currency: order.currency
        },
        update: {
          status: PaymentStatus.SUCCEEDED,
          providerPaymentId: providerPaymentId ?? undefined,
          checkoutSessionId: checkoutSessionId ?? undefined
        }
      });

      await transaction.order.update({ where: { id: order.id }, data: { status: OrderStatus.PAID } });
      await transaction.outboxJob.upsert({
        where: { dedupeKey: `order-confirmation:${order.id}` },
        create: {
          kind: "SEND_ORDER_CONFIRMATION",
          dedupeKey: `order-confirmation:${order.id}`,
          payload: { orderId: order.id },
          availableAt: new Date()
        },
        update: {}
      });
      await transaction.processedWebhook.create({ data: { provider, eventId: webhookEventId } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return;
    throw error;
  }
}
