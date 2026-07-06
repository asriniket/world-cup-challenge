import { CATEGORY_POTS, POT_TOTAL_DOLLARS } from "../data/config";
import type { MarketOdd } from "../services/marketOdds";
import type { Assignment } from "./draw";

export type CurrentAssignmentValue = {
  assignment: Assignment;
  championEv: number;
  nonWinnerEv: number;
  total: number;
};

export type CurrentOwnerValue = {
  participant: string;
  assignments: Assignment[];
  teams: number;
  tierOne: number;
  championEv: number;
  nonWinnerEv: number;
  total: number;
};

export function buildMarketChampionEvByTeam(marketOdds: MarketOdd[]) {
  return new Map(marketOdds.map((odd) => [odd.teamId, odd.probability * CATEGORY_POTS.champion]));
}

export function currentPrizePoolTotal(marketOdds: MarketOdd[]) {
  const championTotal = marketOdds.length
    ? marketOdds.reduce((sum, odd) => sum + odd.probability * CATEGORY_POTS.champion, 0)
    : CATEGORY_POTS.champion;

  return POT_TOTAL_DOLLARS - CATEGORY_POTS.champion + championTotal;
}

export function currentAssignmentValue(
  assignment: Assignment,
  championEvByTeam: Map<string, number>,
  useMarketChampionEv: boolean,
): CurrentAssignmentValue {
  const championEv = useMarketChampionEv
    ? championEvByTeam.get(assignment.team.id) || 0
    : assignment.ev.categoryEv.champion;
  const nonWinnerEv = assignment.ev.total - assignment.ev.categoryEv.champion;

  return {
    assignment,
    championEv,
    nonWinnerEv,
    total: nonWinnerEv + championEv,
  };
}

export function currentOwnerValues(assignments: Assignment[], participants: string[], marketOdds: MarketOdd[]) {
  const grouped = assignments.reduce<Record<string, Assignment[]>>((byParticipant, assignment) => {
    byParticipant[assignment.participant] ||= [];
    byParticipant[assignment.participant].push(assignment);
    return byParticipant;
  }, {});
  const championEvByTeam = buildMarketChampionEvByTeam(marketOdds);
  const useMarketChampionEv = marketOdds.length > 0;

  return participants.map<CurrentOwnerValue>((participant) => {
    const ownerAssignments = grouped[participant] || [];
    const values = ownerAssignments.map((assignment) =>
      currentAssignmentValue(assignment, championEvByTeam, useMarketChampionEv),
    );

    return {
      participant,
      assignments: ownerAssignments,
      teams: ownerAssignments.length,
      tierOne: ownerAssignments.filter((assignment) => assignment.team.tier === 1).length,
      championEv: values.reduce((sum, value) => sum + value.championEv, 0),
      nonWinnerEv: values.reduce((sum, value) => sum + value.nonWinnerEv, 0),
      total: values.reduce((sum, value) => sum + value.total, 0),
    };
  });
}
