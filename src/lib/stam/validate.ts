import type { ValidationError } from "./types";

export const MAX_LABEL = 24;

type Minimal = { id: string; label?: string; parents: string[] };

/** The one validation every write and import passes through. */
export function validateGarden(nodes: Minimal[]): ValidationError[] {
  const errors: ValidationError[] = [];
  if (!Array.isArray(nodes) || nodes.length === 0) {
    return [{ idea: null, problem: "The garden has no ideas.", fix: "Add at least one idea (the root)." }];
  }
  const ids = new Set<string>();
  for (const n of nodes) {
    if (!n || typeof n.id !== "string" || !n.id) {
      errors.push({ idea: null, problem: "An idea has no id.", fix: "Give every idea a text id." });
      continue;
    }
    if (ids.has(n.id)) errors.push({ idea: n.id, problem: `The id "${n.id}" is used twice.`, fix: "Give each idea its own id." });
    ids.add(n.id);
    if (typeof n.label !== "string" || !n.label.trim())
      errors.push({ idea: n.id, problem: "This idea has no label.", fix: "Add a short label." });
    else if ([...n.label].length > MAX_LABEL)
      errors.push({ idea: n.id, problem: `The label is ${[...n.label].length} characters long.`, fix: `Shorten it to ${MAX_LABEL} characters or fewer; put the rest in the note.` });
    if (!Array.isArray(n.parents))
      errors.push({ idea: n.id, problem: "parents is not a list.", fix: 'Use a list, e.g. ["root"], or [] for the root.' });
  }
  const valid = nodes.filter((n) => n && typeof n.id === "string" && Array.isArray(n.parents));
  for (const n of valid) {
    if (new Set(n.parents).size !== n.parents.length)
      errors.push({ idea: n.id, problem: "The same parent is listed twice.", fix: "List each parent once." });
    for (const p of n.parents) {
      if (p === n.id) errors.push({ idea: n.id, problem: "This idea lists itself as a parent.", fix: "Remove its own id from parents." });
      else if (!ids.has(p)) errors.push({ idea: n.id, problem: `Its parent "${p}" does not exist in this garden.`, fix: `Add an idea with id "${p}" or pick an existing parent.` });
    }
  }
  const roots = valid.filter((n) => n.parents.length === 0);
  if (roots.length !== 1) {
    errors.push({
      idea: roots.length > 1 ? roots.map((r) => r.id).join(", ") : null,
      problem: `Exactly one root is needed, found ${roots.length}`,
      fix: roots.length > 1 ? "Give all but one of these ideas a parent." : "Leave parents empty ([]) on exactly one idea.",
    });
  }
  const prim = new Map(valid.map((n) => [n.id, n.parents[0]]));
  const reported = new Set<string>();
  for (const n of valid) {
    const seen = new Set<string>();
    let cur: string | undefined = n.id;
    while (cur && prim.has(cur)) {
      if (seen.has(cur)) {
        if (!reported.has(cur)) {
          reported.add(cur);
          errors.push({ idea: n.id, problem: "The primary chain loops back on itself.", fix: `Change the first parent of "${n.id}" so it leads back to the root.` });
        }
        break;
      }
      seen.add(cur);
      cur = prim.get(cur);
    }
  }
  return errors;
}

export function formatError(e: ValidationError) {
  return (e.idea ? `Idea "${e.idea}": ` : "") + e.problem + (e.fix ? ` ${e.fix}` : "");
}
