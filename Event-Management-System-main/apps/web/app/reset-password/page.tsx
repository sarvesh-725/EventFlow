"use client";

import Link from "next/link";
import { Suspense } from "react";
import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const router = useRouter(); const searchParams = useSearchParams(); const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/v1/auth/reset-password", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, password }) });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Password reset failed.");
      router.push("/dashboard"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Password reset failed."); }
    finally { setBusy(false); }
  }
  return <section className="form-card"><p className="eyebrow">Account recovery</p><h1>Choose a new password</h1><p className="muted">Use at least 12 characters. This link can only be used once.</p><form onSubmit={submit}><div className="field"><label htmlFor="password">New password</label><input id="password" type="password" minLength={12} value={password} onChange={(event) => setPassword(event.target.value)} required /></div>{error && <p className="error">{error}</p>}<button className="button" disabled={busy || !token} type="submit">{busy ? "Updating…" : "Update password"}</button></form>{!token && <p className="error">This page needs a reset link from your email.</p>}<Link className="nav-link" href="/login">← Back to sign in</Link></section>;
}

export default function ResetPasswordPage() {
  return <main className="container"><Suspense fallback={<section className="form-card"><p className="muted">Loading reset form…</p></section>}><ResetPasswordForm /></Suspense></main>;
}
