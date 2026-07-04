import type { CompletedResult, LiveFixture, TeamLiveStat } from "../data/live";
import { freshEndpoint, noStoreJsonRequest } from "./http";

export type LiveState = {
  stats: TeamLiveStat[];
  results: CompletedResult[];
  fixtures: LiveFixture[];
  source: string;
  updatedAt: string;
  cached?: boolean;
  warning?: string;
};

export const initialLiveState: LiveState = {
  stats: [],
  results: [],
  fixtures: [],
  source: "WorldCup26 API",
  updatedAt: new Date(0).toISOString(),
  warning: "Waiting for live match data.",
};

export async function fetchLiveState(): Promise<LiveState> {
  const endpoint = import.meta.env.VITE_LIVE_STATE_URL || "/api/live-state";

  try {
    const response = await fetch(freshEndpoint(endpoint), noStoreJsonRequest);
    const payload = (await response.json()) as Partial<LiveState>;

    return {
      stats: payload.stats || [],
      results: payload.results || [],
      fixtures: payload.fixtures || [],
      source: payload.source || "WorldCup26 API",
      updatedAt: payload.updatedAt || new Date().toISOString(),
      cached: payload.cached,
      warning: response.ok ? payload.warning : payload.warning || `Live feed returned ${response.status}`,
    };
  } catch (error) {
    return {
      ...initialLiveState,
      updatedAt: new Date().toISOString(),
      warning: error instanceof Error ? error.message : "Unable to fetch live match data.",
    };
  }
}
