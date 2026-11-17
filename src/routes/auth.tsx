import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import sample from "../../docs/sample-garden.json";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { StamTree } from "@/components/stam-tree/StamTree";
import { stamToTree } from "@/lib/stam/toTree";
import { demoInEnglish } from "@/lib/stam/demo-labels";
import type { StamGarden } from "@/lib/stam/types";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { mode?: "in" | "up" } => (s["mode"] === "up" ? { mode: "up" } : {}),
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "Sign in — Ramus" },
      { name: "description", content: "Sign in to Ramus, or start a garden for your group’s ideas." },
      { property: "og:title", content: "Sign in — Ramus" },
      { property: "og:description", content: "Sign in to Ramus, or start a garden for your group’s ideas." },
    ],
  }),
  component: AuthPage,
});

/** A ledger field: small-caps label above, one rule underneath. */
function Field({ id, label, ...rest }: { id: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="grid gap-1">
      <label htmlFor={id} className="smallcaps text-note text-muted-foreground">{label}</label>
      <input id={id} name={id} {...rest}
        className="w-full border-0 border-b border-rule bg-transparent px-0 py-1.5 text-read text-foreground outline-none transition-colors focus:border-ink" />
    </div>
  );
}

function AuthPage() {
  const search = Route.useSearch();
  const [mode, setMode] = useState<"in" | "up">(search.mode ?? "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const navigate = useNavigate();
  const nodes = useMemo(() => stamToTree(sample as StamGarden).map(demoInEnglish), []);
  useEffect(() => { setMode(search.mode ?? "in"); }, [search.mode]);
  // someone already signed in goes straight to their gardens
  useEffect(() => { void supabase.auth.getSession().then(({ data }) => { if (data.session) navigate({ to: "/gardens" }); }); }, [navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setError(error.message);
      navigate({ to: "/gardens" });
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/gardens" } });
      setBusy(false);
      if (error) return setError(error.message);
      if (data.session) navigate({ to: "/gardens" });
      else setSentTo(email);
    }
  }
  const switchTo = (m: "in" | "up") => { setMode(m); setError(null); setSentTo(null); };

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="page grid items-center gap-12 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <figure className="hidden opacity-50 lg:block" aria-hidden="true">
          <StamTree thumbnail thumbClass="h-[60vh]" nodes={nodes} step={Infinity} selected={null} ariaLabel="The origin of Ramus" />
        </figure>
        <section className="measure grid gap-6">
          {sentTo ? (
            <>
              <h1 className="font-display text-title leading-[1.1]">Check your email</h1>
              <p className="text-read">We sent a link to {sentTo}. Open it to start your garden.</p>
            </>
          ) : (
            <>
              <div className="grid gap-1">
                <p className="eyebrow">{mode === "in" ? "Welcome back" : "Herbarium of ideas"}</p>
                <h1 className="font-display text-title leading-[1.1]">{mode === "in" ? "Your gardens" : "Start a garden"}</h1>
              </div>
              <form onSubmit={submit} className="grid gap-5">
                <Field id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                <Field id="password" label="Password" type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
                <div className="grid gap-2">
                  <Button type="submit" className="justify-self-start" disabled={busy}>{busy ? "…" : mode === "in" ? "Sign in" : "Create account"}</Button>
                  {error && <p className="text-ui text-destructive" role="alert">{error}</p>}
                </div>
              </form>
              <button type="button" className="justify-self-start text-ui text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => switchTo(mode === "in" ? "up" : "in")}>
                {mode === "in" ? "New here? Start a garden" : "Already have a garden? Sign in"}
              </button>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
