import { DRAW_SEED, DRAW_START_ISO, PARTICIPANTS } from "../src/data/config";
import { teams } from "../src/data/teams";
import { buildAssignments, serializeAssignments } from "../src/lib/draw";
import { computeTeamEvs } from "../src/lib/ev";

const cacheHeaders = { "Cache-Control": "no-store" };

export default async function handler(): Promise<Response> {
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
