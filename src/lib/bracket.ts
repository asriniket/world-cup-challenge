import { groupCodes, roundOf32Specs, type BracketEntrantSpec, type GroupCode } from "../data/bracket";
import type { LiveFixture } from "../data/live";
import type { Team } from "../data/teams";

const finishedStatuses = new Set(["FT", "AET", "PEN"]);
const activeStatuses = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);

export type GroupStandingRow = {
  teamId: Team["id"];
  group: GroupCode;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  fifaRank: number;
};

export type BracketEntrant = {
  teamId?: Team["id"];
  label: string;
  detail: string;
  standing?: GroupStandingRow;
  source: "api" | "projection" | "placeholder";
};

export type KnockoutMatch = {
  matchNumber: number;
  slot: string;
  round: string;
  entrants: [BracketEntrant, BracketEntrant];
  score?: string;
  status?: string;
  source: "api" | "projection";
};

export type RoundOf32Match = KnockoutMatch;

function emptyStanding(team: Team): GroupStandingRow {
  return {
    teamId: team.id,
    group: team.group as GroupCode,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    fifaRank: team.fifaRank,
  };
}

function isGroupStageFixture(fixture: LiveFixture, teamsById: Map<string, Team>) {
  if (!fixture.homeId || !fixture.awayId) return false;
  const home = teamsById.get(fixture.homeId);
  const away = teamsById.get(fixture.awayId);
  if (!home || !away || home.group !== away.group) return false;
  return !fixture.round || /group/i.test(fixture.round);
}

function isScoredFixture(fixture: LiveFixture) {
  return (
    (finishedStatuses.has(fixture.status) || activeStatuses.has(fixture.status)) &&
    typeof fixture.homeGoals === "number" &&
    typeof fixture.awayGoals === "number"
  );
}

function applyFixture(row: GroupStandingRow, goalsFor: number, goalsAgainst: number) {
  row.played += 1;
  row.goalsFor += goalsFor;
  row.goalsAgainst += goalsAgainst;
  row.goalDifference = row.goalsFor - row.goalsAgainst;

  if (goalsFor > goalsAgainst) {
    row.won += 1;
    row.points += 3;
  } else if (goalsFor < goalsAgainst) {
    row.lost += 1;
  } else {
    row.drawn += 1;
    row.points += 1;
  }
}

export function sortStandingRows(a: GroupStandingRow, b: GroupStandingRow) {
  return (
    b.points - a.points ||
    b.goalDifference - a.goalDifference ||
    b.goalsFor - a.goalsFor ||
    a.fifaRank - b.fifaRank ||
    a.teamId.localeCompare(b.teamId)
  );
}

export function buildGroupStandings(teams: Team[], fixtures: LiveFixture[]) {
  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const standings = new Map<string, GroupStandingRow>();
  teams.forEach((team) => standings.set(team.id, emptyStanding(team)));

  fixtures.filter(isScoredFixture).forEach((fixture) => {
    if (!isGroupStageFixture(fixture, teamsById) || !fixture.homeId || !fixture.awayId) return;
    const home = standings.get(fixture.homeId);
    const away = standings.get(fixture.awayId);
    if (!home || !away || typeof fixture.homeGoals !== "number" || typeof fixture.awayGoals !== "number") return;

    applyFixture(home, fixture.homeGoals, fixture.awayGoals);
    applyFixture(away, fixture.awayGoals, fixture.homeGoals);
  });

  return groupCodes.reduce<Record<GroupCode, GroupStandingRow[]>>((byGroup, group) => {
    byGroup[group] = Array.from(standings.values())
      .filter((row) => row.group === group)
      .sort(sortStandingRows);
    return byGroup;
  }, {} as Record<GroupCode, GroupStandingRow[]>);
}

function entrantLabel(spec: BracketEntrantSpec) {
  if (spec.type === "group") return `${spec.place === 1 ? "Winner" : "Runner-up"} Group ${spec.group}`;
  return `Best 3rd ${spec.groups.join("/")}`;
}

