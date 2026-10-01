import { EventStatus, JobStatus, OrderStatus, PaymentStatus, Prisma, TicketStatus, UserRole, WaitlistStatus } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../http/errors.js";
import { prisma } from "../../lib/prisma.js";
import { assertEventPermission } from "./access.js";
import { writeAudit } from "../audit/service.js";

export const staffSchema = z.object({
  email: z.string().trim().email(),
  permissions: z.array(z.enum(["CHECK_IN", "VIEW_ATTENDEES", "MANAGE_EVENT"])).min(1)
});

export async function assignEventStaff(
  eventId: string,
  input: z.infer<typeof staffSchema>,
  user: { id: string; role: UserRole }
) {
  await assertEventPermission(eventId, user, "MANAGE_EVENT");
  const staffUser = await prisma.user.findUnique({ where: { email: input.email.toLowerCase() } });
  if (!staffUser) throw new AppError(404, "USER_NOT_FOUND", "The staff user must register before being assigned.");

  return prisma.$transaction(async (transaction) => {
    const assignment = await transaction.eventStaff.upsert({
      where: { eventId_userId: { eventId, userId: staffUser.id } },
      create: { eventId, userId: staffUser.id, permissions: input.permissions },
      update: { permissions: input.permissions },
      include: { user: { select: { id: true, email: true, name: true, role: true } } }
    });
    await writeAudit(transaction, {
      actorId: user.id,
      eventId,
      action: "STAFF_ASSIGNMENT_UPDATED",
      entityType: "EventStaff",
      entityId: `${eventId}:${staffUser.id}`,
      metadata: { userId: staffUser.id, permissions: input.permissions }
    });
    return assignment;
  });
}

export async function getEventAnalytics(
  eventId: string,
  user: { id: string; role: UserRole }
) {
  await assertEventPermission(eventId, user, "VIEW_ATTENDEES");

  const [ticketsSold, ticketsCheckedIn, paidOrders, revenueByCurrency] = await Promise.all([
    prisma.ticket.count({ where: { eventId, order: { status: OrderStatus.PAID } } }),
    prisma.checkIn.count({ where: { eventId } }),
    prisma.order.count({ where: { eventId, status: OrderStatus.PAID } }),
    prisma.order.groupBy({
      by: ["currency"],
      where: { eventId, status: OrderStatus.PAID },
      _sum: { totalMinor: true }
    })
  ]);

  return {
    ticketsSold,
    ticketsCheckedIn,
    noShows: Math.max(0, ticketsSold - ticketsCheckedIn),
    attendanceRate: ticketsSold === 0 ? 0 : Number((ticketsCheckedIn / ticketsSold).toFixed(4)),
    paidOrders,
    revenue: revenueByCurrency.map((item) => ({ currency: item.currency, totalMinor: item._sum.totalMinor ?? 0 }))
  };
}

export async function listEventAttendees(
  eventId: string,
  user: { id: string; role: UserRole }
) {
  await assertEventPermission(eventId, user, "VIEW_ATTENDEES");
  return prisma.ticket.findMany({
    where: { eventId, order: { status: OrderStatus.PAID } },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      attendeeName: true,
      attendeeEmail: true,
      publicCodeLast4: true,
      status: true,
      createdAt: true,
      order: { select: { id: true, createdAt: true } },
      orderItem: { select: { ticketType: { select: { id: true, name: true } } } }
    }
  });
}

