import {
  type CompletedResult,
  type LiveFixture,
  type TeamLiveStat,
} from "../src/data/live.js";
import { teams } from "../src/data/teams.js";
import { teamIdFromName } from "../src/lib/teamAliases.js";
import { hasRedisConfig, parseJson, redisCommand } from "./server-cache.js";

type WorldCup26Game = {
  id?: string | number;
  home_team_name_en?: string;
  away_team_name_en?: string;
  home_score?: string | number | null;
  away_score?: string | number | null;
  finished?: string | boolean;
  time_elapsed?: string | number | null;
  type?: string;
  local_date?: string;
  group?: string;
  matchday?: string | number;
};

type CachedLiveState = {
  games: WorldCup26Game[];
  updatedAt: string;
};

type LiveStatePayload = {
  stats: TeamLiveStat[];
  results: CompletedResult[];
  fixtures: LiveFixture[];
  source: string;
  updatedAt: string;
  cached?: boolean;
  warning?: string;
};

const finishedStatuses = new Set(["FT", "AET", "PEN"]);
const activeStatuses = new Set(["1H", "HT", "2H", "ET", "BT", "P", "SUSP", "INT", "LIVE"]);
const sourceName = "WorldCup26 API";
const cacheKey = "wc2026:worldcup26:games";
const budgetPrefix = "wc2026:worldcup26:games-budget";
const memoryCache: { value?: CachedLiveState } = {};
const memoryBudget = new Map<string, number>();

function cacheMinutes() {
  return Math.max(2, Number(process.env.WORLDCUP26_CACHE_MINUTES || process.env.LIVE_FIXTURE_CACHE_MINUTES || 6));
}

function cacheHeaders() {
  const seconds = cacheMinutes() * 60;
  return { "Cache-Control": `s-maxage=${Math.min(seconds, 300)}, stale-while-revalidate=${seconds * 2}` };
}

function isFresh(cache: CachedLiveState) {
  return Date.now() - Date.parse(cache.updatedAt) < cacheMinutes() * 60 * 1000;
}

function dailyBudgetKey(now = new Date()) {
  return `${budgetPrefix}:${now.toISOString().slice(0, 10)}`;
}

function dailyLimit() {
  return Math.max(24, Number(process.env.WORLDCUP26_DAILY_LIMIT || process.env.LIVE_FIXTURE_DAILY_LIMIT || 240));
}

async function readCache() {
  if (memoryCache.value) return memoryCache.value;

  const cached = await redisCommand<string>(["GET", cacheKey]);
  const parsed = parseJson<CachedLiveState>(cached);
  if (parsed?.games?.length) memoryCache.value = parsed;
  return parsed;
}

async function writeCache(games: WorldCup26Game[]) {
  const value: CachedLiveState = { games, updatedAt: new Date().toISOString() };
  memoryCache.value = value;

  await redisCommand([
    "SET",
    cacheKey,
    JSON.stringify(value),
    "EX",
    Math.max(cacheMinutes() * 60 * 3, 60 * 60),
  ]);
}

async function reserveBudget() {
  const key = dailyBudgetKey();

  if (!hasRedisConfig()) {
    const used = (memoryBudget.get(key) || 0) + 1;
    memoryBudget.set(key, used);
    return used <= dailyLimit();
  }

  const used = await redisCommand<number>(["INCR", key]);
  if (used === 1) await redisCommand(["EXPIRE", key, 172800]);
  return typeof used === "number" && used <= dailyLimit();
}

async function fetchWorldCup26Games(): Promise<WorldCup26Game[]> {
  const url = process.env.WORLDCUP26_API_URL || "https://worldcup26.ir/get/games";
  const response = await fetch(url, { headers: { accept: "application/json" } });

  if (!response.ok) throw new Error(`WorldCup26 API returned ${response.status}`);

  const payload = (await response.json()) as { games?: WorldCup26Game[] };
  if (!Array.isArray(payload.games)) throw new Error("WorldCup26 API response did not include a games array.");
  return payload.games;
}

async function getGames() {
  const cached = await readCache().catch(() => undefined);
  if (cached && isFresh(cached)) return { games: cached.games, cached: true };

  const hasBudget = await reserveBudget().catch(() => false);
  if (!hasBudget) {
    if (cached?.games?.length) return { games: cached.games, cached: true, warning: "Daily WorldCup26 API budget reached; serving the last cached snapshot." };
    throw new Error("Daily WorldCup26 API budget reached and no cached snapshot exists.");
  }

  try {
    const games = await fetchWorldCup26Games();
    await writeCache(games).catch(() => undefined);
    return { games, cached: false };
  } catch (error) {
    if (cached?.games?.length) {
      return {
        games: cached.games,
        cached: true,
        warning: error instanceof Error ? error.message : "Unknown WorldCup26 API fetch error",
      };
    }

    throw error;
  }
}

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

