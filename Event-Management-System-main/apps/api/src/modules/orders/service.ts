import { Prisma, EventStatus, ModerationStatus, OrderStatus, PaymentStatus, TicketStatus, UserRole } from "@prisma/client";
import { env } from "../../config/env.js";
import { AppError } from "../../http/errors.js";
import { prisma } from "../../lib/prisma.js";
import { getStripe } from "../../lib/stripe.js";
import { createTicketsForPaidOrder } from "../tickets/service.js";
import { decryptPublicCode } from "../tickets/service.js";
import type { z } from "zod";
import { attendeeSchema, createOrderSchema } from "./schemas.js";

type CreateOrderInput = z.infer<typeof createOrderSchema>;
type TicketRow = {
  id: string;
  name: string;
  priceMinor: number;
  currency: string;
  capacity: number;
  reservedQuantity: number;
  soldQuantity: number;
  maxPerOrder: number;
  status: string;
};

type LockedEventRow = {
  id: string;
  status: EventStatus;
  moderationStatus: ModerationStatus;
};

export async function getOrderDetails(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true, venue: true } },
      purchaser: { select: { id: true, email: true, name: true } },
      items: { include: { ticketType: true, tickets: true } },
      payment: true
    }
  });
}

export async function listOrdersForUser(userId: string) {
  return prisma.order.findMany({
    where: { purchaserId: userId },
    orderBy: { createdAt: "desc" },
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true, venue: true } },
      purchaser: { select: { id: true, email: true, name: true } },
      items: { include: { ticketType: true, tickets: true } },
      payment: true
    }
  });
}

function publicOrder(order: NonNullable<Awaited<ReturnType<typeof getOrderDetails>>>) {
  return {
    id: order.id,
    status: order.status,
    totalMinor: order.totalMinor,
    currency: order.currency,
    holdExpiresAt: order.holdExpiresAt,
    checkoutUrl: order.stripeCheckoutUrl,
    event: order.event,
    items: order.items.map((item) => ({
      id: item.id,
      quantity: item.quantity,
      unitPriceMinor: item.unitPriceMinor,
      ticketType: { id: item.ticketType.id, name: item.ticketType.name },
      tickets: item.tickets.map((ticket) => ({
        id: ticket.id,
        publicCode: decryptPublicCode(ticket.publicCodeEncrypted),
        publicCodeLast4: ticket.publicCodeLast4,
        attendeeName: ticket.attendeeName,
        attendeeEmail: ticket.attendeeEmail,
        status: ticket.status
      }))
    })),
    payment: order.payment ? { status: order.payment.status, provider: order.payment.provider } : null,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt
  };
}

export { publicOrder };

