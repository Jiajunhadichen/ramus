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
# v1.5.2 — the natural philosopher's book
This section replaces the type, label, color and epigraph rules above and from v1.5.1. Source brief, verbatim:

Ramus v1.5.2: the natural philosopher's book. A design pass that replaces the type, label, color and epigraph rules from v1.5.1 and from the epigraphs prompt. Beauty is a requirement, not a nice-to-have. Reference: a 17th- and 18th-century natural philosophy book and Linnaeus's Systema Naturae: letterpress type, generous margins, sepia marginalia, careful tables, printed on the pale green paper we already have. Not abstract, not decorative, no East Asian ornament, no fake parchment.

Update AGENTS.md and docs/design-principles.md: replace the older type, label, color and epigraph rules with the rules below, then apply them everywhere.

1. One family of type, as if from one printing house
- All Latin text uses the IM Fell types (Google Fonts), the 17th-century Fell types of Oxford:
  - Display (landing headline, garden titles): IM Fell Double Pica, regular and italic.
  - Text (lede, Field notes, Principles page, buttons): IM Fell English.
  - Small caps (section labels, specimen labels, step counters, counts, the lineage line): IM Fell English SC, letter-spacing 0.06em.
  - Margin notes, quotes and the gardener's questions: IM Fell English Italic, in sepia #6B4A2E.
- All Chinese text uses Noto Serif SC regular, always upright. Set font-synthesis: none so Chinese is never fake-italic or fake-bold. Font stacks put the Fell face first and Noto Serif SC second, e.g. "IM Fell English", "Noto Serif SC", serif.
- Remove IBM Plex Mono, EB Garamond and Noto Sans SC from the app entirely. Numbers are set in IM Fell; where numbers must align, use tabular-nums.
- One type scale: 13 / 15 / 18 / 24 / 40 / 64 px. Line height 1.5 for text, 1.1 for display.

2. Labels on the tree: no halos
- Superseded (Nov 2026): masking cut visible gaps in the trunk. Labels must never obscure the trunk; use only a faint low-opacity paper halo and placement beside branches.
- Remove every text halo, outline, paint-order stroke or white border around labels. Nothing may look like a sticker.
- Readability comes from space instead: mask the branch and merge layers under each label's box (plus 3px padding), so lines stop just before the text, the way engravers left white space around lettering. Paper, grain and rules stay visible behind labels.
- Labels: IM Fell English + Noto Serif SC at 15px in ink #1C2520. Knots in IM Fell English SC (Chinese at 16px). Resting ideas in IM Fell English Italic in muted ink (Chinese stays upright).
- Keep the collision pass (labels, nodes, branches, the specimen card) with measured widths, re-run after fonts load.

3. Inks for people. Keep the order people liked: first person green, second ochre, third blue.
- Verdigris: day #2F7651, night #6FC497
- Yellow ochre: day #A8701A, night #E2B25A
- Ultramarine: day #3D4FA0, night #9DA9F0
- Madder crimson: day #A3354B, night #E58FA2
- Viridian: day #2C7277, night #7EC5C9
- Cobalt violet: day #8B4C95, night #D9A0E1
- Vermilion: day #BB4D2A, night #FBA58A
- Sap green: day #53670E, night #98B056
Eight inks, so up to eight people never share a colour; the ninth starts again at verdigris. The last three were chosen to sit at least as far from every other ink (and from sepia and muted ink) as verdigris and viridian sit from each other, by day and by night, and with lightness apart where red-green colour blindness would merge hues (vermilion and sap green). Text ink #1C2520. Sepia #6B4A2E only for marginalia. No browns in the people palette, so notes never look like data.

4. Drawn, but calm
- Pen wobble very subtle (displacement scale about 0.8). Hatching, top-left to bottom-right like Leonardo's left hand, only on branches thicker than 8px, at about 25% opacity.
- Keep the pale green paper, the faint grain and the faint dotted rules on the tree sheet.
- The whole tree is always visible on load, fitted to its sheet with margins. Nothing is clipped at the top.

5. Landing page
- Restore the side-by-side layout: the tree on the left (about 60% of the width, 85% of the viewport height), the text on the right. On phones the text stacks under the tree.
- Right column, top to bottom: "Ideas grow between people." in IM Fell Double Pica 64px with "between" in italic; the lede in IM Fell English 18px; the landing epigraph (pair 2 below); "Start a garden" as an outlined ink button in IM Fell English SC.
- Under the tree, one line in IM Fell English SC: "Step 10 of 10 · The origin of Ramus", then "Grow again" in IM Fell English Italic.
- Keep the growth from a seed and the three sepia margin notes, in IM Fell English Italic with fine pen leaders.

