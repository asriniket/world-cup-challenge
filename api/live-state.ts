import { completedResults as fallbackResults, liveStats as fallbackStats, type CompletedResult, type TeamLiveStat } from "../src/data/live.js";
import { teams } from "../src/data/teams.js";
import { teamIdFromName } from "../src/lib/teamAliases.js";
import { hasRedisConfig, parseJson, redisCommand } from "./server-cache.js";

type ApiFootballFixture = {
  fixture: {
    id: number;
    status: { short: string; elapsed: number | null };
  };
  teams: {
    home: { name: string; winner: boolean | null };
    away: { name: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
};

type CachedFixtures = {
  response: ApiFootballFixture[];
  updatedAt: string;
};

const finishedStatuses = new Set(["FT", "AET", "PEN"]);
const activeStatuses = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
// 30-minute CDN cache keeps API-Football usage around 48 requests/day.
const cacheHeaders = { "Cache-Control": "s-maxage=1800, stale-while-revalidate=3600" };
const fixturesCacheKey = "wc2026:api-football:fixtures:league-1:season-2026";
const fixturesBudgetPrefix = "wc2026:api-football:fixtures-budget";

function emptyStats(): Map<string, TeamLiveStat> {
  return new Map(
    teams.map((team) => [
      team.id,
      {
        teamId: team.id,
        played: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        cleanSheets: 0,
        form: "-",
      },
    ]),
  );
}

function addForm(current: string, next: "W" | "D" | "L") {
  return current === "-" ? next : `${current}${next}`.slice(-5);
}

async function apiFootball<T>(path: string, apiKey: string): Promise<T> {
  const response = await fetch(`https://v3.football.api-sports.io${path}`, {
    headers: {
      accept: "application/json",
      "x-apisports-key": apiKey,
    },
  });

  if (!response.ok) throw new Error(`API-Football ${path} returned ${response.status}`);
  return response.json() as Promise<T>;
}

function fixtureCacheMinutes() {
  return Math.max(15, Number(process.env.API_FOOTBALL_FIXTURE_CACHE_MINUTES || 30));
}

function isFreshFixtureCache(cache: CachedFixtures) {
  return Date.now() - Date.parse(cache.updatedAt) < fixtureCacheMinutes() * 60 * 1000;
}

function fixtureBudgetKey(now = new Date()) {
  return `${fixturesBudgetPrefix}:${now.toISOString().slice(0, 10)}`;
}

async function readFixturesCache() {
  const cached = await redisCommand<string>(["GET", fixturesCacheKey]);
  return parseJson<CachedFixtures>(cached);
}

async function writeFixturesCache(response: ApiFootballFixture[]) {
  await redisCommand(["SET", fixturesCacheKey, JSON.stringify({ response, updatedAt: new Date().toISOString() })]);
}

async function reserveFixturesBudget() {
  if (!hasRedisConfig()) return true;

  const dailyLimit = Number(process.env.API_FOOTBALL_FIXTURE_DAILY_LIMIT || 55);
  const key = fixtureBudgetKey();
  const used = await redisCommand<number>(["INCR", key]);
  if (used === 1) await redisCommand(["EXPIRE", key, 172800]);
  return typeof used === "number" && used <= dailyLimit;
}

async function getFixtures(apiKey: string) {
  const cached = await readFixturesCache().catch(() => undefined);
  if (cached && isFreshFixtureCache(cached)) return cached.response;

  const hasBudget = await reserveFixturesBudget().catch(() => false);
  if (!hasBudget && cached?.response) return cached.response;
  if (!hasBudget) throw new Error("Daily API-Football fixture budget reached and no cached fixture snapshot exists.");

  const fixturesPayload = await apiFootball<{ response: ApiFootballFixture[] }>("/fixtures?league=1&season=2026", apiKey);
  const response = fixturesPayload.response || [];
  await writeFixturesCache(response).catch(() => undefined);
  return response;
}

function applyManualOverrides(stats: Map<string, TeamLiveStat>) {
  const raw = process.env.LIVE_STAT_OVERRIDES_JSON;
  if (!raw) return;

  try {
    const overrides = JSON.parse(raw) as Array<Partial<TeamLiveStat> & { teamId: string }>;
    overrides.forEach((override) => {
      const current = stats.get(override.teamId);
      if (!current) return;
      stats.set(override.teamId, { ...current, ...override });
    });
  } catch {
    // Ignore malformed optional overrides and keep provider data intact.
  }
}

export async function GET(): Promise<Response> {
  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return Response.json({
      stats: fallbackStats,
      results: fallbackResults,
      source: "Static fallback",
      updatedAt: new Date().toISOString(),
      warning: "Set API_FOOTBALL_KEY to enable real scores, results, and goals.",
    }, { headers: cacheHeaders });
  }

  try {
    const fixtures = await getFixtures(apiKey);
    const relevantFixtures = fixtures.filter((fixture) => {
      const status = fixture.fixture.status.short;
      return finishedStatuses.has(status) || activeStatuses.has(status);
    });
    const stats = emptyStats();
    const results: CompletedResult[] = [];

    relevantFixtures.forEach((fixture) => {
      const status = fixture.fixture.status.short;
      const homeId = teamIdFromName(fixture.teams.home.name);
      const awayId = teamIdFromName(fixture.teams.away.name);
      if (!homeId || !awayId) return;

      const home = stats.get(homeId);
      const away = stats.get(awayId);
      if (!home || !away) return;

      const homeGoals = fixture.goals.home || 0;
      const awayGoals = fixture.goals.away || 0;
      home.played += finishedStatuses.has(status) ? 1 : 0;
      away.played += finishedStatuses.has(status) ? 1 : 0;
      home.goalsFor += homeGoals;
      home.goalsAgainst += awayGoals;
      away.goalsFor += awayGoals;
      away.goalsAgainst += homeGoals;
      if (finishedStatuses.has(status) && awayGoals === 0) home.cleanSheets += 1;
      if (finishedStatuses.has(status) && homeGoals === 0) away.cleanSheets += 1;

      if (finishedStatuses.has(status)) {
        if (homeGoals > awayGoals) {
          home.form = addForm(home.form, "W");
          away.form = addForm(away.form, "L");
          results.push({ winnerId: homeId, loserId: awayId, score: `${homeGoals}-${awayGoals}` });
        } else if (awayGoals > homeGoals) {
          away.form = addForm(away.form, "W");
          home.form = addForm(home.form, "L");
          results.push({ winnerId: awayId, loserId: homeId, score: `${awayGoals}-${homeGoals}` });
        } else {
          home.form = addForm(home.form, "D");
          away.form = addForm(away.form, "D");
        }
      }

    });

    applyManualOverrides(stats);

    return Response.json({
      stats: Array.from(stats.values()),
      results,
      source: "API-Football",
      updatedAt: new Date().toISOString(),
    }, { headers: cacheHeaders });
  } catch (error) {
    return Response.json({
      stats: fallbackStats,
      results: fallbackResults,
      source: "Static fallback",
      updatedAt: new Date().toISOString(),
      warning: error instanceof Error ? error.message : "Unknown live-state fetch error",
    }, { headers: cacheHeaders });
  }
}
