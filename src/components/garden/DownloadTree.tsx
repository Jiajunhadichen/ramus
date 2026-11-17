import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { POSTER, StamTree, type MarginNote, type SpecimenInfo, type TreeNode } from "@/components/stam-tree/StamTree";
import { fileName, saveFile, treePng, treeSvg } from "@/lib/export/treeImage";

export type PosterInput = {
  nodes: TreeNode[]; title: string; line?: string | null; selected?: string | null;
  main?: Set<string>; specimen: SpecimenInfo; notes?: MarginNote[]; step?: number;
};

const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));

/** Draw the poster off screen with the page's own styles, hand its SVG over, then take it away. */
async function withPoster<T>(p: PosterInput, use: (svg: SVGSVGElement) => Promise<T>): Promise<T> {
  const holder = document.createElement("div");
  holder.setAttribute("aria-hidden", "true");
  holder.style.cssText = `position:fixed;left:-${POSTER.w * 2 + 2000}px;top:0;width:${POSTER.w}px;pointer-events:none;`;
  document.body.appendChild(holder);
  const root = createRoot(holder);
  try {
    flushSync(() => root.render(
      <StamTree nodes={p.nodes} step={p.step ?? Infinity} selected={p.selected ?? null} main={p.main} notes={p.notes ?? []} labels="zoom"
        specimen={p.specimen} poster={{ title: p.title, line: p.line ?? null }} ariaLabel={p.title} />,
    ));
    await document.fonts?.ready;
    // labels are measured after the fonts load, then laid out again
    for (let i = 0; i < 4; i++) await frame();
    const svg = holder.querySelector<SVGSVGElement>("svg.stam-tree");
    if (!svg) throw new Error("the tree could not be drawn");
    return await use(svg);
  } finally {
    root.unmount();
    holder.remove();
  }
}

/** Save the whole tree as a poster: a PNG to post or put on a slide, or an SVG for print. */
export function DownloadTree({ poster, size = "sm" }: { poster: () => PosterInput; size?: "sm" | "default" }) {
  const [busy, setBusy] = useState(false);
  async function save(kind: "png" | "svg") {
    const p = poster();
    setBusy(true);
    try {
      await withPoster(p, async (svg) => {
        // the longer side of the PNG is at least 3000px
        if (kind === "png") saveFile(await treePng(svg, { title: p.title, mark: "", scale: Math.ceil(3000 / Math.max(POSTER.w, POSTER.h)) }), fileName(p.title, "png"));
        else saveFile(new Blob([(await treeSvg(svg, { title: p.title, mark: "" })).text], { type: "image/svg+xml" }), fileName(p.title, "svg"));
      });
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
