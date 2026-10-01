"use client";

import { FormEvent, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";

type TicketDraft = { name: string; price: string; capacity: string; maxPerOrder: string };
type EventForm = { title: string; description: string; venue: string; startsAt: string; endsAt: string; coverImageUrl: string; ticketTypes: TicketDraft[] };

export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState<EventForm>({ title: "", description: "", venue: "", startsAt: "", endsAt: "", coverImageUrl: "", ticketTypes: [{ name: "General admission", price: "0", capacity: "50", maxPerOrder: "10" }] });
  const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  function update(field: Exclude<keyof EventForm, "ticketTypes">, value: string) { setForm((current) => ({ ...current, [field]: value })); }
  function updateTicket(index: number, field: keyof TicketDraft, value: string) {
    setForm((current) => ({ ...current, ticketTypes: current.ticketTypes.map((ticket, ticketIndex) => ticketIndex === index ? { ...ticket, [field]: value } : ticket) }));
  }
  function addTicketType() {
    setForm((current) => ({ ...current, ticketTypes: [...current.ticketTypes, { name: "New ticket tier", price: "0", capacity: "50", maxPerOrder: "10" }] }));
  }
  function removeTicketType(index: number) {
    setForm((current) => current.ticketTypes.length <= 1 ? current : { ...current, ticketTypes: current.ticketTypes.filter((_, ticketIndex) => ticketIndex !== index) });
  }
  async function uploadCover(file: File) {
    setError(""); setMessage("Preparing secure image upload…");
    const signatureResponse = await fetch("/api/v1/uploads/signature", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ resourceType: "image" }) });
    const signature = await signatureResponse.json() as { cloudName?: string; apiKey?: string; timestamp?: number; folder?: string; signature?: string; error?: { message?: string } };
    if (!signatureResponse.ok || !signature.cloudName || !signature.apiKey || !signature.timestamp || !signature.folder || !signature.signature) throw new Error(signature.error?.message ?? "Image upload is not configured.");
    const payload = new FormData(); payload.append("file", file); payload.append("api_key", signature.apiKey); payload.append("timestamp", String(signature.timestamp)); payload.append("folder", signature.folder); payload.append("signature", signature.signature);
    const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`, { method: "POST", body: payload });
    const upload = await uploadResponse.json() as { secure_url?: string; error?: { message?: string } };
    if (!uploadResponse.ok || !upload.secure_url) throw new Error(upload.error?.message ?? "Image upload failed.");
    update("coverImageUrl", upload.secure_url); setMessage("Cover image uploaded.");
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/v1/events", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: form.title, description: form.description, venue: form.venue, startsAt: new Date(form.startsAt).toISOString(), endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : undefined, coverImageUrl: form.coverImageUrl || undefined, ticketTypes: form.ticketTypes.map((ticket) => ({ name: ticket.name, priceMinor: Math.round(Number(ticket.price) * 100), capacity: Number(ticket.capacity), maxPerOrder: Number(ticket.maxPerOrder) })) }) });
      const body = await response.json() as { event?: { slug: string }; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Event could not be created.");
      setMessage("Draft created. Review it from your dashboard and publish it when ready."); router.push("/dashboard");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Event could not be created."); }
    finally { setBusy(false); }
  }
  return <main className="container"><section className="form-card"><p className="eyebrow">Organizer workspace</p><h1>Create a draft event</h1><p className="muted">Set up multiple ticket tiers, then review and publish the draft from your dashboard.</p><form onSubmit={submit}>
    <div className="field"><label>Title</label><input required value={form.title} onChange={(event) => update("title", event.target.value)} /></div>
    <div className="field"><label>Description</label><textarea required value={form.description} onChange={(event) => update("description", event.target.value)} /></div>
    <div className="field"><label>Venue</label><input required value={form.venue} onChange={(event) => update("venue", event.target.value)} /></div>
    <div className="field"><label>Cover image (optional)</label><input accept="image/*" type="file" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCover(file).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Image upload failed.")); }} /><small className="muted">Uploads directly to Cloudinary using a short-lived signed request.</small>{form.coverImageUrl && <Image className="upload-preview" src={form.coverImageUrl} alt="Uploaded event cover preview" width={720} height={240} />}</div>
    <div className="grid"><div className="field"><label>Starts</label><input required type="datetime-local" value={form.startsAt} onChange={(event) => update("startsAt", event.target.value)} /></div><div className="field"><label>Ends</label><input type="datetime-local" value={form.endsAt} onChange={(event) => update("endsAt", event.target.value)} /></div></div>
    <div className="ticket-list"><div className="section-heading"><div><p className="eyebrow">Inventory</p><h2>Ticket tiers</h2></div><button className="button secondary" onClick={addTicketType} type="button">Add tier</button></div>{form.ticketTypes.map((ticket, index) => <div className="card ticket-editor" key={`${index}-${ticket.name}`}><div className="grid"><div className="field"><label htmlFor={`ticket-name-${index}`}>Name</label><input id={`ticket-name-${index}`} required value={ticket.name} onChange={(event) => updateTicket(index, "name", event.target.value)} /></div><div className="field"><label htmlFor={`ticket-price-${index}`}>Price</label><input id={`ticket-price-${index}`} min="0" step="0.01" required type="number" value={ticket.price} onChange={(event) => updateTicket(index, "price", event.target.value)} /></div></div><div className="grid"><div className="field"><label htmlFor={`ticket-capacity-${index}`}>Capacity</label><input id={`ticket-capacity-${index}`} min="1" required type="number" value={ticket.capacity} onChange={(event) => updateTicket(index, "capacity", event.target.value)} /></div><div className="field"><label htmlFor={`ticket-limit-${index}`}>Max per order</label><input id={`ticket-limit-${index}`} min="1" required type="number" value={ticket.maxPerOrder} onChange={(event) => updateTicket(index, "maxPerOrder", event.target.value)} /></div></div><button className="button secondary" disabled={form.ticketTypes.length <= 1} onClick={() => removeTicketType(index)} type="button">Remove tier</button></div>)}</div>
    {error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}<button className="button" disabled={busy} type="submit">{busy ? "Creating…" : "Create draft"}</button>
  </form></section></main>;
}
