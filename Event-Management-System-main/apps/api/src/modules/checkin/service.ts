import { OrderStatus, TicketStatus, UserRole } from "@prisma/client";
import { hashPublicCode } from "../tickets/service.js";
import { prisma } from "../../lib/prisma.js";
import { AppError } from "../../http/errors.js";
import { assertEventPermission } from "../events/access.js";
import { writeAudit } from "../audit/service.js";

export async function checkInTicket(
  eventId: string,
  code: string,
  user: { id: string; role: UserRole }
) {
  await assertEventPermission(eventId, user, "CHECK_IN");
  const publicCodeHash = hashPublicCode(code);

  return prisma.$transaction(async (transaction) => {
    const ticket = await transaction.ticket.findUnique({
      where: { publicCodeHash },
      include: { order: true, event: { select: { id: true, title: true } } }
    });
    if (!ticket || ticket.eventId !== eventId || ticket.order.status !== OrderStatus.PAID) {
      throw new AppError(404, "TICKET_NOT_FOUND", "A valid paid ticket could not be found for this event.");
    }
    if (ticket.status === TicketStatus.CHECKED_IN) {
      throw new AppError(409, "ALREADY_CHECKED_IN", "This ticket has already been checked in.");
    }
    if (ticket.status === TicketStatus.VOID) {
      throw new AppError(409, "TICKET_VOID", "This ticket is no longer valid.");
    }

    const updated = await transaction.ticket.updateMany({
      where: { id: ticket.id, status: TicketStatus.ISSUED },
      data: { status: TicketStatus.CHECKED_IN }
    });
    if (updated.count !== 1) {
      throw new AppError(409, "ALREADY_CHECKED_IN", "This ticket has already been checked in.");
    }

    const checkIn = await transaction.checkIn.create({
      data: { ticketId: ticket.id, eventId, staffId: user.id }
    });
    await writeAudit(transaction, {
      actorId: user.id,
      eventId,
      action: "TICKET_CHECKED_IN",
      entityType: "Ticket",
      entityId: ticket.id,
      metadata: { checkInId: checkIn.id }
    });
    return { ticket, checkIn };
  });
}
