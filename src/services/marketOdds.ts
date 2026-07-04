import { freshEndpoint, noStoreJsonRequest } from "./http";

export type MarketOdd = {
  teamId: string;
  probability: number;
  source: string;
  updatedAt: string;
};

export type MarketOddsState = {
  odds: MarketOdd[];
  source: string;
  updatedAt: string;
  cached?: boolean;
  warning?: string;
};

export const initialMarketOddsState: MarketOddsState = {
  odds: [],
  source: "The Odds API",
  updatedAt: new Date(0).toISOString(),
  warning: "Waiting for market odds.",
};

export async function fetchMarketOdds(): Promise<MarketOddsState> {
  const endpoint = import.meta.env.VITE_MARKET_ODDS_URL || "/api/market-odds";

  try {
    const response = await fetch(freshEndpoint(endpoint), noStoreJsonRequest);
    const payload = (await response.json()) as Partial<MarketOddsState>;

    return {
      odds: payload.odds || [],
      source: payload.source || "The Odds API",
      updatedAt: payload.updatedAt || new Date().toISOString(),
      cached: payload.cached,
      warning: response.ok ? payload.warning : payload.warning || `Odds feed returned ${response.status}`,
    };
  } catch (error) {
    return {
      ...initialMarketOddsState,
      updatedAt: new Date().toISOString(),
      warning: error instanceof Error ? error.message : "Unable to fetch market odds.",
    };
  }
}
