import { z } from "zod";

const ticketTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  priceMinor: z.number().int().min(0).max(10_000_000),
  currency: z.string().trim().length(3).default("INR"),
  capacity: z.number().int().positive().max(1_000_000),
  maxPerOrder: z.number().int().positive().max(100).default(10)
});

const cloudinaryImageUrlSchema = z.string().url().max(2_000).refine((value) => {
  const url = new URL(value);
  return url.protocol === "https:" && url.hostname === "res.cloudinary.com";
}, "Images must be hosted on the configured Cloudinary delivery domain.");

export const createEventSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(10).max(10_000),
  venue: z.string().trim().min(2).max(300),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date().optional(),
  timezone: z.string().trim().min(1).max(80).default("UTC"),
  coverImageUrl: cloudinaryImageUrlSchema.optional(),
  profileImageUrl: cloudinaryImageUrlSchema.optional(),
  ticketTypes: z.array(ticketTypeSchema).min(1).max(20)
}).superRefine((value, context) => {
  if (value.endsAt && value.endsAt <= value.startsAt) {
    context.addIssue({ code: "custom", path: ["endsAt"], message: "endsAt must be after startsAt." });
  }
});

export const updateEventSchema = createEventSchema.partial().omit({ ticketTypes: true }).extend({
  ticketTypes: z.array(ticketTypeSchema).min(1).max(20).optional()
});
