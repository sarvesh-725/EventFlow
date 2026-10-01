import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";

type AuditClient = Prisma.TransactionClient | typeof prisma;

export type AuditInput = {
  actorId?: string | null;
  eventId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Prisma.InputJsonValue;
};

export async function writeAudit(client: AuditClient, input: AuditInput): Promise<void> {
  await client.auditLog.create({
    data: {
      actorId: input.actorId ?? undefined,
      eventId: input.eventId ?? undefined,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      metadata: input.metadata
    }
  });
}

export async function listAuditLogs(input: { eventId?: string; limit: number }) {
  return prisma.auditLog.findMany({
    where: input.eventId ? { eventId: input.eventId } : undefined,
    orderBy: { createdAt: "desc" },
    take: input.limit,
    include: {
      actor: { select: { id: true, name: true, email: true, role: true } },
      event: { select: { id: true, title: true, slug: true } }
    }
  });
}
