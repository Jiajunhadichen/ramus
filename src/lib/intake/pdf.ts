/**
 * The text of a PDF, read in the browser with pdf.js (loaded only when a PDF arrives).
 * One line per line of text on the page; a paragraph gap on the page becomes a blank line, and pages are
 * separated by a blank line. Without the gaps, a whole page (a question and its answer) reads as one block.
 */
export async function pdfText(bytes: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: bytes.slice() }).promise;
  const pages: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const page = await doc.getPage(n);
    const content = await page.getTextContent();
    const items: PdfItem[] = [];
    for (const i of content.items) if ("str" in i) items.push({ str: i.str, hasEOL: i.hasEOL, transform: i.transform as number[], height: i.height });
    pages.push(pageText(items));
  }
  await doc.destroy();
  return pages.join("\n\n") + "\n";
}

export type PdfItem = { str: string; hasEOL?: boolean; transform?: number[]; height?: number };

/**
 * Lines from pdf.js text items, with a blank line wherever the vertical gap between two lines is clearly
 * larger than the usual line spacing on that page (a new paragraph, a new message). Pure, for tests.
 */
export function pageText(items: PdfItem[]): string {
  const lines: { text: string; y: number | null; h: number }[] = [];
  let line = "", y: number | null = null, h = 0;
  const end = () => { if (line.trim() || lines.length) lines.push({ text: line.replace(/\s+$/, ""), y, h }); line = ""; y = null; h = 0; };
  for (const item of items) {
    if (y === null && item.transform && item.str.trim()) y = item.transform[5] ?? null;
    if (item.height) h = Math.max(h, item.height);
    line += item.str;
    if (item.hasEOL) end();
  }
  if (line.trim()) end();
  const filled = lines.filter((l) => l.text.trim());
  const steps: number[] = [];
  for (let i = 1; i < filled.length; i++) {
    const a = filled[i - 1]!.y, b = filled[i]!.y;
    if (a !== null && b !== null && a > b) steps.push(a - b);
  }
  const usual = steps.length >= 3 ? [...steps].sort((p, q) => p - q)[Math.floor(steps.length / 2)]! : null;
  const out: string[] = [];
  let prev: (typeof lines)[number] | null = null;
  for (const l of lines) {
    if (!l.text.trim()) { if (out.length && out[out.length - 1] !== "") out.push(""); continue; }
    // a gap of more than about one and a half usual lines (or a jump back up the page) starts a new block
    if (prev && usual && prev.y !== null && l.y !== null && (prev.y - l.y > usual * 1.6 || l.y > prev.y) && out[out.length - 1] !== "") out.push("");
    out.push(l.text);
    prev = l;
  }
  return out.join("\n").replace(/\n+$/, "");
}
