/** Stam JSON — the contract format (docs/sample-garden.json). parents[0] is the primary parent. */
export type StamNode = {
  id: string;
  label: string;
  by: string;
  step: number;
  status: "growing" | "dormant";
  knot?: boolean;
  parents: string[];
  note?: string;
};
export type StamGarden = {
  title: string;
  collected?: string;
  focus?: string | null;
  steps?: Record<string, string>;
  nodes: StamNode[];
};
export type ValidationError = { idea: string | null; problem: string; fix: string };
