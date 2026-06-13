import { teamIdFromName } from "../src/lib/teamAliases.js";
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
};

const fallbackOdds: MarketOdd[] = [
  { teamId: "france", probability: 0.15, source: "Vercel fallback", updatedAt: new Date().toISOString() },
  { teamId: "argentina", probability: 0.13, source: "Vercel fallback", updatedAt: new Date().toISOString() },
  { teamId: "brazil", probability: 0.12, source: "Vercel fallback", updatedAt: new Date().toISOString() },
  { teamId: "england", probability: 0.11, source: "Vercel fallback", updatedAt: new Date().toISOString() },
  { teamId: "spain", probability: 0.105, source: "Vercel fallback", updatedAt: new Date().toISOString() },
  { teamId: "portugal", probability: 0.082, source: "Vercel fallback", updatedAt: new Date().toISOString() },
  { teamId: "germany", probability: 0.075, source: "Vercel fallback", updatedAt: new Date().toISOString() },
  { teamId: "netherlands", probability: 0.071, source: "Vercel fallback", updatedAt: new Date().toISOString() },
];
// The Odds API free tier is monthly-credit limited, so default to 6-hour caching.
const cacheHeaders = { "Cache-Control": "s-maxage=21600, stale-while-revalidate=43200" };
const oddsCachePrefix = process.env.ODDS_CACHE_PREFIX || "wc2026:market-odds";

function oddsCacheHours() {
  return Math.max(1, Number(process.env.ODDS_CACHE_HOURS || 6));
}

function monthlyBudgetKey(now = new Date()) {
  return `${oddsCachePrefix}:budget:${now.toISOString().slice(0, 7)}`;
}

function providerCacheKey(provider: string) {
  const sportKey = process.env.THE_ODDS_SPORT_KEY || "soccer_fifa_world_cup_winner";
  const regions = process.env.THE_ODDS_REGIONS || "us";
  const bookmakers = process.env.THE_ODDS_BOOKMAKERS || "";
  const generic = process.env.ODDS_API_URL || "";
  return `${oddsCachePrefix}:${provider}:${sportKey}:${regions}:${bookmakers}:${generic}`;
}

function parseCachedOdds(value: unknown): CachedOdds | undefined {
  const parsed = parseJson<CachedOdds>(value);
  return parsed?.odds?.length ? parsed : undefined;
}

function isFresh(cache: CachedOdds) {
  return Date.now() - Date.parse(cache.updatedAt) < oddsCacheHours() * 60 * 60 * 1000;
}

async function readOddsCache(key: string) {
  const cached = await redisCommand<string>(["GET", key]);
  return parseCachedOdds(cached);
}

async function writeOddsCache(key: string, odds: MarketOdd[]) {
  if (!odds.length) return;

  const payload: CachedOdds = { odds, updatedAt: new Date().toISOString() };
  await redisCommand(["SET", key, JSON.stringify(payload)]);
}

async function reserveOddsBudget() {
  if (!hasRedisConfig()) return true;

  const monthlyLimit = Number(process.env.ODDS_API_MONTHLY_LIMIT || 450);
  const used = await redisCommand<number>(["INCR", monthlyBudgetKey()]);
  if (used === 1) await redisCommand(["EXPIRE", monthlyBudgetKey(), 60 * 60 * 24 * 45]);
  return typeof used === "number" && used <= monthlyLimit;
}

function averageNormalizedBooks(
  books: Array<{ source: string; updatedAt: string; outcomes: Array<{ name: string; decimalOdds: number }> }>,
): MarketOdd[] {
  const probabilityBuckets = new Map<string, number[]>();
  const source = books.map((book) => book.source).filter(Boolean).join(", ") || "Odds feed";
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

  const odds = Array.from(probabilityBuckets.entries())
    .map(([teamId, probabilities]) => ({
      teamId,
      probability: probabilities.reduce((sum, probability) => sum + probability, 0) / probabilities.length,
      source,
      updatedAt,
    }))
    .sort((a, b) => b.probability - a.probability);

  return odds.length ? odds : fallbackOdds;
}

async function fetchTheOddsApi(): Promise<MarketOdd[]> {
  const apiKey = process.env.THE_ODDS_API_KEY;
  const sportKey = process.env.THE_ODDS_SPORT_KEY || "soccer_fifa_world_cup_winner";
  if (!apiKey) return [];

  const params = new URLSearchParams({
    apiKey,
    regions: process.env.THE_ODDS_REGIONS || "us",
    markets: "outrights",
    oddsFormat: "decimal",
  });
  if (process.env.THE_ODDS_BOOKMAKERS) {
    params.delete("regions");
    params.set("bookmakers", process.env.THE_ODDS_BOOKMAKERS);
  }

  const response = await fetch(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?${params.toString()}`);
  if (!response.ok) throw new Error(`The Odds API returned ${response.status}`);
  const payload = (await response.json()) as Array<{
    bookmakers?: Array<{
      title: string;
      last_update: string;
      markets?: Array<{ key: string; outcomes?: Array<{ name: string; price: number }> }>;
    }>;
  }>;

  return averageNormalizedBooks(
    payload.flatMap((event) =>
      (event.bookmakers || []).flatMap((bookmaker) =>
        (bookmaker.markets || [])
          .filter((market) => market.key === "outrights")
          .map((market) => ({
            source: `The Odds API ${bookmaker.title}`,
            updatedAt: bookmaker.last_update,
            outcomes: (market.outcomes || []).map((outcome) => ({ name: outcome.name, decimalOdds: outcome.price })),
          })),
      ),
    ),
  );
}

async function fetchGeneric(): Promise<MarketOdd[]> {
  const upstreamUrl = process.env.ODDS_API_URL;
  const upstreamToken = process.env.ODDS_API_TOKEN;
  if (!upstreamUrl) return [];

  const upstream = await fetch(upstreamUrl, {
    headers: {
      accept: "application/json",
      ...(upstreamToken ? { authorization: `Bearer ${upstreamToken}` } : {}),
    },
  });

  if (!upstream.ok) throw new Error(`Generic odds endpoint returned ${upstream.status}`);
  const data = (await upstream.json()) as { odds?: MarketOdd[] };
  return data.odds?.length ? data.odds : [];
}

export async function GET(): Promise<Response> {
  const provider = process.env.ODDS_PROVIDER || "the-odds-api";
  const cacheKey = providerCacheKey(provider);
  const cached = await readOddsCache(cacheKey).catch(() => undefined);

  if (cached && isFresh(cached)) {
    return Response.json({ odds: cached.odds, cached: true }, { headers: cacheHeaders });
  }

  try {
    const hasBudget = provider === "the-odds-api" ? await reserveOddsBudget() : true;
    if (!hasBudget) {
      return Response.json({
        odds: cached?.odds || fallbackOdds,
        cached: Boolean(cached),
        warning: "Monthly Odds API budget reached; serving cached or fallback odds.",
      }, { headers: cacheHeaders });
    }

    const odds =
      provider === "the-odds-api"
          ? await fetchTheOddsApi()
          : await fetchGeneric();

    if (odds.length) await writeOddsCache(cacheKey, odds);

    return Response.json({ odds: odds.length ? odds : cached?.odds || fallbackOdds, cached: false }, { headers: cacheHeaders });
  } catch (error) {
    return Response.json({
      odds: cached?.odds || fallbackOdds,
      cached: Boolean(cached),
      warning: error instanceof Error ? error.message : "Unknown odds fetch error",
    }, { headers: cacheHeaders });
  }
}
