"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [register, setRegister] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/v1/auth/${register ? "register" : "login"}`, {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
        body: JSON.stringify(register ? { name, email, password } : { email, password })
      });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? "Authentication failed.");
      router.push("/dashboard"); router.refresh();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Authentication failed."); }
    finally { setBusy(false); }
  }

  return <main className="container"><section className="form-card">
    <p className="eyebrow">EventFlow account</p><h1>{register ? "Create your account" : "Welcome back"}</h1>
    <p className="muted">{register ? "Register as an attendee first. You can request organizer approval from your dashboard." : "Your tickets and organizer workspace live behind a secure server session."}</p>
    <form onSubmit={submit}>
      {register && <div className="field"><label htmlFor="name">Name</label><input id="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} /></div>}
      <div className="field"><label htmlFor="email">Email</label><input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></div>
      <div className="field"><label htmlFor="password">Password</label><input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={register ? 12 : 1} /></div>
      {error && <p className="error">{error}</p>}
      <button className="button" disabled={busy} type="submit">{busy ? "Working…" : register ? "Create account" : "Sign in"}</button>
    </form>
    {!register && <p><Link className="nav-link" href="/forgot-password">Forgot your password?</Link></p>}
    <p className="muted">{register ? "Already registered?" : "New here?"} <button className="nav-link" onClick={() => setRegister(!register)} type="button">{register ? "Sign in" : "Create an account"}</button></p>
    <Link className="nav-link" href="/">← Back to events</Link>
  </section></main>;
}
