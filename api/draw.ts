import { DRAW_SEED, DRAW_START_ISO, PARTICIPANTS } from "../src/data/config.js";
import { teams } from "../src/data/teams.js";
import { buildAssignments, serializeAssignments } from "../src/lib/draw.js";
import { computeTeamEvs } from "../src/lib/ev.js";

const cacheHeaders = { "Cache-Control": "no-store" };

export async function GET(): Promise<Response> {
  const drawStart = new Date(DRAW_START_ISO).getTime();
  const now = Date.now();

  if (now < drawStart) {
    return Response.json({
      ready: false,
      drawStartIso: DRAW_START_ISO,
      message: "Draw ledger is sealed until the scheduled draw time.",
    }, { status: 423, headers: cacheHeaders });
  }

  const privateSeed = process.env.DRAW_SEED_SECRET;
  if (!privateSeed) {
    return Response.json({
      ready: false,
      message: "Set DRAW_SEED_SECRET on the server before the draw.",
    }, { status: 500, headers: cacheHeaders });
  }

  const evs = computeTeamEvs(teams);
  const assignments = buildAssignments(teams, PARTICIPANTS, evs, privateSeed);

  return Response.json({
    ready: true,
    seedVersion: DRAW_SEED,
    assignments: serializeAssignments(assignments),
    generatedAt: new Date().toISOString(),
  }, { headers: cacheHeaders });
}
