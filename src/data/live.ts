import type { Team } from "./teams";

export type TeamLiveStat = {
  teamId: Team["id"];
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  redCardMinute?: number;
  yellowCards: number;
  redCards: number;
  cleanSheets: number;
  form: string;
};

export type CompletedResult = {
  winnerId: Team["id"];
  loserId: Team["id"];
  score: string;
};

export const liveStats: TeamLiveStat[] = [
  { teamId: "mexico", played: 1, goalsFor: 2, goalsAgainst: 1, yellowCards: 2, redCards: 0, cleanSheets: 0, form: "W" },
  { teamId: "south-africa", played: 1, goalsFor: 1, goalsAgainst: 2, yellowCards: 3, redCards: 0, cleanSheets: 0, form: "L" },
  { teamId: "korea-republic", played: 1, goalsFor: 2, goalsAgainst: 0, yellowCards: 1, redCards: 0, cleanSheets: 1, form: "W" },
  { teamId: "czechia", played: 1, goalsFor: 0, goalsAgainst: 2, yellowCards: 2, redCards: 0, cleanSheets: 0, form: "L" },
  { teamId: "canada", played: 1, goalsFor: 1, goalsAgainst: 1, yellowCards: 1, redCards: 0, cleanSheets: 0, form: "D" },
  { teamId: "bosnia", played: 1, goalsFor: 1, goalsAgainst: 1, yellowCards: 4, redCards: 0, cleanSheets: 0, form: "D" },
  { teamId: "united-states", played: 1, goalsFor: 4, goalsAgainst: 1, yellowCards: 1, redCards: 0, cleanSheets: 0, form: "W" },
  { teamId: "paraguay", played: 1, goalsFor: 1, goalsAgainst: 4, redCardMinute: 68, yellowCards: 4, redCards: 1, cleanSheets: 0, form: "L" },
  { teamId: "qatar", played: 1, goalsFor: 0, goalsAgainst: 1, yellowCards: 2, redCards: 0, cleanSheets: 0, form: "L" },
  { teamId: "switzerland", played: 1, goalsFor: 1, goalsAgainst: 0, yellowCards: 1, redCards: 0, cleanSheets: 1, form: "W" },
  { teamId: "brazil", played: 0, goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, form: "-" },
  { teamId: "france", played: 0, goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, form: "-" },
  { teamId: "argentina", played: 0, goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, form: "-" },
  { teamId: "england", played: 0, goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, form: "-" },
  { teamId: "spain", played: 0, goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, form: "-" },
  { teamId: "portugal", played: 0, goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, form: "-" },
  { teamId: "germany", played: 0, goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, form: "-" },
  { teamId: "netherlands", played: 0, goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, form: "-" },
];

export const completedResults: CompletedResult[] = [
  { winnerId: "mexico", loserId: "south-africa", score: "2-1" },
  { winnerId: "korea-republic", loserId: "czechia", score: "2-0" },
  { winnerId: "united-states", loserId: "paraguay", score: "4-1" },
  { winnerId: "switzerland", loserId: "qatar", score: "1-0" },
];