function numericScore(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

function worldCup26Date(value?: string) {
  const match = value?.match(/^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if (!match) return value;
  const [, month, day, year, hour, minute] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:00`;
}

function worldCup26Round(game: WorldCup26Game) {
  switch ((game.type || "").toLowerCase()) {
    case "group":
      return `Group ${game.group || ""} Matchday ${game.matchday || ""}`.trim();
    case "r32":
      return "Round of 32";
    case "r16":
      return "Round of 16";
    case "qf":
      return "Quarter-final";
    case "sf":
      return "Semi-final";
    case "third":
      return "Third place";
    case "final":
      return "Final";
    default:
      return game.type || undefined;
  }
}

function worldCup26Status(game: WorldCup26Game) {
  if (game.finished === true || String(game.finished).toUpperCase() === "TRUE") return "FT";
  const elapsed = String(game.time_elapsed || "").toLowerCase();
  if (elapsed === "finished") return "FT";
  if (!elapsed || elapsed === "notstarted" || elapsed === "not started") return "NS";
  return elapsed === "live" ? "LIVE" : String(game.time_elapsed);
}

function toLiveFixture(game: WorldCup26Game): LiveFixture {
  return {
    id: typeof game.id === "number" ? game.id : Number(game.id) || undefined,
    date: worldCup26Date(game.local_date),
    round: worldCup26Round(game),
    status: worldCup26Status(game),
    elapsed: null,
    homeId: teamIdFromName(game.home_team_name_en),
    awayId: teamIdFromName(game.away_team_name_en),
    homeGoals: numericScore(game.home_score),
    awayGoals: numericScore(game.away_score),
  };
}

function buildLiveState(games: WorldCup26Game[]) {
  const relevantFixtures = games.map(toLiveFixture).filter((fixture) => {
    return finishedStatuses.has(fixture.status) || activeStatuses.has(fixture.status) || fixture.status === "NS";
  });
  const stats = emptyStats();
  const results: CompletedResult[] = [];

  relevantFixtures.forEach((fixture) => {
    if (!fixture.homeId || !fixture.awayId) return;

    const home = stats.get(fixture.homeId);
    const away = stats.get(fixture.awayId);
    if (!home || !away) return;

    const homeGoals = fixture.homeGoals ?? 0;
    const awayGoals = fixture.awayGoals ?? 0;
    const finished = finishedStatuses.has(fixture.status);
    home.played += finished ? 1 : 0;
    away.played += finished ? 1 : 0;
    home.goalsFor += homeGoals;
    home.goalsAgainst += awayGoals;
    away.goalsFor += awayGoals;
    away.goalsAgainst += homeGoals;
    if (finished && awayGoals === 0) home.cleanSheets += 1;
    if (finished && homeGoals === 0) away.cleanSheets += 1;

    if (finished) {
      if (homeGoals > awayGoals) {
        home.form = addForm(home.form, "W");
        away.form = addForm(away.form, "L");
        results.push({ winnerId: fixture.homeId, loserId: fixture.awayId, score: `${homeGoals}-${awayGoals}`, round: fixture.round });
      } else if (awayGoals > homeGoals) {
        away.form = addForm(away.form, "W");
        home.form = addForm(home.form, "L");
        results.push({ winnerId: fixture.awayId, loserId: fixture.homeId, score: `${awayGoals}-${homeGoals}`, round: fixture.round });
      } else {
        home.form = addForm(home.form, "D");
        away.form = addForm(away.form, "D");
      }
    }
  });

  return {
    stats: Array.from(stats.values()),
    results,
    fixtures: relevantFixtures,
  };
}

function applyManualOverrides(stats: TeamLiveStat[]) {
  const raw = process.env.LIVE_STAT_OVERRIDES_JSON;
  if (!raw) return stats;

  try {
    const overrides = JSON.parse(raw) as Array<Partial<TeamLiveStat> & { teamId: string }>;
    const byTeam = new Map(stats.map((stat) => [stat.teamId, stat]));
    overrides.forEach((override) => {
      const current = byTeam.get(override.teamId);
      if (!current) return;
      byTeam.set(override.teamId, { ...current, ...override });
    });
    return Array.from(byTeam.values());
  } catch {
    return stats;
  }
}

function emptyPayload(warning: string): LiveStatePayload {
  return {
    stats: [],
    results: [],
    fixtures: [],
    source: sourceName,
    updatedAt: new Date().toISOString(),
    warning,
  };
}

export async function GET(): Promise<Response> {
  try {
    const { games, cached, warning } = await getGames();
    const liveState = buildLiveState(games);

    return Response.json({
      ...liveState,
      stats: applyManualOverrides(liveState.stats),
      source: sourceName,
      updatedAt: new Date().toISOString(),
      cached,
      warning,
    }, { headers: cacheHeaders() });
  } catch (error) {
    return Response.json(
      emptyPayload(error instanceof Error ? error.message : "Unknown WorldCup26 API fetch error"),
      { status: 502, headers: cacheHeaders() },
    );
  }
}
