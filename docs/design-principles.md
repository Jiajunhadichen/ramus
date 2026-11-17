Ramus v1.5: aesthetics and philosophy. No new data features. Beauty and meaning are the foundations of Ramus, so treat this as core work, not polish.

First add the rules below to AGENTS.md (so they are always read) and to docs/design-principles.md. Then apply them across the app.

## Back to the prototype's look (most important)
The first prototype, docs/tree-prototype.html, is the aesthetic reference. Match it closely.
A. Light herbarium paper is the default theme for everyone, whatever the system setting: --paper #E9EDE6 page, --sheet #F4F6F1 panels, --ink #1C2520 text. The dark palette becomes an optional "Night" toggle in the header, off by default and remembered per user.
B. Garden page layout as in the prototype: a header with the mono eyebrow, the large serif title and a muted one-line lede; below it the specimen sheet (controls bar on top, tree in the middle, legend at the bottom) with the Field notes panel on the right. Panels are --sheet with a 1px --rule border and 6px radius.
C. Controls as in the prototype: outlined ink buttons that invert on hover, a thin green range slider, the step label in mono ("第 8 / 10 步" followed by the step title).
D. Specimen label card back in the top-left corner of the tree, styled as in the prototype: --sheet fill, 1px ink border, a mono "标本 Nº 001" line, serif title, collected, collectors, mono counts. So that it never covers labels, treat its rectangle as an obstacle: fit the tree into the remaining area and include the card in the label collision pass.
E. Measure label widths from the rendered text (getBBox after fonts load), as the prototype does, instead of estimating them, and re-run placement when fonts finish loading.

## Aesthetic rules
1. The tree is the hero. Everything else recedes: neutral chrome, thin rules, generous space around the tree, no cards inside cards.
2. Color only means people. Branch colors are people; the interface stays in paper and ink tones. States are shown by form, never by new colors: hollow tip = resting, double ring = knot, dashed = merge or unconfirmed.
3. Three voices of type: serif (Noto Serif SC) for ideas and titles, sans (Noto Sans SC) for the interface, mono (IBM Plex Mono) for specimen metadata such as numbers, dates and step counters.
4. Motion is growth. Only growing things move: a new branch draws itself from parent to tip (700ms, ease-out), a new knot tightens (scale 1.3 to 1, 400ms). Nothing bounces; nothing loops except the soft pulse on growing tips. Respect prefers-reduced-motion everywhere.
5. Garden words, used consistently: grow, graft, rest, revive, knot, harvest, field notes, specimen. Never "AI magic", "generate", sparkles or robots. The gardener's voice is humble and asks questions.
6. Nothing is clipped and nothing collides: labels never overlap other labels, nodes or branch lines.
7. Every empty state is a seed: a single root dot and "Every garden starts with one question."

## Philosophy, made visible
8. Each concept carries its reason. Hovering (long-press on touch) shows one quiet line:
- Knot: "A click: something this group settled. (Herbert Simon)"
- Resting branch: "Resting, not deleted. Every idea is kept. (Richard Dawkins)"
- Merge line: "Two lines of thought recombined."
- Unconfirmed suggestion: "The gardener's guess. People decide."
9. A Principles page (/principles), linked quietly in the footer: one short paragraph per principle (the 13 in docs/project-knowledge.md), each naming its thinker and source. Write the paragraphs from the principle texts; do not invent quotes; cite only these sources:
- Richard Dawkins, The Blind Watchmaker (1986), ch. 3
- Herbert A. Simon, "The Architecture of Complexity" (1962)
- James G. March, "Exploration and Exploitation in Organizational Learning" (1991)
- Chris Argyris, "Teaching Smart People How to Learn" (1991)
- Susan Leigh Star & James Griesemer, "Institutional Ecology, 'Translations' and Boundary Objects" (1989)
- Garold Stasser & William Titus (1985), on hidden profiles in group discussion
- Anil Doshi & Oliver Hauser (2024), on generative AI and the diversity of ideas
- David Bohm, On Dialogue (1996)
End the page with the epigraph: 独学而无友，则孤陋而寡闻。（《礼记·学记》）"Learning alone, without friends, one stays narrow and hears little." Typeset it like a printed essay: serif, about 65 characters per line, generous leading.

## Tree improvements
10. Lineage focus: selecting an idea keeps its path to the root and all its descendants at full strength and fades everything else to 30%. Clicking empty paper clears it. This answers "where did this come from?" at a glance.
11. Label placement: extend the collision pass so labels also avoid branch paths and merge lines (sample points along the curves); flip a label to the other side of its node when that side is freer; draw a thin leader when a label moves. Fix the crowding near the root.
12. Merge lines sit behind branches at lower opacity and come forward when either end is hovered or selected.
13. Pan and zoom: scroll or pinch to zoom, drag to pan, a "Fit" button. On phones, Field notes becomes a bottom sheet.

## Landing page
14. The demo tree replays slowly as the hero. Next to or under it, in large serif: "Ideas grow between people." Then one sentence, the 学记 epigraph, and "Start a garden". Nothing else above the fold.

Acceptance criteria
- In light mode, the garden page looks like docs/tree-prototype.html side by side: same paper, panels, buttons, specimen card position and type.
- At 1280px and 390px wide, no label in the demo garden overlaps another label, a node, a branch or the specimen card.
- Selecting "想法进化树" shows its lineage back to the root and its descendants at full strength; everything else is faded.
- Hovering a knot shows the Simon line; hovering a resting branch shows the Dawkins line.
- /principles lists all 13 principles with their thinkers and reads like a printed essay.
- With reduced motion on, nothing animates.
# v1.5.1 — the naturalist's notebook (supersedes older type and color rules above)
A Western naturalist working on paper (Leonardo's notebooks, Darwin's 1837 "I think" sketch), always legible and in color. Nothing East Asian decorative (no seals, brush scripts, painting motifs); no fake parchment, stains or heavy texture.
1. Three hands. Printed: headings and body in EB Garamond, Chinese in Noto Serif SC; small caps for specimen/section labels. Naturalist's hand: margin notes, the gardener's questions and quotes in IM Fell English Italic, sepia #6B4A2E. Records: numbers, dates, step counters, counts in IBM Plex Mono. Tree labels: EB Garamond / Noto Serif SC at 14px, never handwriting fonts.
2. Inks for people, in order (day / night): Verdigris #3B7A57 / #7CC59C; Prussian blue #2F4F7F / #93AEDD; Burnt sienna #8F5A2A / #D9A06A; Madder rose #9A3A55 / #E28DA3; Viridian #2E6E73 / #7EC1C6. Paper #E9EDE6, sheet #F4F6F1, text ink #1C2520. Sepia is only for margin notes, never data.
3. Drawn, not rendered: pen-wobble displacement filter (scale ~1.2) on branches, fills at 90%; branches thicker than 6px get left-handed hatching (top-left to bottom-right, darker same ink, ~35%); merge lines are uneven pen dashes; knot rings are two offset circles; faint paper grain (~3%) on the page; dotted generation rules every 40px on the tree sheet only; the selected idea gets a faint dashed construction circle.
4. Margin notes: on the landing page the tree grows from a seed once (~0.6s per step), then three sepia notes appear with pen leaders (knot, resting branch, merge), then it rests; "Grow again" replays. Reduced motion shows everything at once. The tree is the largest element (~60% width, ~85vh).
5. Specimen card carries an oval accession stamp, "Ramus · herbarium of ideas" in small caps, rotated -4°, 70% opacity.
6. Theme toggle reads "Day · Night" in mono, the active word in ink.
