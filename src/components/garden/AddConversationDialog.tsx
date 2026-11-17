import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { addConversation } from "@/lib/garden.functions";
import { splitConversation } from "@/lib/stam/split";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GardenData } from "./model";

const selectCls = "h-9 rounded-md border border-input bg-sheet px-2 text-sm";

export function AddConversationDialog({ data, open, onOpenChange, onSaved }: { data: GardenData; open: boolean; onOpenChange: (o: boolean) => void; onSaved: (id: string) => Promise<unknown> }) {
  const add = useServerFn(addConversation);
  const people = data.contributors as any[];
  const [f, setF] = useState({ title: "", date: "", source: "meeting" as "meeting" | "chat" | "notes" | "other", text: "" });
  const [consent, setConsent] = useState(false);
  const [map, setMap] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const parts = useMemo(() => splitConversation(f.text), [f.text]);
  const speakers = useMemo(() => [...new Set(parts.map((p) => p.speaker).filter(Boolean) as string[])], [parts]);
  const target = (s: string) => map[s] ?? people.find((p) => p.name === s)?.id ?? `new:${s}`;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!consent) { toast.error("Confirm that everyone agreed to have it recorded."); return; }
    setBusy(true);
    try {
      const r = await add({ data: { gardenId: data.garden.id, ...f, date: f.date || null, consent, speakers: Object.fromEntries(speakers.map((s) => [s, target(s)])) } });
      await onSaved(r.id);
      toast.success("Conversation added.");
      onOpenChange(false);
      setF({ title: "", date: "", source: "meeting", text: "" }); setConsent(false); setMap({});
    } catch (err) { toast.error((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader><DialogTitle className="font-display">Add a conversation</DialogTitle></DialogHeader>
        <form className="grid gap-3" onSubmit={submit}>
          <div className="grid grid-cols-[1fr_auto_auto] gap-2">
            <div className="grid gap-1.5"><Label htmlFor="c-t">Title</Label><Input id="c-t" required value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="c-d">Date</Label><Input id="c-d" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></div>
            <div className="grid gap-1.5"><Label htmlFor="c-s">Source</Label>
              <select id="c-s" className={selectCls} value={f.source} onChange={(e) => setF({ ...f, source: e.target.value as never })}>
                <option value="meeting">Meeting</option><option value="chat">Chat</option><option value="notes">Notes</option><option value="other">Other</option>
              </select>
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="c-x">Text</Label>
            <Textarea id="c-x" required className="min-h-[180px] font-mono text-xs" placeholder={"Ana: What if…\nBo: Then we could…"} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} />
            <span className="text-xs text-muted-foreground">{parts.length} message{parts.length === 1 ? "" : "s"} · lines starting with “Name:” start a new message</span>
          </div>
          {speakers.length > 0 && (
            <div className="grid gap-2 rounded border border-rule p-3">
              <span className="eyebrow">Who is who</span>
              {speakers.map((s) => (
                <div key={s} className="grid grid-cols-[8em_1fr] items-center gap-2 text-sm">
                  <span className="truncate font-medium">{s}</span>
                  <select aria-label={`Person for ${s}`} className={selectCls} value={target(s)} onChange={(e) => setMap({ ...map, [s]: e.target.value })}>
                    {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    <option value={`new:${s}`}>+ Add “{s}” as a new person</option>
                  </select>
                </div>
              ))}
            </div>
          )}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox checked={consent} onCheckedChange={(v) => setConsent(v === true)} aria-label="Everyone in this conversation agreed to have it recorded here." className="mt-0.5" />
            <span>Everyone in this conversation agreed to have it recorded here.</span>
          </label>
          <DialogFooter><Button type="submit" disabled={!consent || busy}>Save conversation</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
