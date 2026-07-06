import { afterEach, describe, expect, it, vi } from "vitest";
import { CATEGORY_POTS, DRAW_SEED, PARTICIPANTS, POT_TOTAL_DOLLARS } from "../data/config";
import { completedResults, liveFixtures, liveStats } from "../data/live";
import { teams } from "../data/teams";
import { initialMarketOddsState } from "../services/marketOdds";
import { buildKnockoutBoard, buildRoundOf32Board } from "./bracket";
import { currentOwnerValues, currentPrizePoolTotal } from "./currentEv";
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

describe("live prediction fixtures", () => {
  it("starts market odds empty until The Odds API or cache responds", () => {
    expect(initialMarketOddsState.odds).toEqual([]);
    expect(initialMarketOddsState.source).toBe("The Odds API");
  });

  it("keeps sample post-opener results available for bracket logic tests", () => {
    expect(completedResults).toContainEqual({ winnerId: "mexico", loserId: "south-africa", score: "2-0" });
    expect(completedResults).toContainEqual({ winnerId: "united-states", loserId: "paraguay", score: "4-1" });
    expect(completedResults.some((result) => result.winnerId === "switzerland")).toBe(false);

    expect(liveStats.find((stat) => stat.teamId === "brazil")).toMatchObject({ played: 1, goalsFor: 1, goalsAgainst: 1, form: "D" });
    expect(liveStats.find((stat) => stat.teamId === "morocco")).toMatchObject({ played: 1, goalsFor: 1, goalsAgainst: 1, form: "D" });
  });

  it("projects the full Round of 32 board from fixture-backed group tables", () => {
    const board = buildRoundOf32Board(teams, liveFixtures);
    expect(board).toHaveLength(16);
    expect(board[0].matchNumber).toBe(73);
    expect(board[15].matchNumber).toBe(88);

    const mexicoMatch = board.find((match) => match.matchNumber === 79);
    expect(mexicoMatch?.entrants[0]).toMatchObject({ teamId: "mexico", source: "projection" });

    const thirdPlaceEntrants = board.flatMap((match) => match.entrants).filter((entrant) => entrant.label.startsWith("Best 3rd"));
    expect(thirdPlaceEntrants).toHaveLength(8);
    expect(new Set(thirdPlaceEntrants.map((entrant) => entrant.teamId)).size).toBe(8);
  });

  it("uses API-published knockout fixtures beyond the Round of 32", () => {
    const board = buildKnockoutBoard(teams, [
      {
        id: 89,
        status: "NS",
        round: "Round of 16",
        homeId: "mexico",
        awayId: "brazil",
        homeGoals: null,
        awayGoals: null,
      },
    ]);

    expect(board).toHaveLength(1);
    expect(board[0]).toMatchObject({ matchNumber: 89, round: "Round of 16", source: "api" });
    expect(board[0].entrants[0]).toMatchObject({ teamId: "mexico", source: "api" });
    expect(board[0].entrants[1]).toMatchObject({ teamId: "brazil", source: "api" });
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

describe("current EV datapaths", () => {
  it("uses market odds for the winner slice without changing non-winner EV", () => {
    const assignment = assignments.find((entry) => entry.team.id === "brazil")!;
    const marketOdds = [
      {
        teamId: assignment.team.id,
        probability: 0.25,
        source: "Test book",
        updatedAt: "2026-07-05T18:39:00Z",
      },
    ];
    const [owner] = currentOwnerValues([assignment], [assignment.participant], marketOdds);
    const marketChampionEv = 0.25 * CATEGORY_POTS.champion;
    const nonWinnerEv = assignment.ev.total - assignment.ev.categoryEv.champion;

    expect(owner.championEv).toBeCloseTo(marketChampionEv, 8);
    expect(owner.nonWinnerEv).toBeCloseTo(nonWinnerEv, 8);
    expect(owner.total).toBeCloseTo(nonWinnerEv + marketChampionEv, 8);
    expect(currentPrizePoolTotal(marketOdds)).toBeCloseTo(POT_TOTAL_DOLLARS - CATEGORY_POTS.champion + marketChampionEv, 8);
  });

  it("falls back to the draw EV model before market odds load", () => {
    const assignment = assignments.find((entry) => entry.team.id === "brazil")!;
    const [owner] = currentOwnerValues([assignment], [assignment.participant], []);

    expect(owner.championEv).toBeCloseTo(assignment.ev.categoryEv.champion, 8);
    expect(owner.total).toBeCloseTo(assignment.ev.total, 8);
    expect(currentPrizePoolTotal([])).toBe(POT_TOTAL_DOLLARS);
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

describe("market odds API cache status", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
    delete process.env.THE_ODDS_API_KEY;
    delete process.env.THE_ODDS_CACHE_HOURS;
    delete process.env.THE_ODDS_MONTHLY_LIMIT;
    delete process.env.ODDS_CACHE_PREFIX;
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
  });

  it("returns the next provider refresh time when serving a fresh odds cache", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-05T18:44:00.000Z"));

    process.env.THE_ODDS_API_KEY = "test-key";
    process.env.THE_ODDS_CACHE_HOURS = "6";
    process.env.THE_ODDS_MONTHLY_LIMIT = "10";
    process.env.ODDS_CACHE_PREFIX = "test-market-cache-status";
    process.env.UPSTASH_REDIS_REST_URL = "";
    process.env.UPSTASH_REDIS_REST_TOKEN = "";

    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify([
          {
            bookmakers: [
              {
                title: "Book A",
                last_update: "2026-07-05T18:39:00Z",
                markets: [
                  {
                    key: "outrights",
                    outcomes: [
                      { name: "Brazil", price: 4 },
                      { name: "France", price: 5 },
                    ],
                  },
                ],
              },
            ],
          },
        ]),
        {
          headers: {
            "content-type": "application/json",
            "x-requests-used": "1",
            "x-requests-remaining": "499",
            "x-requests-last": "1",
          },
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();

    const { GET } = await import("../../api/market-odds");
    const firstResponse = await GET();
    const firstPayload = await firstResponse.json();

    expect(firstPayload).toMatchObject({
      cached: false,
      updatedAt: "2026-07-05T18:44:00.000Z",
      marketUpdatedAt: "2026-07-05T18:39:00Z",
      nextRefreshAt: "2026-07-06T00:44:00.000Z",
    });

    vi.setSystemTime(new Date("2026-07-05T19:00:00.000Z"));

    const cachedResponse = await GET();
    const cachedPayload = await cachedResponse.json();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(cachedPayload).toMatchObject({
      cached: true,
      updatedAt: "2026-07-05T18:44:00.000Z",
      marketUpdatedAt: "2026-07-05T18:39:00Z",
      nextRefreshAt: "2026-07-06T00:44:00.000Z",
    });
  });
});
