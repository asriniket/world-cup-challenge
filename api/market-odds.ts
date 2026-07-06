import { teamIdFromName } from "../src/lib/teamAliases.js";
import { teams } from "../src/data/teams.js";
import { hasRedisConfig, parseJson, redisCommand } from "./server-cache.js";

type MarketOdd = {
  teamId: string;
  probability: number;
  source: string;
  updatedAt: string;
};

type CachedOdds = {
  odds: MarketOdd[];
  updatedAt: string;
  marketUpdatedAt?: string;
  quota?: OddsQuota;
};

type OddsQuota = {
  used?: number;
  remaining?: number;
  last?: number;
};

type OddsPayload = {
  odds: MarketOdd[];
  cached: boolean;
  source: string;
  updatedAt: string;
  marketUpdatedAt?: string;
  nextRefreshAt: string;
  quota?: OddsQuota;
  warning?: string;
};

const sourceName = "The Odds API";
const cachePrefix = process.env.ODDS_CACHE_PREFIX || "wc2026:market-odds";
const memoryCache = new Map<string, CachedOdds>();
const memoryBudget = new Map<string, number>();
const dynamicHeaders = { "Cache-Control": "no-store, max-age=0, must-revalidate" };

function oddsCacheHours() {
  return Math.max(1, Number(process.env.THE_ODDS_CACHE_HOURS || process.env.ODDS_CACHE_HOURS || 6));
}

function retryRefreshMs() {
  return Math.max(1, Number(process.env.THE_ODDS_RETRY_MINUTES || 5)) * 60 * 1000;
}

function cacheHeaders() {
  return dynamicHeaders;
}

function sportKey() {
  return process.env.THE_ODDS_SPORT_KEY || "soccer_fifa_world_cup_winner";
}

function regions() {
  return process.env.THE_ODDS_REGIONS || "us";
}

function bookmakers() {
  return process.env.THE_ODDS_BOOKMAKERS || "";
}

function oddsCacheKey() {
  return `${cachePrefix}:${sportKey()}:outrights:${regions()}:${bookmakers()}`;
}

function parseCachedOdds(value: unknown): CachedOdds | undefined {
  const parsed = parseJson<CachedOdds>(value);
  return parsed?.odds?.length ? parsed : undefined;
}

function isFresh(cache: CachedOdds) {
  return Date.now() - Date.parse(cache.updatedAt) < oddsCacheHours() * 60 * 60 * 1000;
}

function nextCacheRefreshAt(updatedAt: string) {
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return retryRefreshAt();

  return new Date(timestamp + oddsCacheHours() * 60 * 60 * 1000).toISOString();
}

function retryRefreshAt() {
  return new Date(Date.now() + retryRefreshMs()).toISOString();
}

function nextMonthlyBudgetRefreshAt(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString();
}

function latestMarketUpdatedAt(odds: MarketOdd[]) {
  const updates = odds
    .map((odd) => odd.updatedAt)
    .filter((updatedAt) => Number.isFinite(Date.parse(updatedAt)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));

  return updates[updates.length - 1];
}

async function readOddsCache(key: string) {
  const memory = memoryCache.get(key);
  if (memory) return memory;

  const cached = await redisCommand<string>(["GET", key]);
  const parsed = parseCachedOdds(cached);
  if (parsed) memoryCache.set(key, parsed);
  return parsed;
}

async function writeOddsCache(key: string, odds: MarketOdd[], quota?: OddsQuota, updatedAt = new Date().toISOString()) {
  if (!odds.length) return;

  const payload: CachedOdds = { odds, updatedAt, marketUpdatedAt: latestMarketUpdatedAt(odds), quota };
  memoryCache.set(key, payload);
  await redisCommand([
    "SET",
    key,
    JSON.stringify(payload),
    "EX",
    Math.max(oddsCacheHours() * 60 * 60 * 2, 60 * 60 * 12),
  ]);
}

function monthlyBudgetKey(now = new Date()) {
  return `${cachePrefix}:budget:${now.toISOString().slice(0, 7)}`;
}

function monthlyLimit() {
  return Math.max(1, Number(process.env.THE_ODDS_MONTHLY_LIMIT || process.env.ODDS_API_MONTHLY_LIMIT || 450));
}

function estimatedCreditCost() {
  if (bookmakers()) {
    return Math.ceil(bookmakers().split(",").map((book) => book.trim()).filter(Boolean).length / 10) || 1;
  }

  return regions().split(",").map((region) => region.trim()).filter(Boolean).length || 1;
}

async function reserveOddsBudget() {
  const key = monthlyBudgetKey();
  const cost = estimatedCreditCost();

  if (!hasRedisConfig()) {
    const used = (memoryBudget.get(key) || 0) + cost;
    memoryBudget.set(key, used);
    return used <= monthlyLimit();
  }

  const used = await redisCommand<number>(["INCRBY", key, cost]);
  if (used === cost) await redisCommand(["EXPIRE", key, 60 * 60 * 24 * 45]);
  return typeof used === "number" && used <= monthlyLimit();
}

function readQuota(response: Response): OddsQuota {
  return {
    used: numericHeader(response, "x-requests-used"),
    remaining: numericHeader(response, "x-requests-remaining"),
    last: numericHeader(response, "x-requests-last"),
  };
}

