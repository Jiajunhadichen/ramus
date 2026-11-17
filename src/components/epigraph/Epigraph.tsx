import { pair, runs, type Quote } from "@/lib/epigraphs";

/** Mixed text with Chinese runs kept upright (never fake-italic). */
export function Upright({ children }: { children: string }) {
  return <>{runs(children).map((r, i) => (r.cjk ? <span key={i} className="cjk">{r.t}</span> : r.t))}</>;
}

function Line({ q }: { q: Quote }) {
  return (
    <p className="grid gap-0.5">
      <span className="hand text-[18px] leading-normal"><Upright>{q.text}</Upright> <span className="whitespace-nowrap text-[15px]"><Upright>{q.cite}</Upright></span></span>
      {q.gloss && <span className="text-[13px] italic text-muted-foreground">{q.gloss}</span>}
    </p>
  );
}

/** One epigraph pair, each quote in its original language with an English gloss when needed. */
export function Epigraph({ n, className = "" }: { n: number; className?: string }) {
  const p = pair(n);
  return (
    <blockquote className={"grid gap-3 border-l border-rule pl-4 " + className} aria-label={`Epigraph: ${p.theme}`}>
      <Line q={p.quotes[0]} />
      <Line q={p.quotes[1]} />
    </blockquote>
  );
}
