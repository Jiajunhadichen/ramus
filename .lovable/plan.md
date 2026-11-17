# Ramus v1.5 — aesthetics and philosophy

No new data features. Apply the brief in this order, rules first.

## 1. Write the rules down
- Save the brief verbatim to docs/design-principles.md.
- Add a condensed rule block to AGENTS.md (prototype is the aesthetic reference; light paper default; color only means people; three type voices; motion is growth; garden vocabulary; no collisions; seed empty states; concept tooltips).
- Update project memory with the user-chosen values (paper/sheet/ink hexes, tooltip lines, epigraph, motion timings).

## 2. Back to the prototype's look
- Light herbarium paper becomes the default for everyone: remove the system dark-mode media query; set --paper #E9EDE6, --sheet #F4F6F1, --ink #1C2520 exactly as the prototype.
- "Night" toggle in the header, off by default, remembered on this device (stored in the browser, applied before first paint to avoid a flash).
- Garden page rebuilt like the prototype: mono eyebrow, large serif title, muted one-line lede; specimen sheet (controls bar on top, tree in the middle, legend at bottom) with Field notes on the right. Panels: --sheet, 1px --rule, 6px radius. No cards inside cards.
- Controls: outlined ink buttons that invert on hover, thin green range slider, mono step label "第 8 / 10 步 · step title".
- Specimen label card back top-left of the tree in prototype style (mono "标本 Nº 001", serif title, collected, collectors, mono counts). Its rectangle is an obstacle: the tree is fitted to the remaining area and the card joins the label collision pass.

## 3. Tree improvements
- Labels measured from rendered text (getBBox) after fonts load; placement re-runs on font load and resize.
- Collision pass extended: labels avoid other labels, nodes, sampled points along branch curves and merge lines, and the specimen card; a label flips sides when the other side is freer; a thin leader line is drawn when a label moves; root crowding fixed.
- Lineage focus: selecting an idea keeps its path to the root and all descendants at full strength, everything else fades to 30%; clicking empty paper clears it.
- Merge lines drawn behind branches at lower opacity, brought forward when either end is hovered/selected.
- Pan and zoom: wheel/pinch zoom, drag to pan, a "Fit" button.
- States by form only: hollow tip = resting, double ring = knot, dashed = merge/unconfirmed.
- Motion: new branch draws parent to tip (700ms ease-out), new knot tightens (1.3 to 1, 400ms), soft pulse on growing tips only; everything off under prefers-reduced-motion.
- Concept tooltips (hover, long-press on touch), one quiet line each: knot (Simon), resting branch (Dawkins), merge line, unconfirmed suggestion — exact texts from the brief.

## 4. Pages
- Landing: demo tree replays slowly as the hero; large serif "Ideas grow between people.", one sentence, the 学记 epigraph, "Start a garden". Nothing else above the fold.
- New /principles page, linked quietly in a site footer: one paragraph per principle (all 13), each naming its thinker and one of the listed sources only, no invented quotes; ends with the 学记 epigraph. Typeset as a printed essay: serif, ~65ch measure, generous leading.
- Empty states everywhere become a seed: single root dot + "Every garden starts with one question."
- Phones: Field notes becomes a bottom sheet.
- Copy sweep for garden vocabulary (grow, graft, rest, revive, knot, harvest, field notes, specimen); no "generate"/magic wording.

## 5. Verification
- Vitest: pure tests for the lineage set (ancestors + descendants), label collision against segments/card rectangle, and side-flipping.
- Playwright at 1280px and 390px on the demo garden: automated overlap check of all label boxes vs labels, nodes, sampled branch points and the card; side-by-side screenshot against docs/tree-prototype.html; select "想法进化树" and check fade opacities; hover a knot and a resting tip for the Simon/Dawkins lines; /principles lists 13 principles; reduced-motion emulation shows no running animations.

## Technical notes
- Layout stays pure in src/lib/stam (new focus.ts, labels.ts); the component supplies measured boxes to the pure placer.
- Zoom/pan implemented with an SVG viewBox transform (no new library); bottom sheet uses the existing drawer/sheet UI component.
- Night preference: localStorage + inline head script setting the .dark class; no database change (the brief says no new data features).
