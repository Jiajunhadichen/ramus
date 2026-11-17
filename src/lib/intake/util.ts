/** Small deterministic helpers shared by every parser. No network, no clock, no randomness. */
export type Line = { text: string; start: number; end: number };

/** Split keeping exact offsets into the original. `text` drops a trailing \r. */
export function toLines(raw: string): Line[] {
  const out: Line[] = [];
  let start = 0;
  for (;;) {
    const nl = raw.indexOf("\n", start);
    const end = nl === -1 ? raw.length : nl;
    const t = raw.slice(start, end);
    out.push({ text: t.endsWith("\r") ? t.slice(0, -1) : t, start, end: t.endsWith("\r") ? end - 1 : end });
    if (nl === -1) break;
    start = nl + 1;
  }
  return out;
}

/** Same length as input: invisible marks and odd spaces become plain spaces, so offsets hold. */
export const plain = (s: string) => s.replace(/[\u200e\u200f\u202f\u00a0\u2009\ufeff]/g, " ");
export const ws = (s: string) => plain(s).replace(/\s+/g, " ").trim();

/** FNV-1a, 52 bits, hex. Stable across browser and server. */
export function hash(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ c, 2246822519) >>> 0;
  }
  return (h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0")).slice(0, 13);
}

function tzOffsetMs(ts: number, tz: string): number {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  const p: Record<string, string> = {};
  for (const x of f.formatToParts(new Date(ts))) p[x.type] = x.value;
  return Date.UTC(+p["year"]!, +p["month"]! - 1, +p["day"]!, +p["hour"]! % 24, +p["minute"]!, +p["second"]!) - ts;
}

/** True when the browser and server both know this IANA timezone name. */
export function validTimeZone(tz: string | null | undefined): tz is string {
  if (!tz) return false;
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; } catch { return false; }
}

/** A wall-clock time read in a named timezone, as an ISO UTC instant. */
export function zonedToUtc(y: number, mo: number, d: number, h: number, mi: number, s: number, tz: string): string | null {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  if (!Number.isFinite(guess) || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  try {
    let t = guess - tzOffsetMs(guess, tz);
    t = guess - tzOffsetMs(t, tz);
    return new Date(t).toISOString();
  } catch {
    return new Date(guess).toISOString();
  }
}

/** "2026-11-17T14:00" (local, in tz) → ISO UTC. */
export function localStringToUtc(v: string | null | undefined, tz: string): string | null {
  const m = v?.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  return zonedToUtc(+m[1]!, +m[2]!, +m[3]!, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), tz);
}

// ---------- privacy ----------
const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?<![\w/:.@+-])\+?\d(?:[ .()-]{0,2}\d){8,13}(?![\w/:@]|\.\d)/g;
const DATEISH = /^\d{4}[-./]\d{1,2}[-./]\d{1,2}|^\d{1,2}[-./]\d{1,2}[-./]\d{2,4}/;

export type PrivacyMatch = { kind: "phone" | "email"; value: string };
export function findPrivate(text: string): PrivacyMatch[] {
  const seen = new Map<string, PrivacyMatch>();
  for (const m of text.matchAll(EMAIL)) seen.set(m[0], { kind: "email", value: m[0] });
  for (const m of text.matchAll(PHONE)) {
    const v = m[0].trim();
    if (DATEISH.test(v) || seen.has(v)) continue;
    seen.set(v, { kind: "phone", value: v });
  }
  return [...seen.values()];
}

/** Replace only the chosen matches (or all) with [phone] / [email]. Returns counts. */
export function maskText(text: string, which: "all" | string[]): { text: string; phone: number; email: number } {
  const want = which === "all" ? null : new Set(which);
  let phone = 0, email = 0;
  let out = text.replace(EMAIL, (v) => (want && !want.has(v) ? v : (email++, "[email]")));
  out = out.replace(PHONE, (v) => {
    const t = v.trim();
    if (DATEISH.test(t) || (want && !want.has(t))) return v;
    phone++;
    return v.replace(t, "[phone]");
  });
  return { text: out, phone, email };
}
