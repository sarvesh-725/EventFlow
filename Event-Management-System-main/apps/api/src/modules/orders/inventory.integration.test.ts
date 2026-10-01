import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { EventStatus, ModerationStatus, OrderStatus, TicketStatus, UserRole } from "@prisma/client";
import { randomUUID } from "node:crypto";
import "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { createOrderCheckout, updateTicketAttendee } from "./service.js";
import { cancelEvent, getEventAnalytics } from "../events/operations.js";

const integration = process.env.RUN_DB_TESTS === "true" ? describe : describe.skip;

integration("ticket inventory concurrency", () => {
  let userId = "";
  let eventId = "";
  let ticketTypeId = "";

  beforeAll(async () => {
    const suffix = randomUUID().slice(0, 8);
    const user = await prisma.user.create({
      data: {
        email: `inventory-${suffix}@example.com`,
        name: "Inventory Test User",
        passwordHash: "test-hash",
        role: UserRole.ORGANIZER,
        organizerStatus: "APPROVED"
      }
    });
    userId = user.id;
    const event = await prisma.event.create({
      data: {
        ownerId: user.id,
        title: `Inventory Test ${suffix}`,
        slug: `inventory-test-${suffix}`,
        description: "Concurrency test event",
        venue: "Test venue",
        startsAt: new Date(Date.now() + 86_400_000),
        status: EventStatus.PUBLISHED,
        moderationStatus: ModerationStatus.VISIBLE,
        ticketTypes: { create: { name: "One seat", priceMinor: 0, capacity: 1, maxPerOrder: 1 } }
      },
      include: { ticketTypes: true }
    });
    eventId = event.id;
    ticketTypeId = event.ticketTypes[0]!.id;
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { eventId } });
    await prisma.event.delete({ where: { id: eventId } });
    await prisma.user.delete({ where: { id: userId } });
    await prisma.$disconnect();
  });

  it("allows exactly one concurrent buyer to claim the last ticket", async () => {
    const results = await Promise.allSettled([
      createOrderCheckout(userId, { eventId, items: [{ ticketTypeId, quantity: 1 }] }, `race-a-${randomUUID()}`),
      createOrderCheckout(userId, { eventId, items: [{ ticketTypeId, quantity: 1 }] }, `race-b-${randomUUID()}`)
    ]);
    const rejectedReasons = results.filter((result) => result.status === "rejected").map((result) => result.status === "rejected" ? String(result.reason) : "").join("\n");
    expect(results.filter((result) => result.status === "fulfilled"), rejectedReasons).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected"), rejectedReasons).toHaveLength(1);

    const ticketType = await prisma.ticketType.findUniqueOrThrow({ where: { id: ticketTypeId } });
    expect(ticketType.reservedQuantity + ticketType.soldQuantity).toBeLessThanOrEqual(ticketType.capacity);
  }, 30_000);

  it("assigns an attendee and voids issued tickets when the event is cancelled", async () => {
    const order = await prisma.order.findFirstOrThrow({
      where: { eventId, status: OrderStatus.PAID },
      include: { items: { include: { tickets: true } } }
    });
    const ticket = order.items[0]?.tickets[0];
    if (!ticket) throw new Error("The integration fixture did not issue a ticket.");

    const attendee = await updateTicketAttendee(
      order.id,
      ticket.id,
      { id: userId, role: UserRole.ORGANIZER },
      { attendeeName: "Assigned Attendee", attendeeEmail: "attendee@example.com" }
    );
    expect(attendee.attendeeName).toBe("Assigned Attendee");
    expect(attendee.attendeeEmail).toBe("attendee@example.com");

    const analytics = await getEventAnalytics(eventId, { id: userId, role: UserRole.ORGANIZER });
    expect(analytics.ticketsSold).toBe(1);
    expect(analytics.ticketsCheckedIn).toBe(0);
    expect(analytics.noShows).toBe(1);

    const result = await cancelEvent(eventId, { id: userId, role: UserRole.ORGANIZER });
    expect(result.event.status).toBe(EventStatus.CANCELLED);
    expect(result.cancellation.cancelledPaidOrders).toBe(1);

    const cancelledTicket = await prisma.ticket.findUniqueOrThrow({ where: { id: ticket.id } });
    expect(cancelledTicket.status).toBe(TicketStatus.VOID);

    const audit = await prisma.auditLog.findFirst({ where: { eventId, action: "EVENT_CANCELLED" } });
    expect(audit?.entityId).toBe(eventId);
  }, 30_000);
});