async function createPendingOrder(userId: string, input: CreateOrderInput, idempotencyKey: string) {
  const normalizedIdempotencyKey = `${userId}:${idempotencyKey}`;
  const existing = await getOrderByIdempotencyKey(normalizedIdempotencyKey);
  if (existing) return existing;

  const quantities = new Map<string, number>();
  for (const item of input.items) {
    quantities.set(item.ticketTypeId, (quantities.get(item.ticketTypeId) ?? 0) + item.quantity);
  }

  let order;
  try {
    order = await prisma.$transaction(async (transaction) => {
      // Lock the event before inventory so event cancellation and checkout have
      // one consistent ordering and cannot race after availability is checked.
      const eventRows = await transaction.$queryRaw<LockedEventRow[]>(Prisma.sql`
        SELECT "id", "status", "moderationStatus"
        FROM "Event"
        WHERE "id" = ${input.eventId}
        FOR UPDATE
      `);
      const event = eventRows[0];
      if (!event || event.status !== EventStatus.PUBLISHED || event.moderationStatus !== ModerationStatus.VISIBLE) {
        throw new AppError(409, "EVENT_NOT_AVAILABLE", "This event is not currently available for registration.");
      }

    const lines: Array<{ ticketTypeId: string; quantity: number; unitPriceMinor: number }> = [];
      let currency: string | undefined;
      let totalMinor = 0;

      for (const [ticketTypeId, quantity] of [...quantities.entries()].sort(([left], [right]) => left.localeCompare(right))) {
        const rows = await transaction.$queryRaw<TicketRow[]>(Prisma.sql`
          SELECT "id", "name", "priceMinor", "currency", "capacity", "reservedQuantity", "soldQuantity", "maxPerOrder", "status"
          FROM "TicketType"
          WHERE "id" = ${ticketTypeId} AND "eventId" = ${input.eventId}
          FOR UPDATE
        `);
        const ticketType = rows[0];

        if (!ticketType || ticketType.status !== "ACTIVE") {
          throw new AppError(404, "TICKET_TYPE_NOT_FOUND", "One of the selected ticket types is unavailable.");
        }
        if (quantity > ticketType.maxPerOrder) {
          throw new AppError(409, "MAX_PER_ORDER_EXCEEDED", `The ticket type ${ticketType.name} has a per-order limit.`);
        }

        const available = ticketType.capacity - ticketType.reservedQuantity - ticketType.soldQuantity;
        if (available < quantity) {
          throw new AppError(409, "SOLD_OUT", `${ticketType.name} does not have enough tickets available.`);
        }

        const lineCurrency = ticketType.currency.toUpperCase();
        if (currency && currency !== lineCurrency) {
          throw new AppError(409, "CURRENCY_MISMATCH", "All ticket types in an order must use the same currency.");
        }
        currency = lineCurrency;
        totalMinor += ticketType.priceMinor * quantity;
        lines.push({ ticketTypeId, quantity, unitPriceMinor: ticketType.priceMinor });

        await transaction.ticketType.update({
          where: { id: ticketType.id },
          data: { reservedQuantity: { increment: quantity } }
        });
      }

      const holdExpiresAt = new Date(Date.now() + env.ORDER_HOLD_MINUTES * 60 * 1000);
      const created = await transaction.order.create({
        data: {
          purchaserId: userId,
          eventId: input.eventId,
          status: OrderStatus.PENDING,
          currency: currency ?? "INR",
          totalMinor,
          holdExpiresAt,
          idempotencyKey: normalizedIdempotencyKey,
          items: { create: lines }
        }
      });

      await transaction.outboxJob.create({
        data: {
          kind: "EXPIRE_ORDER_HOLD",
          dedupeKey: `expire-order:${created.id}`,
          payload: { orderId: created.id },
          availableAt: holdExpiresAt
        }
      });

      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await getOrderByIdempotencyKey(normalizedIdempotencyKey);
      if (duplicate) return duplicate;
    }
    throw error;
  }

  return getOrderDetails(order.id);
}

async function getOrderByIdempotencyKey(idempotencyKey: string) {
  return prisma.order.findUnique({
    where: { idempotencyKey },
    include: {
      event: { select: { id: true, title: true, slug: true, startsAt: true, venue: true } },
      purchaser: { select: { id: true, email: true, name: true } },
      items: { include: { ticketType: true, tickets: true } },
      payment: true
    }
  });
}

async function attachStripeCheckout(order: NonNullable<Awaited<ReturnType<typeof getOrderDetails>>>) {
  if (order.stripeCheckoutUrl) return order;

  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: order.purchaser.email,
    line_items: order.items.map((item) => ({
      quantity: item.quantity,
      price_data: {
        currency: order.currency.toLowerCase(),
        unit_amount: item.unitPriceMinor,
        product_data: { name: `${order.event.title} — ${item.ticketType.name}` }
      }
    })),
    success_url: env.PAYMENT_SUCCESS_URL ?? `${env.WEB_ORIGIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: env.PAYMENT_CANCEL_URL ?? `${env.WEB_ORIGIN}/checkout/cancelled`,
    metadata: { orderId: order.id, eventId: order.event.id }
  }, { idempotencyKey: `checkout:${order.id}` });

  const updated = await prisma.$transaction(async (transaction) => {
    await transaction.order.update({
      where: { id: order.id },
      data: { stripeCheckoutSessionId: session.id, stripeCheckoutUrl: session.url }
    });
    await transaction.payment.upsert({
      where: { orderId: order.id },
      create: {
        orderId: order.id,
        provider: "stripe",
        checkoutSessionId: session.id,
        status: PaymentStatus.PENDING,
        amountMinor: order.totalMinor,
        currency: order.currency
      },
      update: { checkoutSessionId: session.id, amountMinor: order.totalMinor, currency: order.currency }
    });
    return transaction.order.findUniqueOrThrow({ where: { id: order.id } });
  });

  return getOrderDetails(updated.id);
}

export async function createOrderCheckout(userId: string, input: CreateOrderInput, idempotencyKey: string) {
  const order = await createPendingOrder(userId, input, idempotencyKey);
  if (!order) throw new AppError(500, "ORDER_CREATE_FAILED", "The order could not be created.");

  if (order.totalMinor === 0) {
    await createTicketsForPaidOrder(order.id, `free:${order.id}`);
    const freeOrder = await getOrderDetails(order.id);
    if (!freeOrder) throw new AppError(500, "ORDER_CREATE_FAILED", "The order could not be loaded.");
    return freeOrder;
  }

  try {
    const withCheckout = await attachStripeCheckout(order);
    if (!withCheckout) throw new AppError(500, "ORDER_CREATE_FAILED", "The order could not be loaded.");
    return withCheckout;
  } catch (error) {
    if (error instanceof AppError) throw new AppError(error.statusCode, error.code, error.message, { orderId: order.id });
    throw new AppError(502, "PAYMENT_PROVIDER_ERROR", "The payment provider could not create checkout.", { orderId: order.id });
  }
}

export async function updateTicketAttendee(
  orderId: string,
  ticketId: string,
  user: { id: string; role: UserRole },
  input: z.infer<typeof attendeeSchema>
) {
  const ticket = await prisma.ticket.findFirst({
    where: {
      id: ticketId,
      orderId,
      status: { not: TicketStatus.VOID },
      order: {
        status: OrderStatus.PAID,
        ...(user.role === UserRole.ADMIN ? {} : { purchaserId: user.id })
      }
    }
  });
  if (!ticket) throw new AppError(404, "TICKET_NOT_FOUND", "The issued ticket was not found for this order.");

  const attendeeEmail = input.attendeeEmail?.toLowerCase();
  const attendee = attendeeEmail ? await prisma.user.findUnique({ where: { email: attendeeEmail }, select: { id: true } }) : null;
  return prisma.ticket.update({
    where: { id: ticket.id },
    data: {
      attendeeName: input.attendeeName,
      attendeeEmail,
      attendeeUserId: attendee?.id ?? null
    },
    select: {
      id: true,
      attendeeName: true,
      attendeeEmail: true,
      publicCodeLast4: true,
      status: true
    }
  });
}

export async function expirePendingOrder(orderId: string): Promise<void> {
  let releasedTicketTypes: Array<{ eventId: string; ticketTypeId: string; places: number }> = [];
  await prisma.$transaction(async (transaction) => {
    const order = await transaction.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order || order.status !== OrderStatus.PENDING) return;

    releasedTicketTypes = order.items.map((item) => ({ eventId: order.eventId, ticketTypeId: item.ticketTypeId, places: item.quantity }));

    for (const item of order.items) {
      const released = await transaction.ticketType.updateMany({
        where: { id: item.ticketTypeId, reservedQuantity: { gte: item.quantity } },
        data: { reservedQuantity: { decrement: item.quantity } }
      });
      if (released.count !== 1) {
        throw new AppError(500, "INVENTORY_INVARIANT", "Reserved inventory is inconsistent.");
      }
    }

    await transaction.order.update({ where: { id: order.id }, data: { status: OrderStatus.EXPIRED } });
  });

  const { promoteWaitlistForTicket } = await import("../events/waitlist.js");
  const releasedByTicketType = new Map<string, { eventId: string; ticketTypeId: string; places: number }>();
  for (const released of releasedTicketTypes) {
    const key = `${released.eventId}:${released.ticketTypeId}`;
    const current = releasedByTicketType.get(key);
    releasedByTicketType.set(key, {
      eventId: released.eventId,
      ticketTypeId: released.ticketTypeId,
      places: (current?.places ?? 0) + released.places
    });
  }
  for (const released of releasedByTicketType.values()) {
    await promoteWaitlistForTicket(released.eventId, released.ticketTypeId, released.places);
  }

  const order = await getOrderDetails(orderId);
  if (order?.stripeCheckoutSessionId && env.STRIPE_SECRET_KEY) {
    await getStripe().checkout.sessions.expire(order.stripeCheckoutSessionId).catch(() => undefined);
  }
}

