import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SiteHeader } from "@/components/SiteHeader";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Sign in — Ramus" },
      { name: "description", content: "Sign in to Ramus to tend your group’s idea gardens." },
      { property: "og:title", content: "Sign in — Ramus" },
      { property: "og:description", content: "Sign in to Ramus to tend your group’s idea gardens." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; err?: boolean } | null>(null);
  const navigate = useNavigate();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMsg({ text: error.message, err: true });
      navigate({ to: "/gardens" });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/gardens" } });
      setBusy(false);
      if (error) return setMsg({ text: error.message, err: true });
      if (data.session) navigate({ to: "/gardens" });
      else setMsg({ text: "Check your email to confirm your account, then sign in." });
    }
  }

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="page"><div className="mt-16 max-w-sm border border-rule bg-sheet p-6">
        <p className="eyebrow">{mode === "in" ? "Welcome back" : "New collector"}</p>
        <h1 className="font-display text-2xl">{mode === "in" ? "Sign in" : "Create an account"}</h1>
        <form onSubmit={submit} className="mt-5 grid gap-4">
          <div className="grid gap-1.5"><Label htmlFor="email">Email</Label><Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label htmlFor="pw">Password</Label><Input id="pw" type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {msg && <p className={"text-sm " + (msg.err ? "text-destructive" : "text-muted-foreground")} role="status">{msg.text}</p>}
          <Button type="submit" disabled={busy}>{busy ? "…" : mode === "in" ? "Sign in" : "Create account"}</Button>
        </form>
        <button type="button" className="mt-4 text-sm underline underline-offset-4" onClick={() => { setMode(mode === "in" ? "up" : "in"); setMsg(null); }}>
          {mode === "in" ? "No account yet? Create one" : "Already have an account? Sign in"}
        </button>
      </div></main>
    </div>
  );
}
