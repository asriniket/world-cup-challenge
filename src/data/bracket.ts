export type BracketMatch = {
  round: "Round of 32" | "Round of 16" | "Quarterfinals" | "Semifinals" | "Final";
  slot: string;
  teamIds: [string | null, string | null];
};

export const bracketMatches: BracketMatch[] = [
  { round: "Round of 32", slot: "A1 vs best third", teamIds: ["mexico", null] },
  { round: "Round of 32", slot: "B1 vs A/C/D/E/F third", teamIds: ["switzerland", null] },
  { round: "Round of 32", slot: "C1 vs E/F/H/I/J third", teamIds: ["brazil", null] },
  { round: "Round of 32", slot: "D1 vs B/E/F/I/J third", teamIds: ["united-states", null] },
  { round: "Round of 32", slot: "E1 vs A/B/C/D third", teamIds: ["germany", null] },
  { round: "Round of 32", slot: "F1 vs H runner-up", teamIds: ["netherlands", "uruguay"] },
  { round: "Round of 32", slot: "G1 vs H/I/J/K third", teamIds: ["belgium", null] },
  { round: "Round of 32", slot: "H1 vs G runner-up", teamIds: ["spain", "egypt"] },
];
