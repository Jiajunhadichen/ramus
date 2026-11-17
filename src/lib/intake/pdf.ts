/**
 * The text of a PDF, read in the browser with pdf.js (loaded only when a PDF arrives).
 * One line per line of text on the page; pages are separated by a blank line.
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
    let text = "", line = "";
    for (const item of content.items) {
      if (!("str" in item)) continue;
      line += item.str;
      if (item.hasEOL) { text += line.replace(/\s+$/, "") + "\n"; line = ""; }
    }
    if (line.trim()) text += line.replace(/\s+$/, "") + "\n";
    pages.push(text.replace(/\n+$/, ""));
  }
  await doc.destroy();
  return pages.join("\n\n") + "\n";
}
