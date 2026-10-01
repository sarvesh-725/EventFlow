import { Router } from "express";
import { EventStatus, ModerationStatus, OrganizerStatus, UserRole } from "@prisma/client";
import { z } from "zod";
import { asyncHandler, AppError } from "../../http/errors.js";
import { requiredParam } from "../../http/params.js";
import { loadAuth, requireRoles } from "../../middleware/auth.js";
import { prisma } from "../../lib/prisma.js";
import { listAuditLogs, writeAudit } from "../audit/service.js";

const router = Router();
router.use(loadAuth, requireRoles(UserRole.ADMIN));

router.get("/organizers", asyncHandler(async (request, response) => {
  const status = request.query.status;
  const organizers = await prisma.user.findMany({
    where: {
      organizerStatus: status === "APPROVED" ? OrganizerStatus.APPROVED :
        status === "SUSPENDED" ? OrganizerStatus.SUSPENDED : OrganizerStatus.PENDING
    },
    select: { id: true, email: true, name: true, role: true, organizerStatus: true, createdAt: true },
    orderBy: { createdAt: "asc" }
  });
  response.status(200).json({ organizers });
}));

router.post("/organizers/:id/approve", asyncHandler(async (request, response) => {
  const userId = requiredParam(request, "id");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "The user was not found.");
  const updated = await prisma.$transaction(async (transaction) => {
    const approved = await transaction.user.update({
      where: { id: user.id },
      data: { role: UserRole.ORGANIZER, organizerStatus: OrganizerStatus.APPROVED }
    });
    await writeAudit(transaction, {
      actorId: request.auth!.user.id,
      action: "ORGANIZER_APPROVED",
      entityType: "User",
      entityId: user.id
    });
    return approved;
  });
  response.status(200).json({ organizer: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, organizerStatus: updated.organizerStatus } });
}));

router.post("/organizers/:id/suspend", asyncHandler(async (request, response) => {
  const userId = requiredParam(request, "id");
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new AppError(404, "USER_NOT_FOUND", "The user was not found.");
  const updated = await prisma.$transaction(async (transaction) => {
    const suspended = await transaction.user.update({
      where: { id: user.id },
      data: { role: UserRole.USER, organizerStatus: OrganizerStatus.SUSPENDED }
    });
    await writeAudit(transaction, {
      actorId: request.auth!.user.id,
      action: "ORGANIZER_SUSPENDED",
      entityType: "User",
      entityId: user.id
    });
    return suspended;
  });
  response.status(200).json({ organizer: { id: updated.id, email: updated.email, name: updated.name, role: updated.role, organizerStatus: updated.organizerStatus } });
}));

router.get("/events", asyncHandler(async (_request, response) => {
  const events = await prisma.event.findMany({
    where: { status: { not: EventStatus.COMPLETED } },
    include: { owner: { select: { id: true, email: true, name: true } }, _count: { select: { orders: true, tickets: true } } },
    orderBy: { createdAt: "desc" }
  });
  response.status(200).json({ events });
}));

router.get("/audit-logs", asyncHandler(async (request, response) => {
  const eventId = typeof request.query.eventId === "string" ? request.query.eventId : undefined;
  const requestedLimit = typeof request.query.limit === "string" && /^\d+$/.test(request.query.limit)
    ? Number(request.query.limit)
    : 50;
  const limit = Math.min(100, Math.max(1, requestedLimit));
  response.status(200).json({ logs: await listAuditLogs({ eventId, limit }) });
}));

router.post("/events/:id/moderation", asyncHandler(async (request, response) => {
  const eventId = requiredParam(request, "id");
  const action = z.object({ status: z.enum(["VISIBLE", "HIDDEN", "REMOVED"]) }).parse(request.body);
  const event = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.event.update({ where: { id: eventId }, data: { moderationStatus: action.status as ModerationStatus } });
    await writeAudit(transaction, {
      actorId: request.auth!.user.id,
      eventId,
      action: "EVENT_MODERATION_UPDATED",
      entityType: "Event",
      entityId: eventId,
      metadata: { moderationStatus: action.status }
    });
    return updated;
  });
  response.status(200).json({ event });
}));

export default router;
