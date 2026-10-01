import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import CheckoutForm from "./checkout-form";

type EventDetails = {
  id: string; title: string; description: string; venue: string; startsAt: string; endsAt?: string;
  coverImageUrl?: string | null;
  ticketTypes: Array<{ id: string; name: string; priceMinor: number; currency: string; available: number; maxPerOrder: number }>;
};

async function getEvent(slug: string): Promise<EventDetails | null> {
  const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:5000";
  try {
    const response = await fetch(`${apiOrigin}/api/v1/events/${encodeURIComponent(slug)}`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json() as { event: EventDetails }).event;
  } catch { return null; }
}

export default async function EventPage({ params }: { params: Promise<{ slug: string }> }) {
  const event = await getEvent((await params).slug);
  if (!event) notFound();
  return <main className="container"><section className="detail">
    <Link className="nav-link" href="/">← All events</Link>
    <p className="eyebrow">{new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeStyle: "short" }).format(new Date(event.startsAt))}</p>
    {event.coverImageUrl && <Image className="detail-image" src={event.coverImageUrl} alt={`Cover image for ${event.title}`} width={1200} height={500} priority />}
    <h1>{event.title}</h1><p className="muted">{event.venue}</p>
    <p className="detail-copy">{event.description}</p>
    <CheckoutForm eventId={event.id} ticketTypes={event.ticketTypes} />
  </section></main>;
}
