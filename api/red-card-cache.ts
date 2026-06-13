import type { TeamLiveStat } from "../src/data/live";
import { teamIdFromName } from "../src/lib/teamAliases";
import { hasRedisConfig, parseJson, redisCommand } from "./server-cache";

export type ApiFootballCardEvent = {
  time: { elapsed: number | null; extra: number | null };
  team: { name: string };
  player?: { name?: string | null };
  type: string;
  detail: string;
};

export type CachedCardEvent = {
  fixtureId: number;
  teamId: string;
  minute: number;
  displayMinute: string;
  cardType: "yellow" | "red";
  detail: string;
  playerName?: string;
};

export type CachedFixtureCards = {
  fixtureId: number;
  finalized: boolean;
  updatedAt: string;
  events: CachedCardEvent[];
};

const keyPrefix = process.env.RED_CARD_CACHE_PREFIX || "wc2026:red-card";

function cardKey(fixtureId: number) {
  return `${keyPrefix}:fixture:${fixtureId}`;
}

function checkedKey(fixtureId: number) {
  return `${keyPrefix}:checked:${fixtureId}`;
}

function dailyBudgetKey(now: Date) {
  return `${keyPrefix}:event-budget:${now.toISOString().slice(0, 10)}`;
}

export function parseApiFootballCardEvents(fixtureId: number, events: ApiFootballCardEvent[], finalized: boolean): CachedFixtureCards {
  const parsedEvents = events.flatMap<CachedCardEvent>((event) => {
    if (event.type !== "Card") return [];

    const teamId = teamIdFromName(event.team.name);
    const elapsed = event.time.elapsed;
    if (!teamId || typeof elapsed !== "number") return [];

    const detail = event.detail.toLowerCase();
    const cardType = detail.includes("red") ? "red" : detail.includes("yellow") ? "yellow" : undefined;
    if (!cardType) return [];

    const extra = event.time.extra || 0;
    return [{
      fixtureId,
      teamId,
      minute: elapsed + extra,
      displayMinute: extra ? `${elapsed}+${extra}` : `${elapsed}`,
      cardType,
      detail: event.detail,
      playerName: event.player?.name || undefined,
    }];
  });

  return {
    fixtureId,
    finalized,
    updatedAt: new Date().toISOString(),
    events: parsedEvents,
  };
}

export function applyFixtureCardsToStats(stats: Map<string, TeamLiveStat>, fixtures: CachedFixtureCards[]) {
  fixtures.forEach((fixture) => {
    fixture.events.forEach((event) => {
      const stat = stats.get(event.teamId);
      if (!stat) return;

      if (event.cardType === "red") {
        stat.redCards += 1;
        stat.redCardMinute = Math.min(stat.redCardMinute || Number.POSITIVE_INFINITY, event.minute);
      } else {
        stat.yellowCards += 1;
      }
    });
  });
}

export async function readFixtureCardCache(fixtureIds: number[]) {
  const empty = new Map<number, CachedFixtureCards>();
  if (!hasRedisConfig() || fixtureIds.length === 0) return empty;

  const values = await redisCommand<Array<string | null>>(["MGET", ...fixtureIds.map(cardKey)]);
  if (!values) return empty;

  return values.reduce((cache, value, index) => {
    const parsed = parseJson<CachedFixtureCards>(value);
    if (parsed) cache.set(fixtureIds[index], parsed);
    return cache;
  }, empty);
}

export async function readLastCheckedCache(fixtureIds: number[]) {
  const empty = new Map<number, number>();
  if (!hasRedisConfig() || fixtureIds.length === 0) return empty;

  const values = await redisCommand<Array<string | null>>(["MGET", ...fixtureIds.map(checkedKey)]);
  if (!values) return empty;

  return values.reduce((cache, value, index) => {
    const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
    if (Number.isFinite(timestamp)) cache.set(fixtureIds[index], timestamp);
    return cache;
  }, empty);
}

export async function writeFixtureCardCache(cache: CachedFixtureCards) {
  if (!hasRedisConfig()) return;

  await redisCommand(["SET", cardKey(cache.fixtureId), JSON.stringify(cache)]);
  await redisCommand(["SET", checkedKey(cache.fixtureId), cache.updatedAt]);
}

export async function reserveEventFetchBudget(now = new Date()) {
  if (!hasRedisConfig()) return false;

  const limit = Number(process.env.RED_CARD_EVENT_DAILY_LIMIT || 35);
  const key = dailyBudgetKey(now);
  const used = await redisCommand<number>(["INCR", key]);
  if (used === 1) await redisCommand(["EXPIRE", key, 172800]);
  return typeof used === "number" && used <= limit;
}

export function canUseRedCardCache() {
  return hasRedisConfig();
}
