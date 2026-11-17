import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { Epigraph } from "@/components/epigraph/Epigraph";

export const Route = createFileRoute("/principles")({
  head: () => ({
    meta: [
      { title: "Principles — Ramus" },
      { name: "description", content: "The fourteen principles behind Ramus, from Dawkins, Simon, March, Argyris, Star & Griesemer, Stasser & Titus, Doshi & Hauser and Bohm." },
      { property: "og:title", content: "Principles — Ramus" },
      { property: "og:description", content: "The fourteen principles behind Ramus and the thinkers they come from." },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Principles,
});

const DAWKINS = "Richard Dawkins, The Blind Watchmaker (1986), ch. 3";
const SIMON = "Herbert A. Simon, “The Architecture of Complexity” (1962)";

export const PRINCIPLES: { title: string; text: string; source: string }[] = [
  { title: "Retention is the heart", source: DAWKINS,
    text: "Cumulative selection only works when each small gain is kept and built upon. So Ramus never throws an idea away. To remove an idea is to let it rest: it stays on the tree, hollow and quiet, ready to be revived, and every change is written down." },
  { title: "Make the click audible", source: SIMON,
    text: "Simon describes a safe whose dial clicks when a number is right, so the search no longer starts from nothing. A knot is that click: a group marks something it has settled. Knots are stable; untying one takes a deliberate act and a stated reason." },
  { title: "Build on stable subassemblies", source: SIMON,
    text: "Simon’s watchmaker, who builds from stable subassemblies, finishes the watch; the one who builds from loose parts is undone by every interruption. In Ramus new work grows from knots, and a settled branch can fold into a single node." },
  { title: "Near-decomposability", source: SIMON,
    text: "Complex systems hold together because their parts are mostly independent, with weaker ties between them. Branches are explored on their own; where one line of thought touches another, the tree draws only a light merge line." },
  { title: "Keep the recipe, not only the blueprint", source: SIMON,
    text: "A blueprint shows the finished state; a recipe shows how to get there. Ramus keeps the process itself, every event in order, so any past step of a garden can be replayed and understood." },
  { title: "Recognition over articulation", source: DAWKINS,
    text: "With his biomorphs, Dawkins chose between visible variants long before he could say why. People can recognise the better alternative before they can explain it, so Ramus shows sibling ideas side by side." },
  { title: "AI proposes, people decide", source: "Anil Doshi & Oliver Hauser (2024), on generative AI and the diversity of ideas",
    text: "Anything the gardener suggests, a link, a knot, a harvested idea, stays a dashed suggestion until a person accepts it. A link the gardener infers is a hypothesis, not a fact: two ideas sounding alike does not mean one shaped the other." },
  { title: "Don’t converge too fast", source: "James G. March, “Exploration and Exploitation in Organizational Learning” (1991)",
    text: "March shows how organisations drift toward exploiting what they already know and stop exploring. In Explore mode the gardener widens the space with questions; it helps narrow down only in Converge mode, which only people switch on." },
  { title: "Private before shared", source: "Chris Argyris, “Teaching Smart People How to Learn” (1991)",
    text: "Argyris found that capable people defend themselves when learning feels exposed. Private thoughts in Ramus stay private until their author chooses to graft them onto the shared tree, and the gardener never reveals them." },
  { title: "Cooperation without consensus", source: "Susan Leigh Star & James Griesemer, “Institutional Ecology, ‘Translations’ and Boundary Objects” (1989); David Bohm, On Dialogue (1996)",
    text: "A boundary object lets different groups work together without first agreeing on everything. The tree is one such object, read through different lenses. Following Bohm’s idea of dialogue, disagreement is held in view rather than forced away." },
  { title: "Ideas recombine", source: DAWKINS,
    text: "Lines of thought do not only split; they meet again. Each idea has one primary parent and may draw on others through merge lines. The primary chain never loops back on itself, and every garden grows from exactly one root." },
  { title: "Branches belong to people; the gardener only tends", source: "Anil Doshi & Oliver Hauser (2024), on generative AI and the diversity of ideas",
    text: "Doshi and Hauser found that ideas written with generative AI grow more alike across people. Human differences are what make thinking together worth it, so every idea on the tree has a human author. The gardener records, structures, reminds and asks, and has no branch color of its own." },
  { title: "Every voice counts", source: "Garold Stasser & William Titus (1985), on hidden profiles in group discussion",
    text: "Stasser and Titus showed that groups tend to discuss what everyone already knows, while the piece only one member holds goes unsaid. Ramus helps people think on their own first, then share, and it shows the ideas only one person raised." },
  { title: "Show what matters first", source: SIMON, text: "A complex system is understood through its levels. Ramus keeps every idea, but the tree is read from the outside in: first the question and where it has reached, then the main line of growth, then every branch and every word. Levels change what is emphasised, never what exists." },
];

const GROUPS: { name: string; pair?: number; titles: string[] }[] = [
  { name: "Lineage", pair: 6, titles: ["Retention is the heart", "Make the click audible", "Build on stable subassemblies", "Keep the recipe, not only the blueprint"] },
  { name: "Change", pair: 5, titles: ["Ideas recombine", "Don’t converge too fast"] },
  { name: "People", pair: 1, titles: ["Private before shared", "Cooperation without consensus", "Branches belong to people; the gardener only tends", "Every voice counts"] },
];
const grouped = [...GROUPS, { name: "Reading the tree", titles: PRINCIPLES.map((p) => p.title).filter((t) => !GROUPS.some((g) => g.titles.includes(t))) }];

function Principles() {
  return (
    <>
    <SiteHeader />
    <main className="page py-16"><div className="measure">
      <p className="eyebrow">Principles</p>
      <h1 className="mt-3 font-display text-[40px] leading-[1.1]">Why the garden grows this way</h1>
      <Epigraph n={3} className="mt-8" />
      <p className="essay mt-8 text-muted-foreground">Fourteen rules shape every part of Ramus. Each one comes from a thinker who studied how ideas, systems or groups grow. They are written here as plainly as we can.</p>
      {grouped.map((g) => (
        <section key={g.name} className="mt-14">
          <h2 className="smallcaps border-b border-rule pb-2 text-[18px]">{g.name}</h2>
          {g.pair && <Epigraph n={g.pair} className="mt-5" />}
          <ol className="mt-8 grid gap-10">
            {g.titles.map((t) => PRINCIPLES.find((p) => p.title === t)).filter((p): p is (typeof PRINCIPLES)[number] => !!p).map((p) => (
              <li key={p.title} className="essay">
                <h3 className="font-display text-[24px] leading-tight"><span className="smallcaps mr-3 text-[15px] text-muted-foreground">{String(PRINCIPLES.indexOf(p) + 1).padStart(2, "0")}</span>{p.title}</h3>
                <p className="mt-2">{p.text}</p>
                <p className="smallcaps mt-2 text-[13px] text-muted-foreground">{p.source}</p>
              </li>
            ))}
          </ol>
        </section>
      ))}
      <hr className="my-14 border-rule" />
      <Epigraph n={8} />
    </div></main>
    </>
  );
}