export async function cancelEvent(eventId: string, user: { id: string; role: UserRole }) {
  await assertEventPermission(eventId, user, "MANAGE_EVENT");
  const checkoutSessionsToExpire: string[] = [];

  const result = await prisma.$transaction(async (transaction) => {
    // Checkout locks Event before TicketType. Cancellation follows the same
    // order so a checkout cannot pass the availability check while an event
    // is being cancelled.
    const eventRows = await transaction.$queryRaw<Array<{
      id: string;
      ownerId: string;
      status: EventStatus;
      startsAt: Date;
    }>>(Prisma.sql`
      SELECT "id", "ownerId", "status", "startsAt"
      FROM "Event"
      WHERE "id" = ${eventId}
      FOR UPDATE
    `);
    const event = eventRows[0];

    if (!event) throw new AppError(404, "EVENT_NOT_FOUND", "The event was not found.");
    if (event.status === EventStatus.CANCELLED) {
      return {
        event: await transaction.event.findUniqueOrThrow({ where: { id: eventId } }),
        cancellation: {
          cancelledPendingOrders: 0,
          cancelledPaidOrders: 0,
          refundJobsCreated: 0,
          releasedReservations: 0
        }
      };
    }
    if (event.status === EventStatus.COMPLETED || event.startsAt <= new Date()) {
      throw new AppError(409, "EVENT_NOT_CANCELLABLE", "An event cannot be cancelled after it has started or completed.");
    }

    // Lock every ticket type in a stable order before changing reservations.
    // This prevents a multi-ticket checkout from deadlocking with cancellation.
    await transaction.$queryRaw(Prisma.sql`
      SELECT "id"
      FROM "TicketType"
      WHERE "eventId" = ${eventId}
      ORDER BY "id"
      FOR UPDATE
    `);

    const orders = await transaction.order.findMany({
      where: { eventId, status: { in: [OrderStatus.PENDING, OrderStatus.PAID] } },
      include: { items: true, payment: true }
    });
    let cancelledPendingOrders = 0;
    let cancelledPaidOrders = 0;
    let refundJobsCreated = 0;
    let releasedReservations = 0;

    for (const order of orders) {
      if (order.status === OrderStatus.PENDING) {
        if (order.stripeCheckoutSessionId) checkoutSessionsToExpire.push(order.stripeCheckoutSessionId);
        for (const item of order.items) {
          const released = await transaction.ticketType.updateMany({
            where: { id: item.ticketTypeId, reservedQuantity: { gte: item.quantity } },
            data: { reservedQuantity: { decrement: item.quantity } }
          });
          if (released.count !== 1) {
            throw new AppError(500, "INVENTORY_INVARIANT", "Reserved inventory is inconsistent.");
          }
          releasedReservations += item.quantity;
        }
        await transaction.order.update({
          where: { id: order.id },
          data: { status: OrderStatus.CANCELLED, holdExpiresAt: null }
        });
        cancelledPendingOrders += 1;
        continue;
      }

      await transaction.ticket.updateMany({
        where: { orderId: order.id, status: { not: TicketStatus.VOID } },
        data: { status: TicketStatus.VOID }
      });
      await transaction.order.update({ where: { id: order.id }, data: { status: OrderStatus.CANCELLED } });
      cancelledPaidOrders += 1;

      if (order.payment?.provider === "stripe" && order.payment.status === PaymentStatus.SUCCEEDED && order.payment.providerPaymentId) {
        await transaction.outboxJob.upsert({
          where: { dedupeKey: `refund-order:${order.id}` },
          create: {
            kind: "REFUND_STRIPE_PAYMENT",
            dedupeKey: `refund-order:${order.id}`,
            payload: { orderId: order.id },
            availableAt: new Date()
          },
          update: {
            status: JobStatus.PENDING,
            availableAt: new Date(),
            lockedAt: null,
            lockedBy: null,
            lastError: null
          }
        });
        refundJobsCreated += 1;
      }
    }

    await transaction.waitlistEntry.updateMany({
      where: { eventId, status: { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] } },
      data: { status: WaitlistStatus.CANCELLED }
    });

    const updatedEvent = await transaction.event.update({
      where: { id: eventId },
      data: { status: EventStatus.CANCELLED }
    });

    await writeAudit(transaction, {
      actorId: user.id,
      eventId,
      action: "EVENT_CANCELLED",
      entityType: "Event",
      entityId: eventId,
      metadata: { cancelledPendingOrders, cancelledPaidOrders, refundJobsCreated, releasedReservations }
    });

    return {
      event: updatedEvent,
      cancellation: {
        cancelledPendingOrders,
        cancelledPaidOrders,
        refundJobsCreated,
        releasedReservations
      }
    };
  });

  if (checkoutSessionsToExpire.length > 0) {
    const { getStripe } = await import("../../lib/stripe.js");
    await Promise.all(checkoutSessionsToExpire.map((sessionId) =>
      getStripe().checkout.sessions.expire(sessionId).catch(() => undefined)
    ));
  }

  return result;
}