6. Linnaeus: order and names
- Specimen card as a herbarium label: "Specimen Nº 004" in small caps; the title in Double Pica; "Collected — Stockholm, 17 Nov 2026"; "Collectors — 你, ChatGPT, Claude"; counts in small caps; keep the oval accession stamp.
- Field notes shows the idea's lineage as a classification line in small caps, like Regnum › Classis › Ordo: the garden › … › parent › the idea, each part a link.
- A second view of every garden, the Story (tab "Story"; the component is still Systema), beside the tree: the garden read step by step, like a naturalist's journal (v2.3; the earlier Linnaean column table was unreadable: it ordered ideas by ancestry, dropped time, notes and reasons, and put almost everything in one deep column). One chapter per step (Roman numeral and the step's title), each entry written as: who raised it (name in their color), the label, how it grew ("combines A, B and C", "refines A", "grew from A", "one answer to the question"), and the idea's note. The reading level decides which entries are written out (Form: the main line and knots; Lineage: what grew on; Record: everything); the rest of a step is named at its end, so nothing disappears. Selecting an entry selects it on the tree.

7. Epigraphs in the original language
Ramus speaks to people everywhere, so every quote appears in the language its author wrote it in. Under each quote that is not in English, a small English gloss in muted IM Fell English Italic. Quote only public-domain classics; modern thinkers are cited by work on /principles, never quoted. Save the list as docs/epigraphs.md and use these exact texts:

Pair 1 · difference
君子和而不同。——《论语·子路》 Gloss: The noble person seeks harmony, not sameness.
"He who knows only his own side of the case, knows little of that." — John Stuart Mill, On Liberty (1859)

Pair 2 · sharpening
如切如磋，如琢如磨。——《诗经·卫风·淇奥》 Gloss: Like bone cut and filed, like jade carved and polished.
« … frotter et limer notre cervelle contre celle d'autrui. » — Michel de Montaigne, Essais, I, 26 (1580). Gloss: to rub and file our minds against the minds of others.

Pair 3 · together
独学而无友，则孤陋而寡闻。——《礼记·学记》 Gloss: Learning alone, without friends, one stays narrow and hears little.
"No man is an island, entire of itself." — John Donne, Devotions upon Emergent Occasions (1624)

Pair 4 · method
博学之，审问之，慎思之，明辨之，笃行之。——《礼记·中庸》 Gloss: Study broadly, question closely, think it through, discern clearly, practise earnestly.
"Reading maketh a full man; conference a ready man; and writing an exact man." — Francis Bacon, "Of Studies", Essays (1625)

Pair 5 · change
穷则变，变则通，通则久。——《周易·系辞下》 Gloss: When a way is exhausted it changes; changing, it flows; flowing, it endures.
"…endless forms most beautiful and most wonderful have been, and are being, evolved." — Charles Darwin, On the Origin of Species (1859)

Pair 6 · lineage
他山之石，可以攻玉。——《诗经·小雅·鹤鸣》 Gloss: Stones from other hills can polish jade.
"If I have seen further it is by standing on the shoulders of Giants." — Isaac Newton, letter to Robert Hooke (1675/76)

Pair 7 · names
名不正，则言不顺。——《论语·子路》 Gloss: If names are not right, speech does not flow.
Nomina si nescis, perit et cognitio rerum. — Carl Linnaeus, Philosophia Botanica (1751). Gloss: If you do not know the names, the knowledge of things is lost too.

Pair 8 · experience
Sapienza è figliola della sperienza. — Leonardo da Vinci, notebooks. Gloss: Wisdom is the daughter of experience.
纸上得来终觉浅，绝知此事要躬行。——陆游《冬夜读书示子聿》 Gloss: What comes from paper stays shallow; to truly know a thing, do it yourself.

