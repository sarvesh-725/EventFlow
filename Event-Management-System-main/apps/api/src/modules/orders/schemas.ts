import { z } from "zod";

export const createOrderSchema = z.object({
  eventId: z.string().trim().min(1).max(64),
  items: z.array(z.object({
    ticketTypeId: z.string().trim().min(1).max(64),
    quantity: z.number().int().positive().max(100)
  })).min(1).max(20)
});

export const attendeeSchema = z.object({
  attendeeName: z.string().trim().min(1).max(120),
  attendeeEmail: z.string().trim().email().max(320).optional()
});