function numericHeader(response: Response, name: string) {
  const value = response.headers.get(name);
  if (!value) return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function averageNormalizedBooks(
  books: Array<{ source: string; updatedAt: string; outcomes: Array<{ name: string; decimalOdds: number }> }>,
): MarketOdd[] {
  const probabilityBuckets = new Map<string, number[]>();
  const source = books.map((book) => book.source).filter(Boolean).join(", ") || sourceName;
  const sortedUpdates = books.map((book) => book.updatedAt).sort();
  const updatedAt = sortedUpdates[sortedUpdates.length - 1] || new Date().toISOString();

  books.forEach((book) => {
    const raw = book.outcomes
      .map((outcome) => ({
        teamId: teamIdFromName(outcome.name),
        probability: outcome.decimalOdds > 1 ? 1 / outcome.decimalOdds : 0,
      }))
      .filter((outcome): outcome is { teamId: string; probability: number } => Boolean(outcome.teamId) && outcome.probability > 0);

    const total = raw.reduce((sum, outcome) => sum + outcome.probability, 0);
    if (!total) return;

    raw.forEach((outcome) => {
      const bucket = probabilityBuckets.get(outcome.teamId) || [];
      bucket.push(outcome.probability / total);
      probabilityBuckets.set(outcome.teamId, bucket);
    });
  });

  return Array.from(probabilityBuckets.entries())
    .map(([teamId, probabilities]) => ({
      teamId,
      probability: probabilities.reduce((sum, probability) => sum + probability, 0) / probabilities.length,
      source,
      updatedAt,
    }))
    .sort((a, b) => b.probability - a.probability);
}

async function fetchTheOddsApi(): Promise<{ odds: MarketOdd[]; quota: OddsQuota }> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  if (!apiKey) throw new Error("Set THE_ODDS_API_KEY to fetch World Cup outrights.");

  const params = new URLSearchParams({
    apiKey,
    markets: "outrights",
    oddsFormat: "decimal",
    dateFormat: "iso",
  });

  if (bookmakers()) {
    params.set("bookmakers", bookmakers());
  } else {
    params.set("regions", regions());
  }

  const response = await fetch(`https://api.the-odds-api.com/v4/sports/${sportKey()}/odds/?${params.toString()}`);
  const quota = readQuota(response);
  if (!response.ok) throw new Error(`The Odds API returned ${response.status}`);

  const payload = (await response.json()) as Array<{
    bookmakers?: Array<{
      title: string;
      last_update: string;
      markets?: Array<{ key: string; outcomes?: Array<{ name: string; price: number }> }>;
    }>;
  }>;

  const odds = averageNormalizedBooks(
    payload.flatMap((event) =>
      (event.bookmakers || []).flatMap((bookmaker) =>
        (bookmaker.markets || [])
          .filter((market) => market.key === "outrights")
          .map((market) => ({
            source: `${sourceName} ${bookmaker.title}`,
            updatedAt: bookmaker.last_update,
            outcomes: (market.outcomes || []).map((outcome) => ({ name: outcome.name, decimalOdds: outcome.price })),
          })),
      ),
    ),
  );

  return { odds, quota };
}

function payloadFromCache(cache: CachedOdds, warning?: string, nextRefreshAt = nextCacheRefreshAt(cache.updatedAt)): OddsPayload {
  return {
    odds: cache.odds,
    cached: true,
    source: sourceName,
    updatedAt: cache.updatedAt,
    marketUpdatedAt: cache.marketUpdatedAt || latestMarketUpdatedAt(cache.odds),
    nextRefreshAt,
    quota: cache.quota,
    warning: warning || coverageWarning(cache.odds),
  };
}

function emptyPayload(warning: string, nextRefreshAt = retryRefreshAt()): OddsPayload {
  return {
    odds: [],
    cached: false,
    source: sourceName,
    updatedAt: new Date().toISOString(),
    nextRefreshAt,
    warning,
  };
}

function coverageWarning(odds: MarketOdd[]) {
  if (odds.length >= teams.length) return undefined;
  return `The Odds API returned ${odds.length}/${teams.length} teams; probabilities are normalized across priced teams only.`;
}

export async function GET(): Promise<Response> {
  const key = oddsCacheKey();
  const cached = await readOddsCache(key).catch(() => undefined);

  if (cached && isFresh(cached)) {
    return Response.json(payloadFromCache(cached), { headers: cacheHeaders() });
  }

  try {
    const hasBudget = await reserveOddsBudget();
    if (!hasBudget) {
      const nextRefreshAt = nextMonthlyBudgetRefreshAt();
      if (cached) return Response.json(payloadFromCache(cached, "Monthly Odds API budget reached; serving the last cached snapshot.", nextRefreshAt), { headers: cacheHeaders() });
      return Response.json(emptyPayload("Monthly Odds API budget reached and no cached odds snapshot exists.", nextRefreshAt), { status: 429, headers: cacheHeaders() });
    }

    const { odds, quota } = await fetchTheOddsApi();
    if (!odds.length) {
      const warning = "The Odds API returned no mapped World Cup outright odds.";
      if (cached) return Response.json(payloadFromCache(cached, warning, retryRefreshAt()), { headers: cacheHeaders() });
      return Response.json(emptyPayload(warning), { status: 502, headers: cacheHeaders() });
    }

    const updatedAt = new Date().toISOString();
    await writeOddsCache(key, odds, quota, updatedAt).catch(() => undefined);
    return Response.json({
      odds,
      cached: false,
      source: sourceName,
      updatedAt,
      marketUpdatedAt: latestMarketUpdatedAt(odds),
      nextRefreshAt: nextCacheRefreshAt(updatedAt),
      quota,
      warning: coverageWarning(odds),
    }, { headers: cacheHeaders() });
  } catch (error) {
    const warning = error instanceof Error ? error.message : "Unknown Odds API fetch error";
    if (cached) return Response.json(payloadFromCache(cached, warning, retryRefreshAt()), { headers: cacheHeaders() });
    return Response.json(emptyPayload(warning), { status: 502, headers: cacheHeaders() });
  }
}
