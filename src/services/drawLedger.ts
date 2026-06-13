import type { Team } from "../data/teams";
import { hydrateAssignments, type Assignment, type StoredAssignment } from "../lib/draw";
import type { TeamEv } from "../lib/ev";

type DrawLedgerResponse = {
  ready?: boolean;
  assignments?: StoredAssignment[];
};

export async function fetchDrawLedger(teams: Team[], evs: TeamEv[]): Promise<Assignment[] | null> {
  try {
    const response = await fetch("/api/draw", { headers: { accept: "application/json" } });
    if (!response.ok) return null;

    const payload = (await response.json()) as DrawLedgerResponse;
    if (!payload.ready || !payload.assignments?.length) return null;
    return hydrateAssignments(payload.assignments, teams, evs);
  } catch {
    return null;
  }
}