Where they appear (never more than one pair on a page or panel):
- Landing page: Pair 2.
- /principles: opens with Pair 3 and ends with Pair 8. Principle groups: lineage (retention, knots, stable subassemblies, keep the recipe) gets Pair 6; change (ideas recombine, don't converge too fast) gets Pair 5; people (private before shared, cooperation without consensus, branches belong to people, every voice counts) gets Pair 1.
- Systema view: Pair 7 above the table.
- Empty garden: Pair 4 under "Every garden starts with one question."
- Gardener modes (phase 3), as quiet tooltips from Pair 4: Explore = 博学之，审问之; Converge = 慎思之，明辨之; Knot = 笃行之.

Acceptance criteria
- Only IM Fell faces (Latin) and Noto Serif SC (Chinese) appear anywhere; no mono, no sans, no EB Garamond.
- No Chinese text is italic or fake-bold.
- No label has a halo or outline; branch lines stop just before labels.
- The landing page shows the tree on the left and the text on the right at 1440px, the whole tree visible, and stacks cleanly at 390px.
- Every quote matches docs/epigraphs.md exactly, in its original language, with its gloss where needed.
- The Systema view reads the demo garden step by step with every idea present, and selecting an entry selects it on the tree.

Still in force from v1.5.1: pen wobble, left-handed hatching, uneven merge dashes, offset knot rings, faint grain and dotted rules, construction circle, landing growth from a seed with three sepia margin notes, accession stamp, the Day · Night toggle.

## Usable at first sight (v2.3)
- A person with a university education uses Ramus without being taught: no tutorial, no jargon to learn first. Each panel has one obvious main action; the rest waits under "More".
- On an idea: its state is a two-way switch beside its author, "Growing | Set aside" (set aside = the group stopped here for now; it stays on the tree, drawn hollow, and a line in the naturalist's hand says so). Buttons: "Grow again from here" (main), Mark as outcome, Edit, More (Add a branch by hand, Graft a merge, Mark as knot / Reopen knot, Add evidence). The root is the question: no switch, no outcome. Buttons side by side are always the same size and style.
- Beauty stays the requirement: a tree someone would screenshot and ask "what made this?". New features express themselves in the existing forms (a margin note in the naturalist's hand, hollow resting branches), never in new UI colors or badges.

## Showing it (v2.4)
- Download: the tree as drawn now (same reading level and labels, fitted to the sheet, no hover rings or running animations) as a PNG at 3× for posts and slides, or an SVG for print. Fonts are embedded (only the slices of the families that draw its characters), colors are resolved to plain rgb, and a small "grown with Ramus" sits in the corner in the naturalist's hand. The fonts are served by Ramus itself so that the file uses exactly the faces on screen: a download in a substitute serif loses the whole look.
- Present: one button, full screen. The question first; then each step grows on the tree while the side tells who raised what, how it grew and its note (at most four entries, the rest counted), with "the group went back to …" where it did; it ends on where the discussion has reached. Arrow keys or space to move, Escape to leave. Not a separate mode with its own look: the same tree and the same Story, told one step at a time.

## House style (v2.6)

1. Real quotation marks and apostrophes in all copy: “ ” and ’, never straight quotes (code, attributes and JSON keys excepted).
2. One page grid: every page, header and footer sits in `page` (max 1400px, 20px side padding); reading columns use `measure` (66ch) and start at the page’s left edge. Dialogs keep their own widths.
3. One running head: SiteHeader on every page, `bare` on the home page (no background or rule, same positions). Day · Night lives only in the header.
4. One grammar for buttons: small caps mean “go somewhere” (tabs, header and footer links, Day · Night); roman sentence case means “do something”. Every button is 36px high, 15px text-face, no letter-spacing. At most one filled (ink) button per screen, for the main action; everything else is outline, inverting to ink on hover. Focus is a 1px ink outline offset 2px.
5. Square corners, no shadows: paper doesn’t float. Radius is 0 everywhere; rounded-full only for true circles (colour dots, swatches, knot rings, radio dots, switch thumbs, Present progress dots). Floating surfaces are sheet with a 1px ink border; inputs have a 1px rule border that turns ink on focus.

### House style, part 2 (v2.7)
- One type scale, six sizes only: note 13/1.4, ui 15/1.5, read 18/1.55, head 24/1.25, title 40/1.1, cover 64/1.0 (`text-note` … `text-cover`). Present uses note, head, title, cover; the Story at most note, ui, read, head. SVG tree sizes are separate.
- Small caps label things; they are never on things you click. Navigation (tabs, header links, Day · Night, footer links, language) is roman 15px: active = ink + underline, inactive = muted ink. Small caps remain for eyebrows, specimen label and stamps, metadata/stats lines, Story/Present step lines and speaker names.
- A dashed line means only “two lines recombined”, in the tree. The interface has no dashed borders: suggestions and drop zones use a 1px rule border (drop zone turns ink while dragging); status lines have no border; trash cards are ruled at opacity .7.
- Two weights of rule: every separator is 1px rule; a 1px ink rule only opens a Story chapter or a Present step. Control outlines and the specimen frame stay ink.
- Visible text says “Ramus file”, not “Stam JSON” (format unchanged). Sentence case everywhere. Stats lines wrap only at “ · ”; each number + word is nowrap.
- Delete forever is a destructive text button apart from Restore; its dialog defaults focus to Cancel and confirms with a filled destructive button.

## v2.7 part 4 — plates, calmer workspace, posters
- My gardens shows specimen plates: miniature tree, N°, title, one italic line (outcome, else the question), "ideas · people", updated date.
- People = distinct people or AIs who planted at least one idea in the tree.
- Field notes can be hidden; labels appear by zoom (all from 2.5×) and selection, staying 13–18px on screen; overlaps hide the lower priority (selected, root, outcome, knot, main lineage, more descendants, others).
- Downloads are posters: paper, 6% margin, title and one line top-left, whole tree, specimen label bottom-right, "grown with Ramus" bottom-left; PNG longer side ≥ 3000px.

## v2.8 part 4 — Present, English, seeds, sign-in, people
- A. Present never scrolls as a whole: rows auto/1fr/auto, the text column scrolls inside itself, ← → stay put; at most 3 entries per step.
- B. The interface is English everywhere; Chinese stays only in epigraphs. The historical demo is always read in English from docs/sample-garden.en.json at display time (“你” reads “Founder”); stored records and the Ramus file keep the original. No language toggles.
- C. A garden goes “Back to seed”; the section is “Seeds (n)”, “A seed since …”, “Plant again”; “Delete forever” stays plain and destructive.
- D. Sign in / Start a garden sit on the paper as a ledger entry beside a quiet tree: small-caps labels, one-rule inputs, one filled button, a quiet switch link, “Check your email” after sign-up; a new collector's first visit presses “Collector since …” once.
- E. People = distinct planters of ideas in the tree.
