"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type TicketType = { id: string; name: string; priceMinor: number; currency: string; available: number; maxPerOrder: number };

export default function CheckoutForm({ eventId, ticketTypes }: { eventId: string; ticketTypes: TicketType[] }) {
  const router = useRouter();
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState("");
  const [waitlistStatuses, setWaitlistStatuses] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const response = await fetch(`/api/v1/events/${eventId}/waitlist`, { credentials: "include" });
      if (!response.ok) return;
      const body = await response.json() as { entries?: Array<{ ticketTypeId: string; status: string }> };
      setWaitlistStatuses(Object.fromEntries((body.entries ?? []).map((entry) => [entry.ticketTypeId, entry.status])));
    })();
  }, [eventId]);

  function setQuantity(id: string, quantity: number) { setQuantities((current) => ({ ...current, [id]: Math.max(0, quantity) })); }
  async function joinWaitlist(ticketTypeId: string) {
    setJoining(ticketTypeId); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/v1/events/${eventId}/waitlist`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ticketTypeId })
      });
      const body = await response.json() as { entry?: { ticketTypeId: string; status: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The waitlist request could not be submitted.");
      if (body.entry) setWaitlistStatuses((current) => ({ ...current, [body.entry!.ticketTypeId]: body.entry!.status }));
      setMessage("You joined the waitlist. We will email you if a ticket becomes available.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The waitlist request could not be submitted."); }
    finally { setJoining(""); }
  }

  async function claimWaitlist(ticketTypeId: string) {
    setJoining(`${ticketTypeId}:claim`); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/v1/events/${eventId}/waitlist/claim`, {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ ticketTypeId })
      });
      const body = await response.json() as { order?: { checkoutUrl?: string | null }; error?: { message?: string } };
      if (!response.ok || !body.order) throw new Error(body.error?.message ?? "The waitlist ticket could not be claimed.");
      if (body.order.checkoutUrl) window.location.assign(body.order.checkoutUrl); else router.push("/dashboard");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The waitlist ticket could not be claimed."); setJoining(""); }
  }
  async function checkout() {
    const items = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
    if (!items.length) { setError("Select at least one ticket."); return; }
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/orders/checkout", {
        method: "POST", credentials: "include", headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({ eventId, items })
      });
      const body = await response.json() as { order?: { checkoutUrl?: string | null; status: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Checkout could not be started.");
      if (body.order?.checkoutUrl) window.location.assign(body.order.checkoutUrl);
      else router.push("/dashboard");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Checkout could not be started."); setBusy(false); }
  }

  return <div className="ticket-list"><h2>Choose tickets</h2>
    {ticketTypes.map((ticket) => <div className="ticket-option" key={ticket.id}>
      <div><strong>{ticket.name}</strong><small>{ticket.currency} {(ticket.priceMinor / 100).toFixed(2)} · {ticket.available} available</small></div>
      {ticket.available > 0 ? <input aria-label={`Quantity for ${ticket.name}`} type="number" min={0} max={Math.min(ticket.available, ticket.maxPerOrder)} value={quantities[ticket.id] ?? 0} onChange={(event) => setQuantity(ticket.id, Number(event.target.value))} /> : waitlistStatuses[ticket.id] === "OFFERED" ? <button className="button" disabled={joining === `${ticket.id}:claim`} onClick={() => void claimWaitlist(ticket.id)} type="button">{joining === `${ticket.id}:claim` ? "Claiming…" : "Claim offered ticket"}</button> : waitlistStatuses[ticket.id] === "WAITING" ? <span className="muted">On waitlist</span> : <button className="button secondary" disabled={joining === ticket.id} onClick={() => void joinWaitlist(ticket.id)} type="button">{joining === ticket.id ? "Joining…" : "Join waitlist"}</button>}
    </div>)}
    {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}
    <button className="button" disabled={busy} onClick={checkout} type="button">{busy ? "Reserving…" : "Continue to checkout"}</button>
  </div>;
}
