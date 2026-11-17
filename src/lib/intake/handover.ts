/** Hand pasted text or dropped files to the Accession page through sessionStorage, never the URL. */
export type HandOver = { text?: string; files?: { name: string; text: string }[] };
const key = (gardenId: string) => `ramus-accession:${gardenId}`;
export function handOver(gardenId: string, h: HandOver) {
  try { sessionStorage.setItem(key(gardenId), JSON.stringify(h)); } catch { /* too large for session storage: the page opens empty */ }
}
export function takeHandOver(gardenId: string): HandOver | null {
  try {
    const v = sessionStorage.getItem(key(gardenId));
    sessionStorage.removeItem(key(gardenId));
    return v ? (JSON.parse(v) as HandOver) : null;
  } catch { return null; }
}
