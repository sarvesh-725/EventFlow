import { EventStatus, ModerationStatus, Prisma, TicketTypeStatus, WaitlistStatus } from "@prisma/client";
import { z } from "zod";
import { AppError } from "../../http/errors.js";
import { prisma } from "../../lib/prisma.js";
import { createOrderCheckout } from "../orders/service.js";

export const waitlistSchema = z.object({ ticketTypeId: z.string().trim().min(1).max(64) });

export async function joinWaitlist(eventId: string, userId: string, ticketTypeId: string) {
  return prisma.$transaction(async (transaction) => {
    // Keep the same event → ticket type lock order as checkout and cancellation.
    // This makes duplicate joins and availability checks serialize with inventory
    // transitions instead of relying on an unlocked read.
    const eventRows = await transaction.$queryRaw<Array<{
      id: string;
      status: EventStatus;
      moderationStatus: ModerationStatus;
    }>>(Prisma.sql`
      SELECT "id", "status", "moderationStatus"
      FROM "Event"
      WHERE "id" = ${eventId}
      FOR UPDATE
    `);
    const event = eventRows[0];

    const ticketTypeRows = await transaction.$queryRaw<Array<{
      id: string;
      eventId: string;
      status: TicketTypeStatus;
      capacity: number;
      reservedQuantity: number;
      soldQuantity: number;
    }>>(Prisma.sql`
      SELECT "id", "eventId", "status", "capacity", "reservedQuantity", "soldQuantity"
      FROM "TicketType"
      WHERE "id" = ${ticketTypeId} AND "eventId" = ${eventId}
      FOR UPDATE
    `);
    const ticketType = ticketTypeRows[0];

    if (!event || event.status !== EventStatus.PUBLISHED || event.moderationStatus !== ModerationStatus.VISIBLE || !ticketType || ticketType.status !== TicketTypeStatus.ACTIVE) {
      throw new AppError(404, "TICKET_TYPE_NOT_FOUND", "The ticket type was not found.");
    }
    if (ticketType.capacity - ticketType.reservedQuantity - ticketType.soldQuantity > 0) {
      throw new AppError(409, "TICKETS_AVAILABLE", "Tickets are still available; join the waitlist after they sell out.");
    }

    const existing = await transaction.waitlistEntry.findFirst({ where: { eventId, ticketTypeId, userId, status: { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] } } });
    if (existing) return existing;
    return transaction.waitlistEntry.create({ data: { eventId, ticketTypeId, userId } });
  });
}

export async function listWaitlistEntries(eventId: string, userId: string) {
  return prisma.waitlistEntry.findMany({
    where: { eventId, userId, status: { in: [WaitlistStatus.WAITING, WaitlistStatus.OFFERED] } },
    orderBy: { createdAt: "asc" },
    select: { id: true, ticketTypeId: true, status: true, offeredUntil: true }
  });
}

