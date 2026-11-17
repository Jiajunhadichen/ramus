import { Seed, StamTree, type TreeNode } from "@/components/stam-tree/StamTree";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { queryOptions, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { createGarden, deleteGardenForever, ensureDemoGarden, importGarden, listGardens, renameGarden, trashGarden } from "@/lib/garden.functions";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import type { ValidationError } from "@/lib/stam/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useBringIn } from "@/hooks/use-bring-in";
import { BringInWindow, type Incoming } from "@/components/garden/BringInWindow";
import { CollectorStamp } from "@/components/garden/AccessionStamp";

const gardensQuery = queryOptions({
  queryKey: ["gardens"],
  queryFn: async () => { await ensureDemoGarden(); return listGardens(); },
});

export const Route = createFileRoute("/_authenticated/gardens")({
  head: () => ({
    meta: [
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { title: "My gardens — Ramus" },
      { name: "description", content: "Your Ramus gardens, pressed as specimen plates." },
      { property: "og:title", content: "My gardens — Ramus" },
      { property: "og:description", content: "Your Ramus gardens, pressed as specimen plates." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(gardensQuery),
  component: GardensPage,
});

function GardensPage() {
  const { data } = useSuspenseQuery(gardensQuery);
  const navigate = useNavigate();
  const [newOpen, setNewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  // words pasted or dropped on this page start a new tree; adding to an existing one happens in that garden
  const [incoming, setIncoming] = useState<Incoming | null>(null);
  const [bringOpen, setBringOpen] = useState(false);
  useBringIn((got) => { setIncoming(got); setBringOpen(true); });
  const active = data.filter((g) => !g.deleted_at);
  const trash = data.filter((g) => g.deleted_at);
  return (
    <main className="page py-10">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <p className="eyebrow">Herbarium</p>
          <h1 className="font-display text-title leading-[1.1]">My gardens</h1>
        </div>
        <FirstVisitStamp />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setImportOpen(true)}>Import a Ramus file</Button>
          <Button variant="outline" onClick={() => setNewOpen(true)}>Start from a question</Button>
          <Button onClick={() => setBringOpen(true)}>Grow a tree from conversations</Button>
        </div>
      </div>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {active.length === 0 && (
          <div className="border border-ink/70 bg-sheet p-6 sm:col-span-2 lg:col-span-3">
            <Seed><Button onClick={() => setBringOpen(true)}>Grow a tree from conversations</Button></Seed>
          </div>
        )}
        {active.map((g) => <GardenCard key={g.id} g={g} />)}
      </div>
      {trash.length > 0 && <Trash gardens={trash} />}
      <BringInWindow open={bringOpen} onOpenChange={setBringOpen} target={{ kind: "new" }} incoming={incoming} onIncomingTaken={() => setIncoming(null)}
        onGrown={(gid) => navigate({ to: "/g/$id", params: { id: gid }, search: { idea: undefined } })} />
      <NewGardenDialog open={newOpen} onOpenChange={setNewOpen} />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} />
    </main>
  );
}

function NewGardenDialog({ open, onOpenChange, initialTitle = "", then }: { open: boolean; onOpenChange: (o: boolean) => void; initialTitle?: string; then?: ((gardenId: string) => void) | undefined }) {
  const create = useServerFn(createGarden);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [f, setF] = useState({ title: "", rootLabel: "", rootNote: "", person: "" });
  useEffect(() => { if (open) setF((x) => ({ ...x, title: x.title || initialTitle })); }, [open, initialTitle]);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const r = await create({ data: f });
      await qc.invalidateQueries({ queryKey: ["gardens"] });
      onOpenChange(false);
      if (then) then(r.gardenId);
      else navigate({ to: "/g/$id", params: { id: r.gardenId }, search: { idea: undefined } });
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Start a garden</DialogTitle></DialogHeader>
        {then && <p className="hand text-ui">After planting, you will prepare what you brought in.</p>}
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid gap-1.5"><Label>Garden name</Label><Input required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
          <div className="grid gap-1.5"><Label>The first question or idea (root)</Label><Input required maxLength={24} value={f.rootLabel} onChange={(e) => setF({ ...f, rootLabel: e.target.value })} /><span className="text-note text-muted-foreground">{[...f.rootLabel].length}/24</span></div>
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
        <DialogHeader><DialogTitle className="font-display">Import a Ramus file</DialogTitle></DialogHeader>
        <p className="text-ui text-muted-foreground">Paste a Ramus file or upload a .json file. It becomes a new garden.</p>
        <input type="file" accept=".json,application/json" aria-label="Upload JSON file" className="text-ui"
          onChange={async (e) => { const file = e.target.files?.[0]; if (file) setText(await file.text()); }} />
        <Textarea aria-label="Ramus file" className="min-h-[240px] text-ui" value={text} onChange={(e) => { setText(e.target.value); setErrors([]); }} />
        {errors.length > 0 && (
          <ul className="grid gap-2  border border-destructive p-3 text-ui" role="alert">
            {errors.map((e, i) => (
              <li key={i}><span className="smallcaps text-note">{e.idea ? `Idea "${e.idea}"` : "Garden"}</span> — <b className="text-destructive">{e.problem}</b>. <span className="text-muted-foreground">{e.fix}</span></li>
            ))}
          </ul>
        )}
        <DialogFooter><Button onClick={submit} disabled={busy || !text.trim()}>Import</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type GardenRow = Awaited<ReturnType<typeof listGardens>>[number];

/** One specimen card: open it, or from its corner rename it or move it to the trash. */
function GardenCard({ g }: { g: GardenRow }) {
  const qc = useQueryClient();
  const trashFn = useServerFn(trashGarden);
  const [renaming, setRenaming] = useState(false);
  async function moveToTrash() {
    try {
      await trashFn({ data: { gardenId: g.id, trash: true } });
      await qc.invalidateQueries({ queryKey: ["gardens"] });
      toast(`“${g.title}” went back to seed.`, { action: { label: "Undo", onClick: async () => { await trashFn({ data: { gardenId: g.id, trash: false } }); await qc.invalidateQueries({ queryKey: ["gardens"] }); } } });
    } catch (e) { toast.error((e as Error).message); }
  }
  const tree = useMemo(() => g.tree.map((n) => ({ ...n, by: "" })) as TreeNode[], [g.tree]);
  return (
    <div className="relative">
      <Link to="/g/$id" params={{ id: g.id }} search={{ idea: undefined }}
        className="plate grid h-full content-start gap-1 border border-ink/70 bg-sheet p-6 transition-colors hover:border-ink">
        <div className="mb-4">{tree.length ? <StamTree thumbnail nodes={tree} step={Infinity} selected={null} ariaLabel={`The tree of ${g.title}`} /> : <div className="h-40" />}</div>
        <p className="smallcaps text-note text-muted-foreground">N° {String(g.specimen_no).padStart(3, "0")}</p>
        <h2 className="font-display text-head leading-tight">{g.title}</h2>
        {g.line && <p className="hand truncate text-read" title={g.line}>{g.line}</p>}
        <p className="text-note text-muted-foreground"><Stats parts={[[g.ideas, "ideas"], [g.people, "people"]]} /></p>
        <p className="text-note text-muted-foreground">Updated {new Date(g.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
      </Link>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`More for ${g.title}`} className="absolute right-2 top-2  px-2 py-0.5 text-read leading-none text-muted-foreground hover:bg-ink/10 hover:text-foreground">⋯</button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>Rename…</DropdownMenuItem>
          {g.mine && <DropdownMenuItem onSelect={() => void moveToTrash()}>Back to seed</DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameDialog g={g} open={renaming} onOpenChange={setRenaming} />
    </div>
  );
}

function RenameDialog({ g, open, onOpenChange }: { g: GardenRow; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const rename = useServerFn(renameGarden);
  const [title, setTitle] = useState(g.title);
  useEffect(() => { if (open) setTitle(g.title); }, [open, g.title]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-display">Rename the garden</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={async (e) => {
          e.preventDefault();
          try { await rename({ data: { gardenId: g.id, title } }); await qc.invalidateQueries({ queryKey: ["gardens"] }); onOpenChange(false); }
          catch (err) { toast.error((err as Error).message); }
        }}>
          <Input aria-label="Name" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} autoFocus />
          <DialogFooter><Button type="submit" disabled={!title.trim() || title.trim() === g.title}>Rename</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The trash, like a notebook's: restore a garden, or delete it forever after one clear question. */
function Trash({ gardens }: { gardens: GardenRow[] }) {
  const qc = useQueryClient();
  const trashFn = useServerFn(trashGarden);
  const deleteFn = useServerFn(deleteGardenForever);
  const [open, setOpen] = useState(false);
  const [doomed, setDoomed] = useState<GardenRow | null>(null);
  const [busy, setBusy] = useState(false);
  async function restore(g: GardenRow) {
    try { await trashFn({ data: { gardenId: g.id, trash: false } }); await qc.invalidateQueries({ queryKey: ["gardens"] }); toast.success(`“${g.title}” is planted again.`); }
    catch (e) { toast.error((e as Error).message); }
  }
  async function deleteForever(g: GardenRow) {
    setBusy(true);
    try {
      await deleteFn({ data: { gardenId: g.id } });
      // a deleted example garden is not planted again for this person
      if (g.is_demo) { await supabase.auth.updateUser({ data: { ramus_demo_dismissed: true } }); await supabase.auth.refreshSession(); }
      await qc.invalidateQueries({ queryKey: ["gardens"] });
      toast.success(`“${g.title}” was deleted.`);
      setDoomed(null);
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  }
  return (
    <section aria-label="Seeds" className="mt-12 border-t border-rule pt-4">
      <button type="button" className="text-ui text-muted-foreground hover:text-foreground" aria-expanded={open} onClick={() => setOpen(!open)}>
        Seeds ({gardens.length}) {open ? "▴" : "▾"}
      </button>
      {open && (
        <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {gardens.map((g) => (
            <li key={g.id} className="grid gap-1 border border-ink/70 bg-sheet p-6 opacity-70">
              <p className="smallcaps text-note text-muted-foreground">N° {String(g.specimen_no).padStart(3, "0")}</p>
              <p className="font-display text-head leading-tight">{g.title}</p>
              <p className="text-note text-muted-foreground">A seed since {new Date(g.deleted_at!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</p>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => void restore(g)}>Plant again</Button>
                <button type="button" className="ml-auto text-ui text-destructive underline-offset-4 hover:underline" onClick={() => setDoomed(g)}>Delete forever</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={!!doomed} onOpenChange={(o) => { if (!o && !busy) setDoomed(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-display">Delete “{doomed?.title}” forever?</AlertDialogTitle>
            <AlertDialogDescription>Its tree, notes and conversations will be gone and cannot be planted again.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel autoFocus disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction className={buttonVariants({ variant: "destructive" })} disabled={busy} onClick={(e) => { e.preventDefault(); if (doomed) void deleteForever(doomed); }}>{busy ? "Deleting…" : "Delete forever"}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

/** A stats line that wraps only at the " · " separators. */
function Stats({ parts }: { parts: [number, string][] }) {
  return <>{parts.map(([n, w], i) => <span key={w}>{i > 0 && " · "}<span className="whitespace-nowrap">{n} {w}</span></span>)}</>;
}

/** On a new collector's first visit, the accession stamp is pressed once beside the title. */
function FirstVisitStamp() {
  const [since, setSince] = useState<string | null>(null);
  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const key = `ramus-collector-stamp:${u.id}`;
      try {
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "1");
      } catch { return; }
      // only for someone who joined in the last day
      if (Date.now() - new Date(u.created_at).getTime() > 86_400_000) return;
      setSince(new Date(u.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }));
    });
  }, []);
  return since ? <CollectorStamp since={since} /> : null;
}
