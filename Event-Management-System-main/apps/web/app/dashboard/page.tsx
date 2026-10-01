"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { QRCodeCanvas } from "qrcode.react";

type User = { id: string; email: string; name: string; role: string; organizerStatus: string | null };
type Ticket = { id: string; publicCode: string; status: string; attendeeName: string | null; attendeeEmail: string | null };
type Order = { id: string; status: string; event: { title: string }; items: Array<{ tickets: Ticket[] }> };
type OwnedEvent = { id: string; slug: string; title: string; status: string; moderationStatus: string; ticketTypes: Array<{ id: string; name: string; available: number }> };

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [events, setEvents] = useState<OwnedEvent[]>([]);
  const [error, setError] = useState("");
  const [savingTicket, setSavingTicket] = useState("");

  useEffect(() => { void (async () => {
    const me = await fetch("/api/v1/auth/me", { credentials: "include" });
    if (!me.ok) { router.push("/login"); return; }
    const meBody = await me.json() as { user: User }; setUser(meBody.user);
    const orderResponse = await fetch("/api/v1/orders", { credentials: "include" });
    if (orderResponse.ok) { const orderBody = await orderResponse.json() as { orders: Order[] }; setOrders(orderBody.orders); }
    const eventResponse = await fetch("/api/v1/events/mine", { credentials: "include" });
    if (eventResponse.ok) { const eventBody = await eventResponse.json() as { events: OwnedEvent[] }; setEvents(eventBody.events); }
  })().catch(() => setError("Dashboard could not be loaded.")); }, [router]);

  async function becomeOrganizer() {
    const response = await fetch("/api/v1/auth/organizer-request", { method: "POST", credentials: "include" });
    if (!response.ok) { setError("Organizer request could not be submitted."); return; }
    const body = await response.json() as { user: User }; setUser(body.user);
  }

  async function logout() { await fetch("/api/v1/auth/logout", { method: "POST", credentials: "include" }); router.push("/"); router.refresh(); }
  async function publish(eventId: string) {
    const response = await fetch(`/api/v1/events/${eventId}/publish`, { method: "POST", credentials: "include" });
    if (!response.ok) { setError("The event could not be published."); return; }
    setEvents((current) => current.map((event) => event.id === eventId ? { ...event, status: "PUBLISHED" } : event));
  }

  async function cancel(eventId: string) {
    if (!window.confirm("Cancel this event? Pending holds will be released and issued tickets will be voided.")) return;
    const response = await fetch(`/api/v1/events/${eventId}/cancel`, { method: "POST", credentials: "include" });
    const body = await response.json() as { error?: { message?: string } };
    if (!response.ok) { setError(body.error?.message ?? "The event could not be cancelled."); return; }
    setEvents((current) => current.map((event) => event.id === eventId ? { ...event, status: "CANCELLED" } : event));
  }

  async function saveAttendee(event: FormEvent<HTMLFormElement>, orderId: string, ticketId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSavingTicket(ticketId); setError("");
    const response = await fetch(`/api/v1/orders/${orderId}/tickets/${ticketId}/attendee`, {
      method: "PATCH",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ attendeeName: form.get("attendeeName"), attendeeEmail: form.get("attendeeEmail") || undefined })
    });
    const body = await response.json() as { ticket?: Pick<Ticket, "id" | "attendeeName" | "attendeeEmail">; error?: { message?: string } };
    setSavingTicket("");
    if (!response.ok || !body.ticket) { setError(body.error?.message ?? "Attendee details could not be saved."); return; }
    setOrders((current) => current.map((order) => order.id !== orderId ? order : {
      ...order,
      items: order.items.map((item) => ({
        ...item,
        tickets: item.tickets.map((ticket) => ticket.id === ticketId ? { ...ticket, ...body.ticket } : ticket)
      }))
    }));
  }

  return <main className="container"><div className="dashboard-header"><div><p className="eyebrow">Your workspace</p><h1>{user ? `Hi, ${user.name}` : "Loading…"}</h1></div><button className="button secondary" onClick={logout} type="button">Sign out</button></div>
    {error && <p className="error">{error}</p>}
    {user && <div className="grid">
      <section className="card"><p className="eyebrow">Attendee</p><h2>Your tickets</h2><p className="muted">Keep the QR code private and show it at event check-in. You can assign each ticket to a different attendee.</p>{orders.length ? <div className="stack">{orders.map((order) => <div className="card" key={order.id}><strong>{order.event.title}</strong><small className="muted"> · {order.status}</small>{order.items.flatMap((item) => item.tickets).map((ticket) => <div className="ticket-option" key={ticket.id}>{ticket.status === "VOID" ? <div className="ticket-void">Ticket {ticket.publicCode.slice(-4)} is void</div> : <QRCodeCanvas value={ticket.publicCode} size={72} includeMargin />}<div><strong>Ticket {ticket.publicCode.slice(-4)}</strong><small>{ticket.status}</small><form onSubmit={(event) => void saveAttendee(event, order.id, ticket.id)}><input name="attendeeName" aria-label="Attendee name" placeholder="Attendee name" defaultValue={ticket.attendeeName ?? ""} required /><input name="attendeeEmail" aria-label="Attendee email" placeholder="Attendee email (optional)" type="email" defaultValue={ticket.attendeeEmail ?? ""} /><button className="button secondary" disabled={savingTicket === ticket.id} type="submit">{savingTicket === ticket.id ? "Saving…" : "Save attendee"}</button></form></div></div>)}</div>)}</div> : <Link className="button secondary" href="/">Browse events</Link>}</section>
      <section className="card"><p className="eyebrow">Organizer access</p><h2>Host an event</h2><p className="muted">Current role: {user.role}. Organizer accounts manage only their own events and assigned staff.</p>{user.role === "ORGANIZER" ? <Link className="button" href="/organizer/new">Create an event</Link> : user.organizerStatus === "PENDING" ? <p className="success">Your organizer request is waiting for admin approval.</p> : <button className="button" onClick={becomeOrganizer} type="button">Request organizer approval</button>}</section>
      {user.role === "ORGANIZER" || user.role === "ADMIN" ? <section className="card"><p className="eyebrow">Publishing</p><h2>Your events</h2>{events.length ? <div className="stack">{events.map((event) => <div className="ticket-option" key={event.id}><div><strong>{event.title}</strong><small>{event.status} · {event.ticketTypes.length} ticket type(s)</small></div><div className="actions">{(event.status === "DRAFT" || event.status === "PUBLISHED") && <Link className="button secondary" href={`/organizer/events/${event.id}/edit`}>Edit</Link>}{event.status === "DRAFT" && <button className="button" onClick={() => void publish(event.id)} type="button">Publish</button>}{event.status === "PUBLISHED" && <><Link className="button secondary" href={`/organizer/events/${event.id}/attendees`}>Attendees</Link><Link className="button secondary" href={`/check-in/${event.id}`}>Check in</Link><button className="button danger" onClick={() => void cancel(event.id)} type="button">Cancel</button></>}{event.status === "DRAFT" && <button className="button secondary" onClick={() => void cancel(event.id)} type="button">Cancel</button>}</div></div>)}</div> : <p className="muted">No events yet.</p>}</section> : null}
      {user.role === "ADMIN" && <section className="card"><p className="eyebrow">Platform controls</p><h2>Administration</h2><p className="muted">Approve organizers and moderate published events.</p><Link className="button" href="/admin">Open moderation desk</Link></section>}
    </div>}
  </main>;
}
