export type MarketOdd = {
  teamId: string;
  probability: number;
  source: string;
  updatedAt: string;
};

export const fallbackMarketOdds: MarketOdd[] = [
  { teamId: "france", probability: 0.15, source: "Static fallback", updatedAt: "2026-06-13T12:00:00-05:00" },
  { teamId: "argentina", probability: 0.13, source: "Static fallback", updatedAt: "2026-06-13T12:00:00-05:00" },
  { teamId: "brazil", probability: 0.12, source: "Static fallback", updatedAt: "2026-06-13T12:00:00-05:00" },
  { teamId: "england", probability: 0.11, source: "Static fallback", updatedAt: "2026-06-13T12:00:00-05:00" },
  { teamId: "spain", probability: 0.105, source: "Static fallback", updatedAt: "2026-06-13T12:00:00-05:00" },
  { teamId: "portugal", probability: 0.082, source: "Static fallback", updatedAt: "2026-06-13T12:00:00-05:00" },
  { teamId: "germany", probability: 0.075, source: "Static fallback", updatedAt: "2026-06-13T12:00:00-05:00" },
  { teamId: "netherlands", probability: 0.071, source: "Static fallback", updatedAt: "2026-06-13T12:00:00-05:00" },
  { teamId: "uruguay", probability: 0.045, source: "Static fallback", updatedAt: "2026-06-13T12:00:00-05:00" },
  { teamId: "colombia", probability: 0.032, source: "Static fallback", updatedAt: "2026-06-13T12:00:00-05:00" },
];

export async function fetchMarketOdds(): Promise<MarketOdd[]> {
  const endpoint = import.meta.env.VITE_MARKET_ODDS_URL || "/api/market-odds";

  try {
    const response = await fetch(endpoint, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Odds feed returned ${response.status}`);
    const payload = (await response.json()) as { odds?: MarketOdd[] };
    return payload.odds?.length ? payload.odds : fallbackMarketOdds;
  } catch {
    return fallbackMarketOdds;
  }
}
