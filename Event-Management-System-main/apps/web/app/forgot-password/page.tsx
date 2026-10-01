"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(""); const [message, setMessage] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/v1/auth/forgot-password", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
      const body = await response.json() as { message?: string; error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Request failed.");
      setMessage(body.message ?? "If the account exists, a reset link will be sent.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Request failed."); }
    finally { setBusy(false); }
  }
  return <main className="container"><section className="form-card"><p className="eyebrow">Account recovery</p><h1>Reset your password</h1><p className="muted">Enter your account email. For privacy, the response is the same whether an account exists or not.</p><form onSubmit={submit}><div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>{error && <p className="error">{error}</p>}{message && <p className="success">{message}</p>}<button className="button" disabled={busy} type="submit">{busy ? "Sending…" : "Send reset link"}</button></form><Link className="nav-link" href="/login">← Back to sign in</Link></section></main>;
}
