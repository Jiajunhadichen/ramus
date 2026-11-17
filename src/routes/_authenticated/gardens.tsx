import { Seed } from "@/components/stam-tree/StamTree";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { createGarden, ensureDemoGarden, importGarden, listGardens } from "@/lib/garden.functions";
import type { ValidationError } from "@/lib/stam/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

const gardensQuery = queryOptions({
  queryKey: ["gardens"],
  queryFn: async () => { await ensureDemoGarden(); return listGardens(); },
});

export const Route = createFileRoute("/_authenticated/gardens")({
  head: () => ({
    meta: [
      { title: "My gardens — Ramus" },
      { name: "description", content: "Your Ramus gardens, pressed as specimen cards." },
      { property: "og:title", content: "My gardens — Ramus" },
      { property: "og:description", content: "Your Ramus gardens, pressed as specimen cards." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(gardensQuery),
  component: GardensPage,
});

function GardensPage() {
  const { data } = useSuspenseQuery(gardensQuery);
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  return (
    <main className="mx-auto max-w-[1180px] px-5 py-10">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="eyebrow">Herbarium</p>
          <h1 className="font-display text-[40px] leading-[1.1]">My gardens</h1>
        </div>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>Import Stam JSON</Button>
          <Button onClick={() => setNewOpen(true)}>Start a garden</Button>
        </div>
      </div>
      {data.length === 0 && <Seed><Button onClick={() => setNewOpen(true)}>Start a garden</Button></Seed>}
      <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {data.map((g) => (
          <Link key={g.id} to="/g/$id" params={{ id: g.id }} search={{ idea: undefined }}
            className="block rounded-md border border-rule bg-sheet p-4 transition-colors hover:border-ink">
            <p className="border-b border-rule pb-1 smallcaps text-[13px]">Specimen Nº {String(g.specimen_no).padStart(3, "0")}</p>
            <h2 className="mt-2 font-display text-lg leading-snug">{g.title}</h2>
            <p className="mt-2 smallcaps text-[13px] text-muted-foreground">
              {g.ideas} ideas · {g.knots} knots · {g.dormant} resting · {g.merges} merges · {g.people} people
            </p>
            <p className="mt-1 smallcaps text-[13px] text-muted-foreground">Last change {new Date(g.updated_at).toLocaleString()}</p>
          </Link>
        ))}
      </div>
      <NewGardenDialog open={newOpen} onOpenChange={setNewOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </main>
  );
}

function NewGardenDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const create = useServerFn(createGarden);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", rootLabel: "", rootNote: "", person: "" });
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await create({ data: f });
      await qc.invalidateQueries({ queryKey: ["gardens"] });
      navigate({ to: "/g/$id", params: { id: r.gardenId }, search: { idea: undefined } });
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Start a garden</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5"><Label>Garden name</Label><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>The first question or idea (root)</Label><Input required maxLength={24} value={f.rootLabel} onChange={(e) => setF({ ...f, rootLabel: e.target.value })} /><span className="text-xs text-muted-foreground">{[...f.rootLabel].length}/24</span></div>
          <div className="grid gap-1.5"><Label>Note</Label><Textarea value={f.rootNote} onChange={(e) => setF({ ...f, rootNote: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>Who raised it?</Label><Input required value={f.person} onChange={(e) => setF({ ...f, person: e.target.value })} placeholder="Your name" /></div>
          <DialogFooter><Button type="submit" disabled={busy}>Plant it</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const doImport = useServerFn(importGarden);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const [errors, setErrors] = useState<ValidationError[]>([]);
  const [busy, setBusy] = useState(false);
  async function submit() {
    setErrors([]);
    let json: unknown;
    try { json = JSON.parse(text); } catch (e) {
      return setErrors([{ idea: null, problem: "This is not valid JSON: " + (e as Error).message, fix: "Check for a missing comma or quote." }]);
    }
    setBusy(true);
    try {
      const r = await doImport({ data: { json } });
      if (!r.ok) return setErrors(r.errors);
      await qc.invalidateQueries({ queryKey: ["gardens"] });
      navigate({ to: "/g/$id", params: { id: r.gardenId }, search: { idea: undefined } });
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle className="font-display">Import Stam JSON</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">Paste a Stam JSON garden or upload a .json file. It becomes a new garden.</p>
        <input type="file" accept=".json,application/json" aria-label="Upload JSON file" className="text-sm"
          onChange={async (e) => { const file = e.target.files?.[0]; if (file) setText(await file.text()); }} />
        <Textarea aria-label="Stam JSON" className="min-h-[240px] text-[15px]" value={text} onChange={(e) => { setText(e.target.value); setErrors([]); }} />
        {errors.length > 0 && (
          <ul className="grid gap-2 rounded border border-destructive p-3 text-sm" role="alert">
            {errors.map((e, i) => (
              <li key={i}><span className="smallcaps text-[13px]">{e.idea ? `Idea "${e.idea}"` : "Garden"}</span> — <b className="text-destructive">{e.problem}</b>. <span className="text-muted-foreground">{e.fix}</span></li>
            ))}
          </ul>
        )}
        <DialogFooter><Button onClick={submit} disabled={busy || !text.trim()}>Import</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
