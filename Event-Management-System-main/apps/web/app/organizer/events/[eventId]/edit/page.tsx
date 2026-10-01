"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useParams, useRouter } from "next/navigation";

type EditableEvent = { id: string; title: string; description: string; venue: string; startsAt: string; endsAt: string | null; coverImageUrl: string | null; status: string };
type EventForm = { title: string; description: string; venue: string; startsAt: string; endsAt: string };

function localDateTime(value: string): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function EditEventPage() {
  const { eventId } = useParams<{ eventId: string }>();
  const router = useRouter();
  const [form, setForm] = useState<EventForm | null>(null);
  const [event, setEvent] = useState<EditableEvent | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/v1/events/mine", { credentials: "include" });
      const body = await response.json() as { events?: EditableEvent[]; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The event could not be loaded.");
      const selected = body.events?.find((candidate) => candidate.id === eventId);
      if (!selected) throw new Error("The event was not found.");
      setEvent(selected);
      setForm({ title: selected.title, description: selected.description, venue: selected.venue, startsAt: localDateTime(selected.startsAt), endsAt: selected.endsAt ? localDateTime(selected.endsAt) : "" });
    })().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "The event could not be loaded."));
  }, [eventId]);

  function update(field: keyof EventForm, value: string) {
    setForm((current) => current ? { ...current, [field]: value } : current);
  }

  async function save(eventSubmit: FormEvent<HTMLFormElement>) {
    eventSubmit.preventDefault();
    if (!form) return;
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/events/${eventId}`, {
        method: "PATCH", credentials: "include", headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: form.title, description: form.description, venue: form.venue, startsAt: new Date(form.startsAt).toISOString(), endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined })
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "The event could not be saved.");
      router.push("/dashboard");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "The event could not be saved."); }
    finally { setBusy(false); }
  }

  return <main className="container"><section className="form-card"><div className="dashboard-header"><div><p className="eyebrow">Organizer workspace</p><h1>Edit event</h1></div><Link className="button secondary" href="/dashboard">Back</Link></div>{event?.coverImageUrl && <p className="muted">The cover image is already set. Ticket tiers can only be changed before registration activity begins.</p>}{form ? <form onSubmit={save}><div className="field"><label htmlFor="event-title">Title</label><input id="event-title" required value={form.title} onChange={(input) => update("title", input.target.value)} /></div><div className="field"><label htmlFor="event-description">Description</label><textarea id="event-description" required value={form.description} onChange={(input) => update("description", input.target.value)} /></div><div className="field"><label htmlFor="event-venue">Venue</label><input id="event-venue" required value={form.venue} onChange={(input) => update("venue", input.target.value)} /></div><div className="grid"><div className="field"><label htmlFor="event-starts">Starts</label><input id="event-starts" required type="datetime-local" value={form.startsAt} onChange={(input) => update("startsAt", input.target.value)} /></div><div className="field"><label htmlFor="event-ends">Ends</label><input id="event-ends" type="datetime-local" value={form.endsAt} onChange={(input) => update("endsAt", input.target.value)} /></div></div>{error && <p className="error">{error}</p>}<button className="button" disabled={busy} type="submit">{busy ? "Saving…" : "Save changes"}</button></form> : error ? <p className="error">{error}</p> : <p className="muted">Loading event…</p>}</section></main>;
}
