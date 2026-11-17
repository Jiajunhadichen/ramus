import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

/**
 * One simple window for bringing words in: paste anything, drop any file, or choose one.
 * No formats to pick and nothing to learn; Ramus works out the rest.
 */
export function BringInWindow({ open, onOpenChange, onReceive }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onReceive: (r: { text?: string; files?: File[] }) => void;
}) {
  const [over, setOver] = useState(false);
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const take = (r: { text?: string; files?: File[] }) => { setTyped(""); onOpenChange(false); onReceive(r); };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle className="font-display">Bring in a conversation</DialogTitle></DialogHeader>
        <div
          className={"grid gap-2 rounded-md border border-dashed bg-sheet p-3 transition-colors " + (over ? "border-ink" : "border-ink/40")}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); e.stopPropagation(); setOver(false); const files = [...e.dataTransfer.files]; if (files.length) take({ files }); }}>
          <textarea autoFocus aria-label="Paste anything" placeholder="Paste or drop anything here"
            className="min-h-[180px] w-full resize-y bg-transparent text-[15px] outline-none"
            value={typed} onChange={(e) => setTyped(e.target.value)}
            onPaste={(e) => {
              const files = [...e.clipboardData.files];
              const text = e.clipboardData.getData("text/plain");
              if (files.length) { e.preventDefault(); take({ files }); }
              else if (text.trim()) { e.preventDefault(); take({ text }); }
            }} />
          <div className="flex items-center gap-3">
            <button type="button" className="text-sm underline underline-offset-4" onClick={() => input.current?.click()}>or choose a file</button>
            {typed.trim() && <Button size="sm" className="ml-auto" onClick={() => take({ text: typed })}>Continue</Button>}
            <input ref={input} type="file" multiple className="sr-only" onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) take({ files }); }} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
