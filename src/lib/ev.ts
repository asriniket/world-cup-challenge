import { CATEGORY_POTS } from "../data/config.js";
import type { Team } from "../data/teams.js";

export type TeamEv = {
  teamId: string;
  total: number;
  categoryEv: Record<keyof typeof CATEGORY_POTS, number>;
  probabilities: Record<keyof typeof CATEGORY_POTS, number>;
};

function normalize(items: Team[], score: (team: Team) => number) {
  const raw = items.map((team) => Math.max(0.001, score(team)));
  const total = raw.reduce((sum, value) => sum + value, 0);
  return new Map(items.map((team, index) => [team.id, raw[index] / total]));
}

export function computeTeamEvs(teams: Team[]): TeamEv[] {
  const champion = normalize(teams, (team) => Math.exp((team.power - 55) / 13));
  const runnerUp = normalize(teams, (team) => Math.exp((team.power - 52) / 15) * (1.08 - (champion.get(team.id) || 0)));
  const biggestUpset = normalize(
    teams,
    (team) => Math.exp(((team.fifaRank || 75) - 25) / 22) * Math.exp((team.power - 42) / 24),
  );
  const fewestTotalGoals = normalize(teams, (team) => Math.exp((58 - team.attack) / 12) * (1.12 - team.power / 120));
  const fastestRedCard = normalize(teams, (team) => Math.exp((team.disciplineRisk - 35) / 14));

  return teams.map((team) => {
    const probabilities = {
      champion: champion.get(team.id) || 0,
      runnerUp: runnerUp.get(team.id) || 0,
      biggestUpset: biggestUpset.get(team.id) || 0,
      fewestTotalGoals: fewestTotalGoals.get(team.id) || 0,
      fastestRedCard: fastestRedCard.get(team.id) || 0,
    };

    const categoryEv = Object.fromEntries(
      Object.entries(CATEGORY_POTS).map(([key, pot]) => [
        key,
        probabilities[key as keyof typeof CATEGORY_POTS] * pot,
      ]),
    ) as TeamEv["categoryEv"];

    return {
      teamId: team.id,
      categoryEv,
      probabilities,
      total: Object.values(categoryEv).reduce((sum, value) => sum + value, 0),
    };
  });
}
