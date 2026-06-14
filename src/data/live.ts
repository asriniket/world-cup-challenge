import type { Team } from "./teams";

export type TeamLiveStat = {
  teamId: Team["id"];
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  cleanSheets: number;
  form: string;
};

export type CompletedResult = {
  winnerId: Team["id"];
  loserId: Team["id"];
  score: string;
  round?: string;
};

export type LiveFixture = {
  id?: number;
  date?: string;
  round?: string;
  status: string;
  elapsed?: number | null;
  homeId?: Team["id"];
  awayId?: Team["id"];
  homeGoals: number | null;
  awayGoals: number | null;
};

export const liveStats: TeamLiveStat[] = [
  { teamId: "mexico", played: 1, goalsFor: 2, goalsAgainst: 0, cleanSheets: 1, form: "W" },
  { teamId: "south-africa", played: 1, goalsFor: 0, goalsAgainst: 2, cleanSheets: 0, form: "L" },
  { teamId: "korea-republic", played: 1, goalsFor: 2, goalsAgainst: 1, cleanSheets: 0, form: "W" },
  { teamId: "czechia", played: 1, goalsFor: 1, goalsAgainst: 2, cleanSheets: 0, form: "L" },
  { teamId: "canada", played: 1, goalsFor: 1, goalsAgainst: 1, cleanSheets: 0, form: "D" },
  { teamId: "bosnia", played: 1, goalsFor: 1, goalsAgainst: 1, cleanSheets: 0, form: "D" },
  { teamId: "qatar", played: 1, goalsFor: 1, goalsAgainst: 1, cleanSheets: 0, form: "D" },
  { teamId: "switzerland", played: 1, goalsFor: 1, goalsAgainst: 1, cleanSheets: 0, form: "D" },
  { teamId: "brazil", played: 1, goalsFor: 1, goalsAgainst: 1, cleanSheets: 0, form: "D" },
  { teamId: "morocco", played: 1, goalsFor: 1, goalsAgainst: 1, cleanSheets: 0, form: "D" },
  { teamId: "united-states", played: 1, goalsFor: 4, goalsAgainst: 1, cleanSheets: 0, form: "W" },
  { teamId: "paraguay", played: 1, goalsFor: 1, goalsAgainst: 4, cleanSheets: 0, form: "L" },
  { teamId: "france", played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, form: "-" },
  { teamId: "argentina", played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, form: "-" },
  { teamId: "england", played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, form: "-" },
  { teamId: "spain", played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, form: "-" },
  { teamId: "portugal", played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, form: "-" },
  { teamId: "germany", played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, form: "-" },
  { teamId: "netherlands", played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0, form: "-" },
];

export const completedResults: CompletedResult[] = [
  { winnerId: "mexico", loserId: "south-africa", score: "2-0" },
  { winnerId: "korea-republic", loserId: "czechia", score: "2-1" },
  { winnerId: "united-states", loserId: "paraguay", score: "4-1" },
];

export const liveFixtures: LiveFixture[] = [
  { status: "FT", homeId: "mexico", awayId: "south-africa", homeGoals: 2, awayGoals: 0, round: "Group Stage" },
  { status: "FT", homeId: "korea-republic", awayId: "czechia", homeGoals: 2, awayGoals: 1, round: "Group Stage" },
  { status: "FT", homeId: "canada", awayId: "bosnia", homeGoals: 1, awayGoals: 1, round: "Group Stage" },
  { status: "FT", homeId: "qatar", awayId: "switzerland", homeGoals: 1, awayGoals: 1, round: "Group Stage" },
  { status: "FT", homeId: "brazil", awayId: "morocco", homeGoals: 1, awayGoals: 1, round: "Group Stage" },
  { status: "FT", homeId: "united-states", awayId: "paraguay", homeGoals: 4, awayGoals: 1, round: "Group Stage" },
];
