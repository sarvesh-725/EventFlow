import Link from "next/link";
import Image from "next/image";

type EventSummary = {
  id: string;
  slug: string;
  title: string;
  description: string;
  venue: string;
  startsAt: string;
  coverImageUrl?: string | null;
  ticketTypes: Array<{ id: string; name: string; priceMinor: number; currency: string; available: number }>;
};

async function getEvents(search: string): Promise<EventSummary[]> {
  const apiOrigin = process.env.API_ORIGIN ?? "http://localhost:5000";
  try {
    const response = await fetch(`${apiOrigin}/api/v1/events${search ? `?q=${encodeURIComponent(search)}` : ""}`, { cache: "no-store" });
    if (!response.ok) return [];
    const body = await response.json() as { events: EventSummary[] };
    return body.events;
  } catch {
    return [];
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export default async function HomePage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const search = (await searchParams).q?.trim() ?? "";
  const events = await getEvents(search);
  return (
    <main className="container">
      <section className="hero">
        <p className="eyebrow">Events, without the chaos</p>
        <h1>Bring people together. Keep every ticket accounted for.</h1>
        <p>EventFlow gives organizers their own workspace for publishing events, selling capacity-safe tickets, and checking attendees in with confidence.</p>
        <div className="actions">
          <Link className="button" href="#events">Explore events</Link>
          <Link className="button secondary" href="/organizer/new">Host an event</Link>
        </div>
      </section>

      <section id="events">
        <div className="section-heading">
          <div><p className="eyebrow">Public discovery</p><h2>What&apos;s happening</h2></div>
          <p>{events.length ? `${events.length} published event${events.length === 1 ? "" : "s"}` : "Your next event could be first"}</p>
        </div>
        <form className="search-form" action="/" method="get"><input defaultValue={search} name="q" placeholder="Search by event, venue, or topic" /><button className="button" type="submit">Search</button></form>
        {events.length ? <div className="grid">{events.map((event) => (
          <Link className="card event-card" href={`/events/${event.slug}`} key={event.id}>
            {event.coverImageUrl && <div className="event-image"><Image src={event.coverImageUrl} alt={`Cover image for ${event.title}`} width={720} height={360} /></div>}
            <p className="eyebrow">{formatDate(event.startsAt)}</p>
            <h3>{event.title}</h3>
            <p>{event.venue}</p>
            <p>{event.description.slice(0, 120)}{event.description.length > 120 ? "…" : ""}</p>
            <div className="spacer" />
            <p className="price">From {event.ticketTypes.length ? `${event.ticketTypes[0]?.currency} ${(event.ticketTypes[0]?.priceMinor ?? 0) / 100}` : "Free"}</p>
          </Link>
        ))}</div> : <div className="card"><p className="muted">Published events will appear here. The API can be started locally with <code>npm run dev --workspace=@eventflow/api</code>.</p></div>}
      </section>
    </main>
  );
}
