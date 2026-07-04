import type { Team } from "../data/teams";
import { hydrateAssignments, type Assignment, type StoredAssignment } from "../lib/draw";
import type { TeamEv } from "../lib/ev";
import { freshEndpoint, noStoreJsonRequest } from "./http";

type DrawLedgerResponse = {
  ready?: boolean;
  assignments?: StoredAssignment[];
};

export async function fetchDrawLedger(teams: Team[], evs: TeamEv[]): Promise<Assignment[] | null> {
  try {
    const response = await fetch(freshEndpoint("/api/draw"), noStoreJsonRequest);
    if (!response.ok) return null;

    const payload = (await response.json()) as DrawLedgerResponse;
    if (!payload.ready || !payload.assignments?.length) return null;
    return hydrateAssignments(payload.assignments, teams, evs);
  } catch {
    return null;
  }
}
