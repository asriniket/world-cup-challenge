export type GroupCode = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L";

export type BracketEntrantSpec =
  | { type: "group"; group: GroupCode; place: 1 | 2 }
  | { type: "third"; groups: GroupCode[] };

export type BracketMatchSpec = {
  matchNumber: number;
  entrants: [BracketEntrantSpec, BracketEntrantSpec];
};

export const groupCodes: GroupCode[] = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

export const roundOf32Specs: BracketMatchSpec[] = [
  { matchNumber: 73, entrants: [{ type: "group", group: "A", place: 2 }, { type: "group", group: "B", place: 2 }] },
  { matchNumber: 74, entrants: [{ type: "group", group: "E", place: 1 }, { type: "third", groups: ["A", "B", "C", "D", "F"] }] },
  { matchNumber: 75, entrants: [{ type: "group", group: "F", place: 1 }, { type: "group", group: "C", place: 2 }] },
  { matchNumber: 76, entrants: [{ type: "group", group: "C", place: 1 }, { type: "group", group: "F", place: 2 }] },
  { matchNumber: 77, entrants: [{ type: "group", group: "I", place: 1 }, { type: "third", groups: ["C", "D", "F", "G", "H"] }] },
  { matchNumber: 78, entrants: [{ type: "group", group: "E", place: 2 }, { type: "group", group: "I", place: 2 }] },
  { matchNumber: 79, entrants: [{ type: "group", group: "A", place: 1 }, { type: "third", groups: ["C", "E", "F", "H", "I"] }] },
  { matchNumber: 80, entrants: [{ type: "group", group: "L", place: 1 }, { type: "third", groups: ["E", "H", "I", "J", "K"] }] },
  { matchNumber: 81, entrants: [{ type: "group", group: "D", place: 1 }, { type: "third", groups: ["B", "E", "F", "I", "J"] }] },
  { matchNumber: 82, entrants: [{ type: "group", group: "G", place: 1 }, { type: "third", groups: ["A", "E", "H", "I", "J"] }] },
  { matchNumber: 83, entrants: [{ type: "group", group: "K", place: 2 }, { type: "group", group: "L", place: 2 }] },
  { matchNumber: 84, entrants: [{ type: "group", group: "H", place: 1 }, { type: "group", group: "J", place: 2 }] },
  { matchNumber: 85, entrants: [{ type: "group", group: "B", place: 1 }, { type: "third", groups: ["E", "F", "G", "I", "J"] }] },
  { matchNumber: 86, entrants: [{ type: "group", group: "J", place: 1 }, { type: "group", group: "H", place: 2 }] },
  { matchNumber: 87, entrants: [{ type: "group", group: "K", place: 1 }, { type: "third", groups: ["D", "E", "I", "J", "L"] }] },
  { matchNumber: 88, entrants: [{ type: "group", group: "D", place: 2 }, { type: "group", group: "G", place: 2 }] },
];
