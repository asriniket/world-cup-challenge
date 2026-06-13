import { completedResults, liveStats, type CompletedResult, type TeamLiveStat } from "../data/live";

export type LiveState = {
  stats: TeamLiveStat[];
  results: CompletedResult[];
  source: string;
  updatedAt: string;
  warning?: string;
};

export const fallbackLiveState: LiveState = {
  stats: liveStats,
  results: completedResults,
  source: "Static fallback",
  updatedAt: "2026-06-13T12:00:00-05:00",
};

export async function fetchLiveState(): Promise<LiveState> {
  const endpoint = import.meta.env.VITE_LIVE_STATE_URL || "/api/live-state";

  try {
    const response = await fetch(endpoint, { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(`Live feed returned ${response.status}`);
    const payload = (await response.json()) as Partial<LiveState>;
    if (!payload.stats?.length) return fallbackLiveState;
    return {
      stats: payload.stats,
      results: payload.results || [],
      source: payload.source || "Live feed",
      updatedAt: payload.updatedAt || new Date().toISOString(),
      warning: payload.warning,
    };
  } catch {
    return fallbackLiveState;
  }
}
