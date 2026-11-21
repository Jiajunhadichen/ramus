import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import sample from "../../docs/sample-garden.json";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { SiteHeader } from "@/components/SiteHeader";
import { StamTree } from "@/components/stam-tree/StamTree";
import { stamToTree } from "@/lib/stam/toTree";
import { demoInEnglish } from "@/lib/stam/demo-labels";
import type { StamGarden } from "@/lib/stam/types";

type Mode = "in" | "up" | "forgot" | "recover" | "keep";
const MODES: Mode[] = ["up", "forgot", "recover", "keep"];

export const Route = createFileRoute("/auth")({
  // in: sign in · up: start a garden (a guest keeps theirs) · forgot: ask for a reset link
  // recover: the reset link landed, choose a new password · keep: a guest's email is confirmed, choose a password
  validateSearch: (s: Record<string, unknown>): { mode?: Mode } => (MODES.includes(s["mode"] as Mode) ? { mode: s["mode"] as Mode } : {}),
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

const TITLES: Record<Mode, [string, string]> = {
  in: ["Welcome back", "Your gardens"],
  up: ["Herbarium of ideas", "Start a garden"],
  forgot: ["Welcome back", "Forgotten password"],
  recover: ["Welcome back", "Choose a new password"],
  keep: ["Herbarium of ideas", "Choose a password"],
};

function AuthPage() {
  const search = Route.useSearch();
  const [mode, setMode] = useState<Mode>(search.mode ?? "in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ to: string; then: string } | null>(null);
  // a guest (trying Ramus without an account) who signs up keeps the same account, and so their tree
  const [guest, setGuest] = useState(false);
  const navigate = useNavigate();
  const nodes = useMemo(() => stamToTree(sample as StamGarden).map(demoInEnglish), []);
  useEffect(() => { setMode(search.mode ?? "in"); }, [search.mode]);
  // someone already signed in goes straight to their gardens, unless they are here to choose a password or keep a guest tree
  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user;
      if (!user) return;
      if (user.is_anonymous) setGuest(true);
      else if (mode !== "recover" && mode !== "keep") navigate({ to: "/gardens" });
    });
  }, [navigate, mode]);

  const here = (m: Mode) => `${window.location.origin}/auth?mode=${m}`;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const done = (err: { message: string } | null) => { setBusy(false); if (err) setError(err.message); return !err; };
    if (mode === "in") {
      if (done((await supabase.auth.signInWithPassword({ email, password })).error)) navigate({ to: "/gardens" });
    } else if (mode === "up" && guest) {
      // the guest account becomes a real one once the email is confirmed; the password is chosen after that
      if (done((await supabase.auth.updateUser({ email }, { emailRedirectTo: here("keep") })).error)) setSent({ to: email, then: "Open it to keep your tree." });
    } else if (mode === "up") {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin + "/gardens" } });
      if (!done(error)) return;
      if (data.session) navigate({ to: "/gardens" });
      else setSent({ to: email, then: "Open it to start your garden." });
    } else if (mode === "forgot") {
      if (done((await supabase.auth.resetPasswordForEmail(email, { redirectTo: here("recover") })).error)) setSent({ to: email, then: "Open it to choose a new password." });
    } else if (done((await supabase.auth.updateUser({ password })).error)) {
      navigate({ to: "/gardens" });
    }
  }
  async function tryFirst() {
    setBusy(true); setError(null);
    const { error } = await supabase.auth.signInAnonymously();
    setBusy(false);
    if (error) return setError("Trying Ramus without an account is not open yet. Start a garden with your email instead.");
    navigate({ to: "/gardens" });
  }
  const switchTo = (m: Mode) => { setMode(m); setError(null); setSent(null); };
  const [eyebrow, title] = mode === "up" && guest ? ["Herbarium of ideas", "Keep your tree"] : TITLES[mode];
  const asksEmail = mode === "in" || mode === "up" || mode === "forgot";
  const asksPassword = mode === "in" || (mode === "up" && !guest) || mode === "recover" || mode === "keep";
  const action = { in: "Sign in", up: guest ? "Send the link" : "Create account", forgot: "Send a reset link", recover: "Save the new password", keep: "Save the password" }[mode];
  const link = "justify-self-start text-ui text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

  return (
    <div className="min-h-screen">
      <SiteHeader />
      <main className="page grid items-center gap-12 py-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <figure className="hidden opacity-50 lg:block" aria-hidden="true">
          <StamTree thumbnail thumbClass="h-[60vh]" nodes={nodes} step={Infinity} selected={null} ariaLabel="The origin of Ramus" />
        </figure>
        <section className="measure grid gap-6">
          {sent ? (
            <>
              <h1 className="font-display text-title leading-[1.1]">Check your email</h1>
              <p className="text-read">We sent a link to {sent.to}. {sent.then}</p>
            </>
          ) : (
            <>
              <div className="grid gap-1">
                <p className="eyebrow">{eyebrow}</p>
                <h1 className="font-display text-title leading-[1.1]">{title}</h1>
                {mode === "up" && guest && <p className="text-read">Your tree stays where it is. We send you a link; open it, choose a password, and the tree is yours to keep.</p>}
                {mode === "keep" && <p className="text-read">The tree is yours now. Choose a password to sign in next time.</p>}
                {mode === "forgot" && <p className="text-read">We send you a link to choose a new one.</p>}
              </div>
              <form onSubmit={submit} className="grid gap-5">
                {asksEmail && <Field id="email" label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />}
                {asksPassword && <Field id="password" label={mode === "in" ? "Password" : "New password"} type="password" autoComplete={mode === "in" ? "current-password" : "new-password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />}
                <div className="grid gap-2">
                  <Button type="submit" className="justify-self-start" disabled={busy}>{busy ? "…" : action}</Button>
                  {error && <p className="text-ui text-destructive" role="alert">{error}</p>}
                </div>
              </form>
              {mode === "in" && <button type="button" className={link} onClick={() => switchTo("forgot")}>Forgot your password?</button>}
              {(mode === "in" || mode === "up") && !guest && (
                <button type="button" className={link} onClick={() => switchTo(mode === "in" ? "up" : "in")}>
                  {mode === "in" ? "New here? Start a garden" : "Already have a garden? Sign in"}
                </button>
              )}
              {mode === "forgot" && <button type="button" className={link} onClick={() => switchTo("in")}>Back to sign in</button>}
              {(mode === "in" || mode === "up") && !guest && <button type="button" className={link} disabled={busy} onClick={() => void tryFirst()}>Or try it first, without an account</button>}
              {mode === "up" && <p className="text-note text-muted-foreground">What you bring in is kept in your gardens and read by AI models to grow the tree. <Link to="/privacy" className="underline underline-offset-4">Privacy</Link></p>}
            </>
          )}
        </section>
      </main>
    </div>
  );
}
