import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { deleteAccount } from "@/lib/account.functions";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy — Ramus" },
      { name: "description", content: "What Ramus keeps, who reads it, and how to delete it." },
      { property: "og:title", content: "Privacy — Ramus" },
      { property: "og:description", content: "What Ramus keeps, who reads it, and how to delete it." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

const ISSUES = "https://github.com/Jiajunhadichen/ramus/issues";

/** Plain words about what happens to what people bring in. Keep it true to the code: change both together. */
export const SECTIONS: { title: string; text: string[] }[] = [
  { title: "What Ramus keeps", text: [
    "Your email address and a password, held by the sign-in service. The gardens you start, and every conversation you bring into them, word for word, with any file you upload. The ideas on each tree, who said them, and the history of every change.",
    "Ramus also counts how much reading each person uses each day, so the service stays affordable: the number of trees grown and the size of each reading, never the words.",
  ] },
  { title: "Who reads it", text: [
    "The people you share a garden with, and no one else in Ramus.",
    "To grow a tree, Ramus sends the words you brought in to AI models through Lovable’s AI gateway: at present OpenAI (GPT-5.5) and Google (Gemini). They read the words and send back the shape of the tree. Ramus uses your words for nothing but your garden, and never shows them to other people.",
    "Bring in only conversations whose people agreed to that.",
  ] },
  { title: "Where it lives", text: [
    "Ramus is built and hosted with Lovable (lovable.dev). The database, the files and the sign-in run on Lovable Cloud; the AI calls go through Lovable’s gateway. Their privacy policies cover how they process data for Ramus.",
  ] },
  { title: "Trying without an account", text: [
    "If you try Ramus first, it makes a temporary account that lives in this browser. Sign up to keep what you grew: the same account becomes yours. A temporary account that is not kept is deleted, with everything in it, after seven days.",
  ] },
  { title: "Deleting", text: [
    "Move a garden to the trash and delete it forever there: its tree, its conversations and their files are gone.",
    "Delete your account below: every garden you started is deleted, for everyone in it, and then the account itself. Gardens other people started stay theirs.",
  ] },
];

function Privacy() {
  return (
    <>
      <SiteHeader />
      <main className="page py-16"><div className="measure">
        <p className="eyebrow">Privacy</p>
        <h1 className="mt-3 font-display text-title leading-[1.1]">What happens to what you bring in</h1>
        {SECTIONS.map((s) => (
          <section key={s.title} className="mt-12">
            <h2 className="smallcaps border-b border-rule pb-2 text-read">{s.title}</h2>
            {s.text.map((t) => <p key={t} className="essay mt-4">{t}</p>)}
          </section>
        ))}
        <DeleteAccount />
        <section className="mt-12">
          <h2 className="smallcaps border-b border-rule pb-2 text-read">Questions</h2>
          <p className="essay mt-4">Ask on <a className="underline underline-offset-4" href={ISSUES} target="_blank" rel="noreferrer">GitHub</a>, or write to have your data deleted if you can no longer sign in.</p>
          <p className="smallcaps mt-6 text-note text-muted-foreground">Last changed 20 November 2026</p>
        </section>
      </div></main>
    </>
  );
}

/** Only for someone signed in: delete the account and every garden it started, after typing “delete”. */
function DeleteAccount() {
  const [signedIn, setSignedIn] = useState(false);
  const [asking, setAsking] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useServerFn(deleteAccount);
  const qc = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setSignedIn(!!data.user)); }, []);
  if (!signedIn) return null;
  async function go() {
    setBusy(true); setError(null);
    try {
      await remove({ data: { confirm: typed } });
      await qc.cancelQueries(); qc.clear();
      await supabase.auth.signOut();
      navigate({ to: "/", replace: true });
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }
  return (
    <section className="mt-12 grid gap-4">
      <h2 className="smallcaps border-b border-rule pb-2 text-read">Your account</h2>
      {!asking ? (
        <Button variant="outline" className="justify-self-start" onClick={() => setAsking(true)}>Delete my account</Button>
      ) : (
        <div className="grid gap-3">
          <p className="essay">This deletes every garden you started, for everyone in it, and then your account. It cannot be undone. Type <span className="smallcaps">delete</span> to confirm.</p>
          <input aria-label="Type delete to confirm" value={typed} onChange={(e) => setTyped(e.target.value)}
            className="w-48 border-0 border-b border-rule bg-transparent px-0 py-1.5 text-read outline-none focus:border-ink" />
          <div className="flex items-center gap-3">
            <Button variant="destructive" disabled={busy || typed.trim().toLowerCase() !== "delete"} onClick={() => void go()}>{busy ? "Deleting…" : "Delete forever"}</Button>
            <button type="button" className="text-ui text-muted-foreground underline-offset-4 hover:underline" onClick={() => { setAsking(false); setTyped(""); }}>Keep my account</button>
          </div>
          {error && <p role="alert" className="text-ui text-destructive">{error}</p>}
        </div>
      )}
    </section>
  );
}
