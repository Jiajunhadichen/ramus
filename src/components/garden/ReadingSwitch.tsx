import { Button } from "@/components/ui/button";
import type { ReadingLevel } from "@/lib/stam/reading";

export function ReadingSwitch({ value, onChange }: { value: ReadingLevel; onChange: (level: ReadingLevel) => void }) {
  return <div role="radiogroup" aria-label="Depth of thought" className="flex gap-1 text-ui">
    {(["form", "lineage", "record"] as const).map((level) => <Button key={level} variant="ghost" size="sm" role="radio" aria-checked={value === level} onClick={() => onChange(level)} className={value === level ? "text-foreground underline underline-offset-4" : "text-muted-foreground"}>{level[0]?.toUpperCase()}{level.slice(1)}</Button>)}
  </div>;
}