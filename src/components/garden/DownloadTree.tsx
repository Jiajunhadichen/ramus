import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { fileName, saveFile, treePng, treeSvg } from "@/lib/export/treeImage";

/** Save the tree as it is drawn now: a PNG to post or put on a slide, or an SVG for print. */
export function DownloadTree({ getSvg, title, size = "sm" }: { getSvg: () => SVGSVGElement | null; title: string; size?: "sm" | "default" }) {
  const [busy, setBusy] = useState(false);
  async function save(kind: "png" | "svg") {
    const svg = getSvg();
    if (!svg) return;
    setBusy(true);
    try {
      if (kind === "png") saveFile(await treePng(svg, { title, scale: 3 }), fileName(title, "png"));
      else saveFile(new Blob([(await treeSvg(svg, { title })).text], { type: "image/svg+xml" }), fileName(title, "svg"));
    } catch (e) {
      toast.error(`The tree could not be saved: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size={size} disabled={busy}>{busy ? "Saving…" : "Download"}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => void save("png")}>Image (PNG)</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void save("svg")}>Vector, for print (SVG)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