export async function promoteWaitlistForTicket(eventId: string, ticketTypeId: string, places = 1): Promise<void> {
  const offered = await prisma.$transaction(async (transaction) => {
    const eventRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "Event"
      WHERE "id" = ${eventId}
      FOR UPDATE
    `);
    if (!eventRows[0]) return 0;

    const ticketTypeRows = await transaction.$queryRaw<Array<{
      id: string;
      eventId: string;
      capacity: number;
      reservedQuantity: number;
      soldQuantity: number;
    }>>(Prisma.sql`
      SELECT "id", "eventId", "capacity", "reservedQuantity", "soldQuantity"
      FROM "TicketType"
      WHERE "id" = ${ticketTypeId} AND "eventId" = ${eventId}
      FOR UPDATE
    `);
    const ticketType = ticketTypeRows[0];
    if (!ticketType) return 0;

    const available = ticketType.capacity - ticketType.reservedQuantity - ticketType.soldQuantity;
    const placesToOffer = Math.min(Math.max(places, 0), available);
    let offeredCount = 0;

    while (offeredCount < placesToOffer) {
      const entry = await transaction.waitlistEntry.findFirst({
        where: { eventId, ticketTypeId, status: WaitlistStatus.WAITING },
        orderBy: { createdAt: "asc" }
      });
      if (!entry) break;

      const offeredUntil = new Date(Date.now() + 10 * 60 * 1000);
      await transaction.waitlistEntry.update({ where: { id: entry.id }, data: { status: WaitlistStatus.OFFERED, offeredUntil } });
      await transaction.outboxJob.create({
        data: {
          kind: "SEND_WAITLIST_OFFER",
          dedupeKey: `waitlist-offer:${entry.id}`,
          payload: { entryId: entry.id }
        }
      });
      await transaction.outboxJob.create({
        data: {
          kind: "EXPIRE_WAITLIST_OFFER",
          dedupeKey: `waitlist-offer-expiry:${entry.id}`,
          payload: { entryId: entry.id },
          availableAt: offeredUntil
        }
      });
      offeredCount += 1;
    }

    return offeredCount;
  });

  void offered;
}

export async function expireWaitlistOffer(entryId: string): Promise<void> {
  const entry = await prisma.$transaction(async (transaction) => {
    const current = await transaction.waitlistEntry.findUnique({ where: { id: entryId } });
    if (!current || current.status !== WaitlistStatus.OFFERED || !current.offeredUntil || current.offeredUntil > new Date()) return null;

    if (current.ticketTypeId) {
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "Event"
        WHERE "id" = ${current.eventId}
        FOR UPDATE
      `);
      await transaction.$queryRaw(Prisma.sql`
        SELECT "id"
        FROM "TicketType"
        WHERE "id" = ${current.ticketTypeId} AND "eventId" = ${current.eventId}
        FOR UPDATE
      `);
    }

    const updated = await transaction.waitlistEntry.updateMany({
      where: { id: current.id, status: WaitlistStatus.OFFERED, offeredUntil: { lte: new Date() } },
      data: { status: WaitlistStatus.WAITING, offeredUntil: null }
    });
    return updated.count === 1 ? current : null;
  });
  if (entry?.ticketTypeId) await promoteWaitlistForTicket(entry.eventId, entry.ticketTypeId);
}

export async function claimWaitlist(
  eventId: string,
  userId: string,
  ticketTypeId: string,
  idempotencyKey: string
) {
  const offer = await prisma.$transaction(async (transaction) => {
    const eventRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "Event"
      WHERE "id" = ${eventId}
      FOR UPDATE
    `);
    if (!eventRows[0]) throw new AppError(404, "EVENT_NOT_FOUND", "The event was not found.");

    const ticketTypeRows = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "TicketType"
      WHERE "id" = ${ticketTypeId} AND "eventId" = ${eventId}
      FOR UPDATE
    `);
    if (!ticketTypeRows[0]) throw new AppError(404, "TICKET_TYPE_NOT_FOUND", "The ticket type was not found.");

    const existingOffer = await transaction.waitlistEntry.findFirst({
      where: { eventId, ticketTypeId, userId, status: WaitlistStatus.OFFERED, offeredUntil: { gt: new Date() } }
    });
    if (existingOffer) return existingOffer;

    const first = await transaction.waitlistEntry.findFirst({
      where: { eventId, ticketTypeId, status: WaitlistStatus.WAITING },
      orderBy: { createdAt: "asc" }
    });
    if (!first) throw new AppError(404, "WAITLIST_EMPTY", "There is no active waitlist offer for this ticket type.");
    if (first.userId !== userId) throw new AppError(409, "WAITLIST_NOT_YOUR_TURN", "Waitlist offers are handled in signup order.");

    return transaction.waitlistEntry.update({
      where: { id: first.id },
      data: { status: WaitlistStatus.OFFERED, offeredUntil: new Date(Date.now() + 10 * 60 * 1000) }
    });
  });

  try {
    const order = await createOrderCheckout(userId, { eventId, items: [{ ticketTypeId, quantity: 1 }] }, idempotencyKey);
    await prisma.waitlistEntry.update({ where: { id: offer.id }, data: { status: WaitlistStatus.CLAIMED, claimedAt: new Date() } });
    return order;
  } catch (error) {
    await prisma.waitlistEntry.updateMany({ where: { id: offer.id, status: WaitlistStatus.OFFERED }, data: { status: WaitlistStatus.WAITING, offeredUntil: null } });
    throw error;
  }
}
