# Ramus v1.5.2 — the natural philosopher's book

A design pass only. It replaces the v1.5.1 type, label, color and epigraph rules.

## 1. Rules first
- Rewrite the type/label/color/epigraph sections of docs/design-principles.md and the matching AGENTS.md lines with the v1.5.2 rules (replacing, not appending).
- Save the eight epigraph pairs verbatim as docs/epigraphs.md, plus where each appears.
- Update project memory: new palette hexes, type scale, which pair goes where.

## 2. One printing house
- Fonts: load only IM Fell Double Pica (regular and italic), IM Fell English (regular and italic), IM Fell English SC and Noto Serif SC (regular). Drop IBM Plex Mono, EB Garamond and Noto Sans SC.
- Four type voices: display, text, small caps, hand (sepia italic). Every stack is Fell face first, then Noto Serif SC. `font-synthesis: none` everywhere, so Chinese never gets fake italics or bold.
- One scale: 13 / 15 / 18 / 24 / 40 / 64 px, line height 1.5 for text and 1.1 for display. Use tabular-nums where numbers must line up.
- Sweep every page and dialog (header, footer, gardens, garden, conversation, auth, principles, field notes, Day · Night toggle, specimen card). The old mono "eyebrow" and step counters become small caps, and "第 8 / 10 步" becomes "Step 8 of 10".

## 3. Tree labels without halos
- Remove the paint-order outline from labels.
- Add a mask over the branch and merge layers that cuts each label's measured box plus 3px, so lines stop just short of the lettering. Paper, grain and rules still show through.
- Labels are 15px ink. Knots are set in Fell SC, with Chinese at 16px. Resting ideas are set in Fell italic in muted ink, with Chinese still upright.
- Re-measure after fonts load and keep the collision tests passing.

## 4. Inks and drawing
- People palette, in order, day and night: verdigris, yellow ochre, ultramarine, madder crimson, viridian, using the exact hexes from the brief. Sepia stays for marginalia only.
- The pen wobble drops to scale 0.8. Hatching only on branches thicker than 8px, at about 25%.
- Whole tree always visible on load: check the fit against the top margin and specimen card, so nothing is clipped.

## 5. Landing page
- Side by side at desktop: the tree on the left (~60% width, up to 85vh), text on the right. On phones the text stacks under the tree.
- Right column: the 64px Double Pica headline with an italic "between", the 18px lede, Pair 2 (Shijing plus Montaigne, with glosses), and "Start a garden" in small caps.
- Under the tree, in small caps: "Step 10 of 10 · The origin of Ramus", then "Grow again" in italic.
- Keep the growth from a seed and the three sepia margin notes.

## 6. Linnaeus
- **Specimen card:** "Specimen Nº 004" in small caps, the title in Double Pica, "Collected — <date>", "Collectors — …", counts in small caps, and the existing stamp.
  - The brief's "Stockholm" isn't recorded anywhere, and no new data is allowed, so the place is left out and only the date is shown.
- **Field notes:** a lineage line in small caps: garden › … › parent › idea. Each part selects that idea.
- **Systema tab:** a "Tree | Systema" switch on the garden page.
  - Systema is a table with one column per first-level branch. Ideas are listed beneath and indented by depth, joined by fine rules.
  - Knots are in small caps, resting ideas in muted italic, and merges noted as "× other idea".
  - Pair 7 sits above the table. Clicking an entry selects it and opens it in Field notes; switching back shows it selected on the tree.

## 7. Epigraphs, in the original language
- One shared Epigraph component: the original line upright, then a small muted italic English gloss when the line is not in English.
- **Placements:**
  - Landing: Pair 2.
  - /principles: opens with Pair 3 and closes with Pair 8.
    - Group headings carry Pair 6 (lineage), Pair 5 (change) and Pair 1 (people).
    - The 13 principles are reordered into those groups, plus any remaining ones.
  - Systema: Pair 7.
  - Empty garden seed: Pair 4.
- Gardener modes (Explore/Converge/Knot) don't exist yet. Their Pair 4 tooltips are recorded in docs/epigraphs.md for when they're built.
- Modern thinkers stay cited by work only, never quoted.

## 8. Verification
- Vitest: the Systema grouping (columns, depth, merges), and a check that every epigraph string used in the app matches docs/epigraphs.md exactly.
- Playwright at 1440px and 390px:
  - Every computed font-family is Fell or Noto Serif SC.
  - No Chinese text node is italic.
  - Labels have no stroke.
  - Landing is side by side with the whole tree in view, and stacks on phones.
  - No label overlaps.
  - Systema lists all demo ideas, and clicking one selects it on the tree.

## Technical notes
- Font tokens: --font-display, --font-text, --font-sc and --font-hand in styles.css. Tailwind font-sans and font-mono are mapped onto the Fell text and SC stacks, so stray classes can't leak another family.
- Italic Chinese inside an italic run: wrap CJK in an upright span in the Epigraph and label code (by Unicode-range test), and use font-synthesis: none.
- Systema grouping is a pure function in src/lib/stam (systema.ts) with tests.
- The label mask is built from the same boxes computeLayout already returns.
