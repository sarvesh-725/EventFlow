"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Organizer = { id: string; email: string; name: string; role: string; organizerStatus: string | null };
type ModeratedEvent = { id: string; title: string; moderationStatus: string; owner: { name: string; email: string }; _count: { orders: number; tickets: number } };
type AuditLog = { id: string; action: string; entityType: string; entityId: string; createdAt: string; actor: { name: string; email: string } | null; event: { title: string } | null };

export default function AdminPage() {
  const router = useRouter(); const [organizers, setOrganizers] = useState<Organizer[]>([]); const [events, setEvents] = useState<ModeratedEvent[]>([]); const [logs, setLogs] = useState<AuditLog[]>([]); const [error, setError] = useState("");
  useEffect(() => { void (async () => {
    const me = await fetch("/api/v1/auth/me", { credentials: "include" });
    if (!me.ok) { router.push("/login"); return; }
    const user = (await me.json() as { user: { role: string } }).user;
    if (user.role !== "ADMIN") { setError("Admin access is required."); return; }
    const [organizerResponse, eventResponse, auditResponse] = await Promise.all([fetch("/api/v1/admin/organizers", { credentials: "include" }), fetch("/api/v1/admin/events", { credentials: "include" }), fetch("/api/v1/admin/audit-logs?limit=20", { credentials: "include" })]);
    if (!organizerResponse.ok || !eventResponse.ok || !auditResponse.ok) throw new Error("Admin data could not be loaded.");
    setOrganizers((await organizerResponse.json() as { organizers: Organizer[] }).organizers); setEvents((await eventResponse.json() as { events: ModeratedEvent[] }).events); setLogs((await auditResponse.json() as { logs: AuditLog[] }).logs);
  })().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Admin data could not be loaded.")); }, [router]);
  async function approve(id: string) { const response = await fetch(`/api/v1/admin/organizers/${id}/approve`, { method: "POST", credentials: "include" }); if (!response.ok) { setError("Approval failed."); return; } setOrganizers((current) => current.filter((organizer) => organizer.id !== id)); }
  async function moderate(id: string, status: "VISIBLE" | "HIDDEN" | "REMOVED") { const response = await fetch(`/api/v1/admin/events/${id}/moderation`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) }); if (!response.ok) { setError("Moderation update failed."); return; } setEvents((current) => current.map((event) => event.id === id ? { ...event, moderationStatus: status } : event)); }
  return <main className="container"><div className="dashboard-header"><div><p className="eyebrow">Platform administration</p><h1>Moderation desk</h1></div><Link className="button secondary" href="/dashboard">Back to dashboard</Link></div>{error && <p className="error">{error}</p>}<div className="grid"><section className="card"><p className="eyebrow">Organizer requests</p><h2>Pending approval</h2>{organizers.length ? <div className="stack">{organizers.map((organizer) => <div className="ticket-option" key={organizer.id}><div><strong>{organizer.name}</strong><small>{organizer.email}</small></div><button className="button" onClick={() => void approve(organizer.id)} type="button">Approve</button></div>)}</div> : <p className="muted">No pending requests.</p>}</section><section className="card"><p className="eyebrow">Event safety</p><h2>Moderation</h2>{events.length ? <div className="stack">{events.map((event) => <div className="ticket-option" key={event.id}><div><strong>{event.title}</strong><small>{event.owner.name} · {event.moderationStatus} · {event._count.tickets} ticket(s)</small></div><div className="actions"><button className="button secondary" onClick={() => void moderate(event.id, "VISIBLE")} type="button">Show</button><button className="button secondary" onClick={() => void moderate(event.id, "HIDDEN")} type="button">Hide</button><button className="button danger" onClick={() => void moderate(event.id, "REMOVED")} type="button">Remove</button></div></div>)}</div> : <p className="muted">No events to review.</p>}</section><section className="card"><p className="eyebrow">Audit trail</p><h2>Recent mutations</h2>{logs.length ? <div className="stack">{logs.map((log) => <div className="ticket-option" key={log.id}><div><strong>{log.action}</strong><small>{log.event?.title ?? log.entityType} · {log.actor?.name ?? "System"}</small></div><small>{new Date(log.createdAt).toLocaleString()}</small></div>)}</div> : <p className="muted">Important actions will appear here.</p>}</section></div></main>;
}