function standingDetail(row: GroupStandingRow, placeLabel: string) {
  return `${placeLabel} Group ${row.group} · ${row.points} pts, ${row.goalDifference >= 0 ? "+" : ""}${row.goalDifference} GD`;
}

function resolveGroupEntrant(spec: Extract<BracketEntrantSpec, { type: "group" }>, standings: Record<GroupCode, GroupStandingRow[]>): BracketEntrant {
  const standing = standings[spec.group]?.[spec.place - 1];
  if (!standing) {
    return { label: entrantLabel(spec), detail: "Awaiting table", source: "placeholder" };
  }

  return {
    teamId: standing.teamId,
    label: entrantLabel(spec),
    detail: standingDetail(standing, spec.place === 1 ? "1st" : "2nd"),
    standing,
    source: "projection",
  };
}

function resolveThirdEntrant(
  spec: Extract<BracketEntrantSpec, { type: "third" }>,
  bestThirds: GroupStandingRow[],
  usedThirdGroups: Set<GroupCode>,
): BracketEntrant {
  const standing = bestThirds.find((row) => spec.groups.includes(row.group) && !usedThirdGroups.has(row.group));
  if (!standing) {
    return { label: entrantLabel(spec), detail: "Awaiting third-place table", source: "placeholder" };
  }

  usedThirdGroups.add(standing.group);
  return {
    teamId: standing.teamId,
    label: entrantLabel(spec),
    detail: standingDetail(standing, "3rd"),
    standing,
    source: "projection",
  };
}

function resolveEntrant(
  spec: BracketEntrantSpec,
  standings: Record<GroupCode, GroupStandingRow[]>,
  bestThirds: GroupStandingRow[],
  usedThirdGroups: Set<GroupCode>,
): BracketEntrant {
  if (spec.type === "group") return resolveGroupEntrant(spec, standings);
  return resolveThirdEntrant(spec, bestThirds, usedThirdGroups);
}

function isRoundOf32Fixture(fixture: LiveFixture) {
  return /round of 32|1\/16|sixteenth/i.test(fixture.round || "");
}

function knockoutRound(fixture: LiveFixture) {
  const round = fixture.round || "";
  if (/round of 32|1\/16|sixteenth/i.test(round)) return "Round of 32";
  if (/round of 16|1\/8|eighth/i.test(round)) return "Round of 16";
  if (/quarter|1\/4/i.test(round)) return "Quarter-final";
  if (/semi|1\/2/i.test(round)) return "Semi-final";
  if (/third/i.test(round)) return "Third place";
  if (/\bfinal\b/i.test(round)) return "Final";
  return undefined;
}

function knockoutRoundOrder(round: string) {
  switch (round) {
    case "Round of 32":
      return 0;
    case "Round of 16":
      return 1;
    case "Quarter-final":
      return 2;
    case "Semi-final":
      return 3;
    case "Third place":
      return 4;
    case "Final":
      return 5;
    default:
      return 99;
  }
}

function fallbackMatchNumber(round: string, index: number) {
  switch (round) {
    case "Round of 32":
      return roundOf32Specs[index]?.matchNumber || 73 + index;
    case "Round of 16":
      return 89 + index;
    case "Quarter-final":
      return 97 + index;
    case "Semi-final":
      return 101 + index;
    case "Third place":
      return 103;
    case "Final":
      return 104;
    default:
      return 73 + index;
  }
}

function fixtureStatus(fixture: LiveFixture) {
  if (finishedStatuses.has(fixture.status)) return "Final";
  if (activeStatuses.has(fixture.status)) return fixture.elapsed ? `Live ${fixture.elapsed}'` : "Live";
  return fixture.status || undefined;
}

