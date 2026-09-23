"use client";
import { useState } from "react";
import { browserClient } from "@/lib/supabase/client";

export default function Login() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg("");
    const { error } = await browserClient().auth.signInWithOtp({
      email, options: { emailRedirectTo: `${location.origin}/auth/callback`, shouldCreateUser: true },
    });
    setBusy(false);
    setMsg(error ? error.message : "Check your inbox — the sign-in link is on its way.");
  }
  return (
    <form className="login" onSubmit={send}>
      <h1>Do Tell.</h1>
      <p>Invite-only. Enter your email and we’ll send a sign-in link.</p>
      <input id="email" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send sign-in link"}</button>
      {msg && <div className="msg">{msg}</div>}
    </form>
  );
}
