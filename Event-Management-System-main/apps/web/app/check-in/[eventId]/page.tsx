"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";

export default function CheckInPage() {
  const params = useParams<{ eventId: string }>();
  const [code, setCode] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    try {
      const response = await fetch(`/api/v1/events/${params.eventId}/check-in`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) });
      const body = await response.json() as { ticket?: { attendeeName?: string | null; publicCodeLast4: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Check-in failed.");
      setMessage(`Checked in ${body.ticket?.attendeeName ?? `ticket ending ${body.ticket?.publicCodeLast4 ?? ""}`}.`); setCode("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Check-in failed."); }
    finally { setBusy(false); }
  }
  return <main className="container"><section className="form-card"><p className="eyebrow">Event operations</p><h1>Check in an attendee</h1><p className="muted">Scan the attendee QR code with a scanner that types into this field, or enter the ticket code manually. The server performs the duplicate-safe check.</p><form onSubmit={submit}><div className="field"><label htmlFor="ticket-code">Ticket code</label><input autoFocus id="ticket-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="EF-…" required /></div>{error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}<button className="button" disabled={busy} type="submit">{busy ? "Checking…" : "Check in"}</button></form><Link className="nav-link" href="/dashboard">← Back to dashboard</Link></section></main>;
}
