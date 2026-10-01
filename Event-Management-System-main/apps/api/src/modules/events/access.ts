import { UserRole } from "@prisma/client";
import { AppError } from "../../http/errors.js";
import { prisma } from "../../lib/prisma.js";

export async function assertEventPermission(
  eventId: string,
  user: { id: string; role: UserRole },
  permission: string
) {
  const event = await prisma.event.findUnique({ where: { id: eventId }, select: { id: true, ownerId: true } });
  if (!event) throw new AppError(404, "EVENT_NOT_FOUND", "The event was not found.");
  if (user.role === UserRole.ADMIN || event.ownerId === user.id) return event;

  const assignment = await prisma.eventStaff.findUnique({ where: { eventId_userId: { eventId, userId: user.id } } });
  if (!assignment?.permissions.includes(permission)) {
    throw new AppError(403, "FORBIDDEN", "You do not have permission for this event.");
  }
  return event;
}
