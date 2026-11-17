import { FORMAT_LABEL, type Format } from "@/lib/intake/types";

const article = (s: string) => (/^[aeiou]/i.test(s) ? "an" : "a");
export function stampLine(f: { receivedAt: string; format: string; voices?: number | null; messages: number }) {
  const label = FORMAT_LABEL[f.format as Format] ?? f.format;
  const date = new Date(f.receivedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return [`received ${date}`, `from ${article(label)} ${label}`, f.voices != null ? `${f.voices} voice${f.voices === 1 ? "" : "s"}` : null, `${f.messages} message${f.messages === 1 ? "" : "s"}`].filter(Boolean).join(" · ");
}

/** The oval accession stamp, in the specimen-stamp manner. */
export function AccessionStamp({ no, line, small = false }: { no: number; line: string; small?: boolean }) {
  const w = small ? 300 : 460, h = small ? 74 : 120;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className={"accession-stamp max-w-full" + (small ? "" : " pressed")} role="img" aria-label={`Accession Nº ${String(no).padStart(3, "0")} · ${line}`}>
      <ellipse cx={w / 2} cy={h / 2} rx={w / 2 - 3} ry={h / 2 - 3} fill="none" stroke="currentColor" strokeWidth="1.4" />
      <ellipse cx={w / 2 + 1} cy={h / 2 - 1} rx={w / 2 - 9} ry={h / 2 - 9} fill="none" stroke="currentColor" strokeWidth=".7" />
      <text x={w / 2} y={h / 2 - (small ? 4 : 8)} textAnchor="middle" className="sp-stamp" style={{ fontSize: small ? 15 : 24 }} fill="currentColor">Nº {String(no).padStart(3, "0")}</text>
      <text x={w / 2} y={h / 2 + (small ? 14 : 20)} textAnchor="middle" className="sp-stamp" style={{ fontSize: small ? 9.5 : 13 }} fill="currentColor">{line}</text>
    </svg>
  );
}