function fixtureScore(fixture: LiveFixture) {
  if (typeof fixture.homeGoals !== "number" || typeof fixture.awayGoals !== "number") return undefined;
  if (!finishedStatuses.has(fixture.status) && !activeStatuses.has(fixture.status)) return undefined;
  return `${fixture.homeGoals}-${fixture.awayGoals}`;
}

function buildApiKnockout(fixtures: LiveFixture[]): KnockoutMatch[] {
  return fixtures
    .map((fixture) => ({ fixture, round: knockoutRound(fixture) }))
    .filter((entry): entry is { fixture: LiveFixture; round: string } => Boolean(entry.round) && Boolean(entry.fixture.homeId || entry.fixture.awayId))
    .sort((a, b) => {
      return (
        knockoutRoundOrder(a.round) - knockoutRoundOrder(b.round) ||
        (a.fixture.date || "").localeCompare(b.fixture.date || "") ||
        (a.fixture.id || 0) - (b.fixture.id || 0)
      );
    })
    .map((fixture, index) => {
      const roundIndex = fixtures
        .filter((candidate) => knockoutRound(candidate) === fixture.round)
        .sort((a, b) => (a.date || "").localeCompare(b.date || "") || (a.id || 0) - (b.id || 0))
        .findIndex((candidate) => candidate === fixture.fixture);
      const spec = fixture.round === "Round of 32" ? roundOf32Specs[roundIndex] : undefined;
      const matchNumber = fixture.fixture.id || fallbackMatchNumber(fixture.round, Math.max(0, roundIndex));
      const entrants: [BracketEntrant, BracketEntrant] = [
        {
          teamId: fixture.fixture.homeId,
          label: fixture.fixture.homeId ? "Home" : spec ? entrantLabel(spec.entrants[0]) : "TBD",
          detail: fixture.fixture.homeId ? "API fixture" : "Awaiting team",
          source: fixture.fixture.homeId ? "api" : "placeholder",
        },
        {
          teamId: fixture.fixture.awayId,
          label: fixture.fixture.awayId ? "Away" : spec ? entrantLabel(spec.entrants[1]) : "TBD",
          detail: fixture.fixture.awayId ? "API fixture" : "Awaiting team",
          source: fixture.fixture.awayId ? "api" : "placeholder",
        },
      ];

      return {
        matchNumber,
        slot: `Match ${matchNumber}`,
        round: fixture.round,
        entrants,
        score: fixtureScore(fixture.fixture),
        status: fixtureStatus(fixture.fixture),
        source: "api",
      };
    });
}

function buildApiRoundOf32(fixtures: LiveFixture[]): RoundOf32Match[] {
  return buildApiKnockout(fixtures).filter((match) => match.round === "Round of 32");
}

export function buildRoundOf32Board(teams: Team[], fixtures: LiveFixture[]): RoundOf32Match[] {
  const apiMatches = buildApiRoundOf32(fixtures);
  if (apiMatches.length > 0) return apiMatches;

  const standings = buildGroupStandings(teams, fixtures);
  const bestThirds = groupCodes
    .map((group) => standings[group]?.[2])
    .filter((row): row is GroupStandingRow => Boolean(row))
    .sort(sortStandingRows)
    .slice(0, 8);
  const usedThirdGroups = new Set<GroupCode>();

  return roundOf32Specs.map((match) => {
    const entrants = match.entrants.map((entrant) => resolveEntrant(entrant, standings, bestThirds, usedThirdGroups)) as [
      BracketEntrant,
      BracketEntrant,
    ];

    return {
      matchNumber: match.matchNumber,
      slot: `Match ${match.matchNumber}`,
      round: "Round of 32",
      entrants,
      source: "projection",
    };
  });
}

export function buildKnockoutBoard(teams: Team[], fixtures: LiveFixture[]): KnockoutMatch[] {
  const apiMatches = buildApiKnockout(fixtures);
  if (apiMatches.length > 0) return apiMatches;
  return buildRoundOf32Board(teams, fixtures);
}
