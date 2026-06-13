import type { Team } from "../data/teams";
import type { TeamEv } from "./ev";

export type Assignment = {
  participant: string;
  team: Team;
  ev: TeamEv;
  pickNumber: number;
};

export type StoredAssignment = {
  participant: string;
  teamId: string;
  pickNumber: number;
};

function hashSeed(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number) {
  return function random() {
    let value = (seed += 0x6d2b79f5);
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], seed: string) {
  const copy = [...items];
  const random = mulberry32(hashSeed(seed));
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

export function buildAssignments(teams: Team[], participants: string[], evs: TeamEv[], seed: string): Assignment[] {
  if (teams.length !== 48 || participants.length !== 10) {
    throw new Error("This sweepstakes is configured for exactly 48 teams and 10 participants.");
  }

  const evByTeam = new Map(evs.map((ev) => [ev.teamId, ev]));
  const totals = new Map(participants.map((participant) => [participant, 0]));
  const assigned = new Map<string, Team[]>();
  participants.forEach((participant) => assigned.set(participant, []));

  const tierOne = shuffle(
    teams.filter((team) => team.tier === 1),
    `${seed}:tier-one`,
  );

  const tierOneRecipients = shuffle(participants, `${seed}:tier-one-recipients`);

  tierOneRecipients.forEach((participant, index) => {
    const team = tierOne[index];
    if (!team) return;
    assigned.get(participant)!.push(team);
    totals.set(participant, (totals.get(participant) || 0) + (evByTeam.get(team.id)?.total || 0));
  });

  const alreadyAssigned = new Set(tierOne.slice(0, participants.length).map((team) => team.id));
  const remaining = shuffle(
    teams.filter((team) => !alreadyAssigned.has(team.id)),
    `${seed}:remaining`,
  ).sort((a, b) => (evByTeam.get(b.id)?.total || 0) - (evByTeam.get(a.id)?.total || 0));

  const fiveTeamSlots = teams.length - participants.length * 4;
  const targetCounts = new Map<string, number>();
  [...participants]
    .sort((a, b) => (totals.get(b) || 0) - (totals.get(a) || 0))
    .forEach((participant, index) => targetCounts.set(participant, index < participants.length - fiveTeamSlots ? 4 : 5));

  remaining.forEach((team) => {
    const pool = participants.filter((participant) => (assigned.get(participant)?.length || 0) < (targetCounts.get(participant) || 5));
    if (!pool.length) throw new Error("No eligible participant remained while assigning teams.");
    const owner = pool.reduce((best, participant) => {
      const participantTotal = totals.get(participant) || 0;
      const bestTotal = totals.get(best) || 0;
      if (participantTotal !== bestTotal) return participantTotal < bestTotal ? participant : best;
      return (assigned.get(participant)?.length || 0) < (assigned.get(best)?.length || 0) ? participant : best;
    }, pool[0]);
    assigned.get(owner)!.push(team);
    totals.set(owner, (totals.get(owner) || 0) + (evByTeam.get(team.id)?.total || 0));
  });

  const ordered: Omit<Assignment, "pickNumber">[] = [];
  for (let round = 0; round < 5; round += 1) {
    participants.forEach((participant) => {
      const team = assigned.get(participant)?.[round];
      if (!team) return;
      ordered.push({ participant, team, ev: evByTeam.get(team.id)! });
    });
  }

  return ordered.map((assignment, index) => ({ ...assignment, pickNumber: index + 1 }));
}

export function assignmentsByParticipant(assignments: Assignment[]) {
  return assignments.reduce<Record<string, Assignment[]>>((grouped, assignment) => {
    grouped[assignment.participant] ||= [];
    grouped[assignment.participant].push(assignment);
    return grouped;
  }, {});
}

export function serializeAssignments(assignments: Assignment[]): StoredAssignment[] {
  return assignments.map(({ participant, team, pickNumber }) => ({ participant, teamId: team.id, pickNumber }));
}

export function hydrateAssignments(stored: StoredAssignment[], teams: Team[], evs: TeamEv[]): Assignment[] {
  const teamById = new Map(teams.map((team) => [team.id, team]));
  const evByTeam = new Map(evs.map((ev) => [ev.teamId, ev]));

  return stored
    .map((assignment) => {
      const team = teamById.get(assignment.teamId);
      const ev = evByTeam.get(assignment.teamId);
      if (!team || !ev) return undefined;
      return {
        participant: assignment.participant,
        pickNumber: assignment.pickNumber,
        team,
        ev,
      };
    })
    .filter((assignment): assignment is Assignment => Boolean(assignment))
    .sort((a, b) => a.pickNumber - b.pickNumber);
}
