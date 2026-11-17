/**
 * Hand pasted text or dropped files to the Accession page, never through the URL.
 * Text goes through sessionStorage (it survives a reload); files stay in memory as they are,
 * because exports are often .zip or .docx files that must not be read as text.
 */
export type HandOver = { text?: string; files?: File[] };
const key = (gardenId: string) => `ramus-accession:${gardenId}`;
const pendingFiles = new Map<string, File[]>();

export function handOver(gardenId: string, h: HandOver) {
  if (h.files?.length) pendingFiles.set(gardenId, h.files);
  if (h.text) {
    try { sessionStorage.setItem(key(gardenId), JSON.stringify({ text: h.text })); } catch { /* too large for session storage: the page opens empty */ }
  }
}

export function takeHandOver(gardenId: string): HandOver | null {
  const files = pendingFiles.get(gardenId);
  pendingFiles.delete(gardenId);
  if (files?.length) return { files };
  try {
    const v = sessionStorage.getItem(key(gardenId));
    sessionStorage.removeItem(key(gardenId));
    return v ? (JSON.parse(v) as HandOver) : null;
  } catch { return null; }
}

/** Text worth opening the Accession page for: two or more non-empty lines. */
export const isDiscussionText = (t: string) => t.split(/\r?\n/).filter((l) => l.trim()).length >= 2;

/** True when nothing is being typed into, so a paste or drop on the page is meant for Ramus. */
export function pageIsFree(): boolean {
  const a = document.activeElement as HTMLElement | null;
  return !a || !(a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}
