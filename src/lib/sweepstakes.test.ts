import { describe, expect, it } from "vitest";
import { CATEGORY_POTS, DRAW_SEED, PARTICIPANTS, POT_TOTAL_DOLLARS } from "../data/config";
import type { TeamLiveStat } from "../data/live";
import { teams } from "../data/teams";
import { applyFixtureCardsToStats, parseApiFootballCardEvents } from "../../api/red-card-cache";
import { buildAssignments, assignmentsByParticipant, hydrateAssignments, serializeAssignments } from "./draw";
import { computeTeamEvs } from "./ev";
import { teamIdFromName } from "./teamAliases";

const evs = computeTeamEvs(teams);
const assignments = buildAssignments(teams, PARTICIPANTS, evs, DRAW_SEED);

describe("EV model", () => {
  it("prices only the configured $200 prize pool categories", () => {
    expect(Object.values(CATEGORY_POTS).reduce((sum, value) => sum + value, 0)).toBe(POT_TOTAL_DOLLARS);
    expect(evs).toHaveLength(48);

    for (const category of Object.keys(CATEGORY_POTS) as Array<keyof typeof CATEGORY_POTS>) {
      const probabilityTotal = evs.reduce((sum, ev) => sum + ev.probabilities[category], 0);
      const dollarTotal = evs.reduce((sum, ev) => sum + ev.categoryEv[category], 0);
      expect(probabilityTotal).toBeCloseTo(1, 8);
      expect(dollarTotal).toBeCloseTo(CATEGORY_POTS[category], 8);
    }

    const totalEv = evs.reduce((sum, ev) => sum + ev.total, 0);
    expect(totalEv).toBeCloseTo(POT_TOTAL_DOLLARS, 8);
    expect(evs.every((ev) => Number.isFinite(ev.total) && ev.total > 0)).toBe(true);
  });
});

describe("draw assignment", () => {
  it("assigns every team exactly once", () => {
    expect(assignments).toHaveLength(48);
    expect(new Set(assignments.map((assignment) => assignment.team.id)).size).toBe(48);
    expect(assignments.map((assignment) => assignment.pickNumber)).toEqual(Array.from({ length: 48 }, (_, index) => index + 1));
  });

  it("gives every participant exactly four or five teams", () => {
    const grouped = assignmentsByParticipant(assignments);
    const counts = PARTICIPANTS.map((participant) => grouped[participant]?.length || 0);

    expect(counts.every((count) => count === 4 || count === 5)).toBe(true);
    expect(counts.filter((count) => count === 5)).toHaveLength(8);
    expect(counts.filter((count) => count === 4)).toHaveLength(2);
  });

  it("keeps hidden EV totals close after enforcing four/five roster sizes", () => {
    const grouped = assignmentsByParticipant(assignments);
    const totals = PARTICIPANTS.map((participant) =>
      (grouped[participant] || []).reduce((sum, assignment) => sum + assignment.ev.total, 0),
    );
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThan(5);
  });

  it("is deterministic for the same seed and changes for a different seed", () => {
    const same = buildAssignments(teams, PARTICIPANTS, evs, DRAW_SEED);
    const different = buildAssignments(teams, PARTICIPANTS, evs, `${DRAW_SEED}:different`);

    expect(serializeAssignments(same)).toEqual(serializeAssignments(assignments));
    expect(serializeAssignments(different)).not.toEqual(serializeAssignments(assignments));
  });

  it("hydrates stored assignments without changing order or owners", () => {
    const stored = serializeAssignments(assignments);
    const hydrated = hydrateAssignments(stored, teams, evs);
    expect(serializeAssignments(hydrated)).toEqual(stored);
  });
});

describe("provider team aliases", () => {
  it("maps common provider names to internal team ids", () => {
    expect(teamIdFromName("USA")).toBe("united-states");
    expect(teamIdFromName("Czech Republic")).toBe("czechia");
    expect(teamIdFromName("South Korea")).toBe("korea-republic");
    expect(teamIdFromName("DR Congo")).toBe("congo-dr");
    expect(teamIdFromName("Türkiye")).toBe("turkiye");
    expect(teamIdFromName("Côte d'Ivoire")).toBe("cote-divoire");
  });
});

describe("red-card event tracking", () => {
  it("parses API-Football card events and applies fastest red-card minutes", () => {
    const fixtureCards = parseApiFootballCardEvents(123, [
      {
        time: { elapsed: 45, extra: 2 },
        team: { name: "USA" },
        player: { name: "Test Player" },
        type: "Card",
        detail: "Red Card",
      },
      {
        time: { elapsed: 68, extra: null },
        team: { name: "Mexico" },
        type: "Card",
        detail: "Yellow Card",
      },
      {
        time: { elapsed: 90, extra: 4 },
        team: { name: "Mexico" },
        type: "Card",
        detail: "Yellow-Red Card",
      },
    ], true);
    const stats = new Map<string, TeamLiveStat>([
      ["united-states", { teamId: "united-states", played: 0, goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, form: "-" }],
      ["mexico", { teamId: "mexico", played: 0, goalsFor: 0, goalsAgainst: 0, yellowCards: 0, redCards: 0, cleanSheets: 0, form: "-" }],
    ]);

    applyFixtureCardsToStats(stats, [fixtureCards]);

    expect(fixtureCards.events.map((event) => event.displayMinute)).toEqual(["45+2", "68", "90+4"]);
    expect(stats.get("united-states")?.redCards).toBe(1);
    expect(stats.get("united-states")?.redCardMinute).toBe(47);
    expect(stats.get("mexico")?.yellowCards).toBe(1);
    expect(stats.get("mexico")?.redCards).toBe(1);
    expect(stats.get("mexico")?.redCardMinute).toBe(94);
  });
});
