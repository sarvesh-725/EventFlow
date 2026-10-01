import { describe, expect, it } from "vitest";
import { createEventSchema } from "./schemas.js";

describe("event input rules", () => {
  it("requires ticket capacity and rejects an invalid time range", () => {
    const result = createEventSchema.safeParse({
      title: "Resume Workshop",
      description: "A practical workshop for event platform engineering.",
      venue: "Online",
      startsAt: "2030-01-01T12:00:00.000Z",
      endsAt: "2030-01-01T11:00:00.000Z",
      ticketTypes: []
    });

    expect(result.success).toBe(false);
  });

  it("normalizes default ticket settings through the schema", () => {
    const result = createEventSchema.parse({
      title: "Resume Workshop",
      description: "A practical workshop for event platform engineering.",
      venue: "Online",
      startsAt: "2030-01-01T12:00:00.000Z",
      ticketTypes: [{ name: "General", priceMinor: 0, capacity: 50 }]
    });

    expect(result.timezone).toBe("UTC");
    expect(result.ticketTypes[0]?.currency).toBe("INR");
    expect(result.ticketTypes[0]?.maxPerOrder).toBe(10);
  });

  it("only accepts HTTPS Cloudinary image URLs", () => {
    const result = createEventSchema.safeParse({
      title: "Image Event",
      description: "An event with a hosted cover image.",
      venue: "Online",
      startsAt: "2030-01-01T12:00:00.000Z",
      coverImageUrl: "https://example.com/event.jpg",
      ticketTypes: [{ name: "General", priceMinor: 0, capacity: 10 }]
    });

    expect(result.success).toBe(false);
  });
});
