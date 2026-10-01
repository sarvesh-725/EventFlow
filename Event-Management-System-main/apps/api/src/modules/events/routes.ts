import { Router } from "express";
import { randomUUID } from "node:crypto";
import { EventStatus, ModerationStatus, Prisma, UserRole } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { AppError, asyncHandler } from "../../http/errors.js";
import { requiredParam } from "../../http/params.js";
import { loadAuth } from "../../middleware/auth.js";
import { requireApprovedOrganizer, requireAuth } from "../../middleware/auth.js";
import { createEventSchema, updateEventSchema } from "./schemas.js";
import { assignEventStaff, cancelEvent, getEventAnalytics, listEventAttendees, staffSchema } from "./operations.js";
import { checkInTicket } from "../checkin/service.js";
import { claimWaitlist, joinWaitlist, listWaitlistEntries, waitlistSchema } from "./waitlist.js";
import { z } from "zod";
import { publicOrder } from "../orders/service.js";
import { writeAudit } from "../audit/service.js";

const router = Router();
router.use(loadAuth);

function makeSlug(title: string): string {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${base || "event"}-${randomUUID().slice(0, 8)}`;
}

function eventSummary(event: Prisma.EventGetPayload<{ include: { ticketTypes: true; owner: true } }>) {
  return {
    id: event.id,
    slug: event.slug,
    title: event.title,
    description: event.description,
    venue: event.venue,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    timezone: event.timezone,
    status: event.status,
    moderationStatus: event.moderationStatus,
    coverImageUrl: event.coverImageUrl,
    profileImageUrl: event.profileImageUrl,
    owner: { id: event.owner.id, name: event.owner.name },
    ticketTypes: event.ticketTypes.map((ticketType) => ({
      id: ticketType.id,
      name: ticketType.name,
      priceMinor: ticketType.priceMinor,
      currency: ticketType.currency,
      capacity: ticketType.capacity,
      available: ticketType.capacity - ticketType.reservedQuantity - ticketType.soldQuantity,
      maxPerOrder: ticketType.maxPerOrder,
      status: ticketType.status
    }))
  };
}

router.get("/", asyncHandler(async (_request, response) => {
  const query = _request.query;
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 100) : "";
  const page = typeof query.page === "string" && /^\d+$/.test(query.page) ? Math.max(1, Number(query.page)) : 1;
  const limit = typeof query.limit === "string" && /^\d+$/.test(query.limit) ? Math.min(50, Math.max(1, Number(query.limit))) : 20;
  const where = {
    status: EventStatus.PUBLISHED,
    moderationStatus: ModerationStatus.VISIBLE,
    ...(search ? { OR: [{ title: { contains: search, mode: "insensitive" as const } }, { venue: { contains: search, mode: "insensitive" as const } }, { description: { contains: search, mode: "insensitive" as const } }] } : {})
  };
  const [events, total] = await Promise.all([
    prisma.event.findMany({ where, include: { ticketTypes: true, owner: true }, orderBy: { startsAt: "asc" }, skip: (page - 1) * limit, take: limit }),
    prisma.event.count({ where })
  ]);
  response.status(200).json({ events: events.map(eventSummary), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
}));

router.get("/mine", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const events = await prisma.event.findMany({
    where: auth.user.role === UserRole.ADMIN ? {} : { ownerId: auth.user.id },
    include: { ticketTypes: true, owner: true },
    orderBy: { createdAt: "desc" }
  });
  response.status(200).json({ events: events.map(eventSummary) });
}));

router.get("/:id/analytics", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const analytics = await getEventAnalytics(requiredParam(request, "id"), auth.user);
  response.status(200).json({ analytics });
}));

router.get("/:slug", asyncHandler(async (request, response) => {
  const slug = requiredParam(request, "slug");
  const event = await prisma.event.findFirst({
    where: {
      slug,
      status: { in: [EventStatus.PUBLISHED, EventStatus.COMPLETED] },
      moderationStatus: ModerationStatus.VISIBLE
    },
    include: { ticketTypes: true, owner: true }
  });

  if (!event) throw new AppError(404, "EVENT_NOT_FOUND", "The event was not found.");
  response.status(200).json({ event: eventSummary(event) });
}));

router.post("/", asyncHandler(async (request, response) => {
  const auth = requireApprovedOrganizer(request);
  const input = createEventSchema.parse(request.body);

  const event = await prisma.$transaction(async (transaction) => {
    const created = await transaction.event.create({
      data: {
        ownerId: auth.user.id,
        title: input.title,
        slug: makeSlug(input.title),
        description: input.description,
        venue: input.venue,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
        coverImageUrl: input.coverImageUrl,
        profileImageUrl: input.profileImageUrl,
        ticketTypes: {
          create: input.ticketTypes.map((ticketType) => ({
            ...ticketType,
            currency: ticketType.currency.toUpperCase()
          }))
        }
      }
    });

    const result = await transaction.event.findUniqueOrThrow({
      where: { id: created.id },
      include: { ticketTypes: true, owner: true }
    });
    await writeAudit(transaction, {
      actorId: auth.user.id,
      eventId: created.id,
      action: "EVENT_CREATED",
      entityType: "Event",
      entityId: created.id,
      metadata: { title: created.title, ticketTypeCount: input.ticketTypes.length }
    });
    return result;
  });

  response.status(201).json({ event: eventSummary(event) });
}));

router.patch("/:id", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const input = updateEventSchema.parse(request.body);
  const id = requiredParam(request, "id");
  const existing = await prisma.event.findUnique({
    where: { id },
    include: { _count: { select: { orders: true, tickets: true } } }
  });

  if (!existing) throw new AppError(404, "EVENT_NOT_FOUND", "The event was not found.");
  if (existing.ownerId !== auth.user.id && auth.user.role !== UserRole.ADMIN) {
    throw new AppError(403, "FORBIDDEN", "Only the event owner or an admin can edit this event.");
  }
  if (existing.status === EventStatus.CANCELLED || existing.status === EventStatus.COMPLETED) {
    throw new AppError(409, "EVENT_NOT_EDITABLE", "This event can no longer be edited.");
  }
  if (input.ticketTypes && (existing._count.orders > 0 || existing._count.tickets > 0)) {
    throw new AppError(409, "TICKET_TYPES_LOCKED", "Ticket types cannot be replaced after registration activity begins.");
  }

  const event = await prisma.$transaction(async (transaction) => {
    await transaction.event.update({
      where: { id: existing.id },
      data: {
        title: input.title,
        description: input.description,
        venue: input.venue,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        timezone: input.timezone,
        coverImageUrl: input.coverImageUrl,
        profileImageUrl: input.profileImageUrl,
        ...(input.ticketTypes ? {
          ticketTypes: {
            deleteMany: {},
            create: input.ticketTypes.map((ticketType) => ({
              ...ticketType,
              currency: ticketType.currency.toUpperCase()
            }))
          }
        } : {})
      }
    });

    const result = await transaction.event.findUniqueOrThrow({
      where: { id: existing.id },
      include: { ticketTypes: true, owner: true }
    });
    await writeAudit(transaction, {
      actorId: auth.user.id,
      eventId: existing.id,
      action: "EVENT_EDITED",
      entityType: "Event",
      entityId: existing.id,
      metadata: { ticketTypesReplaced: Boolean(input.ticketTypes) }
    });
    return result;
  });

  response.status(200).json({ event: eventSummary(event) });
}));

router.post("/:id/publish", asyncHandler(async (request, response) => {
  const auth = requireApprovedOrganizer(request);
  const id = requiredParam(request, "id");
  const existing = await prisma.event.findUnique({
    where: { id },
    include: { ticketTypes: true }
  });

  if (!existing) throw new AppError(404, "EVENT_NOT_FOUND", "The event was not found.");
  if (existing.ownerId !== auth.user.id && auth.user.role !== UserRole.ADMIN) {
    throw new AppError(403, "FORBIDDEN", "Only the event owner or an admin can publish this event.");
  }
  if (existing.ticketTypes.length === 0) {
    throw new AppError(409, "TICKETS_REQUIRED", "Add at least one ticket type before publishing.");
  }
  if (existing.startsAt <= new Date()) {
    throw new AppError(409, "EVENT_START_IN_PAST", "An event must start in the future before it can be published.");
  }

  const event = await prisma.$transaction(async (transaction) => {
    const published = await transaction.event.update({
      where: { id: existing.id },
      data: { status: EventStatus.PUBLISHED, moderationStatus: ModerationStatus.VISIBLE },
      include: { ticketTypes: true, owner: true }
    });
    await writeAudit(transaction, {
      actorId: auth.user.id,
      eventId: existing.id,
      action: "EVENT_PUBLISHED",
      entityType: "Event",
      entityId: existing.id
    });
    return published;
  });

  response.status(200).json({ event: eventSummary(event) });
}));

router.post("/:id/staff", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const staff = await assignEventStaff(requiredParam(request, "id"), staffSchema.parse(request.body), auth.user);
  response.status(200).json({ staff });
}));

router.get("/:id/attendees", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const attendees = await listEventAttendees(requiredParam(request, "id"), auth.user);
  response.status(200).json({ attendees });
}));

router.post("/:id/check-in", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const input = z.object({ code: z.string().trim().min(5).max(200) }).parse(request.body);
  const result = await checkInTicket(requiredParam(request, "id"), input.code, auth.user);
  response.status(200).json({
    checkIn: result.checkIn,
    ticket: {
      id: result.ticket.id,
      attendeeName: result.ticket.attendeeName,
      attendeeEmail: result.ticket.attendeeEmail,
      publicCodeLast4: result.ticket.publicCodeLast4,
      status: "CHECKED_IN"
    }
  });
}));

router.post("/:id/cancel", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const result = await cancelEvent(requiredParam(request, "id"), auth.user);
  response.status(200).json(result);
}));

router.post("/:id/waitlist", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const input = waitlistSchema.parse(request.body);
  const entry = await joinWaitlist(requiredParam(request, "id"), auth.user.id, input.ticketTypeId);
  response.status(201).json({ entry });
}));

router.get("/:id/waitlist", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const entries = await listWaitlistEntries(requiredParam(request, "id"), auth.user.id);
  response.status(200).json({ entries });
}));

router.post("/:id/waitlist/claim", asyncHandler(async (request, response) => {
  const auth = requireAuth(request);
  const idempotencyKey = request.header("Idempotency-Key");
  if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) throw new AppError(400, "IDEMPOTENCY_KEY_REQUIRED", "Send a unique Idempotency-Key header.");
  const input = waitlistSchema.parse(request.body);
  const order = await claimWaitlist(requiredParam(request, "id"), auth.user.id, input.ticketTypeId, idempotencyKey);
  response.status(201).json({ order: publicOrder(order) });
}));

export default router;
