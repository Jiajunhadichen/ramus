import { Button } from "@/components/ui/button";
import type { ReadingLevel } from "@/lib/stam/reading";

export function ReadingSwitch({ value, onChange }: { value: ReadingLevel; onChange: (level: ReadingLevel) => void }) {
  return <div role="radiogroup" aria-label="Depth of thought" className="smallcaps flex gap-1">
    {(["form", "lineage", "record"] as const).map((level) => <Button key={level} variant="ghost" size="sm" role="radio" aria-checked={value === level} onClick={() => onChange(level)} className={value === level ? "underline underline-offset-4" : "text-muted-foreground"}>{level[0]?.toUpperCase()}{level.slice(1)}</Button>)}
  </div>;
}