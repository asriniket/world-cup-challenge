import { DRAW_SEED, DRAW_STORAGE_KEY, PARTICIPANTS } from "../data/config";
import type { Assignment, StoredAssignment } from "./draw";
import { hydrateAssignments, serializeAssignments } from "./draw";
import type { Team } from "../data/teams";
import type { TeamEv } from "./ev";

type StoredDraw = {
  seed: string;
  savedAt: string;
  participants: string[];
  assignments: StoredAssignment[];
};

export function loadStoredDraw(teams: Team[], evs: TeamEv[]): Assignment[] | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(DRAW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredDraw;
    const participantSignature = parsed.participants.join("|") === PARTICIPANTS.join("|");
    if (parsed.seed !== DRAW_SEED || !participantSignature || parsed.assignments.length !== teams.length) return null;
    return hydrateAssignments(parsed.assignments, teams, evs);
  } catch {
    return null;
  }
}

export function saveStoredDraw(assignments: Assignment[]) {
  if (typeof window === "undefined") return false;

  const payload: StoredDraw = {
    seed: DRAW_SEED,
    savedAt: new Date().toISOString(),
    participants: PARTICIPANTS,
    assignments: serializeAssignments(assignments),
  };

  try {
    window.localStorage.setItem(DRAW_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}
