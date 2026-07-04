import { useEffect, useMemo, useState } from "react";
import {
  Braces,
  ChevronRight,
  Clock3,
  Database,
  Eye,
  EyeOff,
  Flame,
  Medal,
  Moon,
  Radio,
  Sparkles,
  Sun,
  Target,
  TrendingUp,
  Trophy,
  UsersRound,
} from "lucide-react";
import {
  CATEGORY_PERCENTAGES,
  CATEGORY_POTS,
  DRAW_START_ISO,
  PARTICIPANTS,
  PICK_REVEAL_MS,
  POT_TOTAL_DOLLARS,
} from "./data/config";
import type { CompletedResult, LiveFixture, TeamLiveStat } from "./data/live";
import { teams, type Team } from "./data/teams";
import { fetchDrawLedger } from "./services/drawLedger";
import { fetchLiveState, initialLiveState, type LiveState } from "./services/liveState";
import { fetchMarketOdds, initialMarketOddsState, type MarketOdd, type MarketOddsState } from "./services/marketOdds";
import { buildKnockoutBoard, type BracketEntrant } from "./lib/bracket";
import { assignmentsByParticipant, type Assignment } from "./lib/draw";
import { computeTeamEvs, type TeamEv } from "./lib/ev";
import { loadStoredDraw, saveStoredDraw } from "./lib/persistence";
import { formatCentralTime, formatCountdown } from "./lib/time";

type Tab = "leaders" | "owners" | "playoffs" | "market";

const teamById = new Map(teams.map((team) => [team.id, team]));
const LIVE_REFRESH_MS = 60 * 1000;
const MARKET_REFRESH_MS = 5 * 60 * 1000;
const categoryLabels: Record<keyof typeof CATEGORY_POTS, string> = {
  champion: "World Cup winner",
  runnerUp: "Runner up",
  biggestUpset: "Biggest upset",
  fewestTotalGoals: "Fewest total goals",
  biggestBlowout: "Biggest blowout",
};

function Flag({ team, large = false }: { team: Team; large?: boolean }) {
  return (
    <img
      className={large ? "flag flagLarge" : "flag"}
      src={`https://flagcdn.com/w80/${team.flag}.png`}
      alt=""
      loading="lazy"
    />
  );
}

function TeamPill({ team, assignment }: { team: Team; assignment?: Assignment }) {
  return (
    <div className="teamPill">
      <Flag team={team} />
      <span>{team.name}</span>
      {assignment && <strong>{assignment.participant}</strong>}
    </div>
  );
}

function OwnerLine({ assignment }: { assignment?: Assignment }) {
  if (!assignment) return <span className="muted">Manager revealed at draw</span>;
  return (
    <span className="ownerLine">
      <UsersRound size={14} />
      {assignment.participant}
    </span>
  );
}

function formatRefreshCountdown(ms: number) {
  if (ms <= 0) return "refreshing now";
  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes <= 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes}m`;
  return `${minutes}m ${seconds}s`;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Updated just now";

  return `Updated ${date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(value >= 0.1 ? 1 : 2)}%`;
}

function formatMarketSource(updatedAt: string) {
  return `Market odds · ${formatUpdatedAt(updatedAt)}`;
}

function signedPercent(value: number) {
  const prefix = value > 0 ? "+" : "";
  return `${prefix}${(value * 100).toFixed(1)} pts`;
}

function scoreMargin(score: string) {
  const [winnerGoals, loserGoals] = score.split("-").map((part) => Number(part.trim()));
  if (!Number.isFinite(winnerGoals) || !Number.isFinite(loserGoals)) return 0;
  return Math.max(0, winnerGoals - loserGoals);
}

function isFinalRound(round?: string) {
  return /\bfinal\b/i.test(round || "");
}

function AppHeader({
  drawStarted,
  drawComplete,
  countdown,
  revealedCount,
  totalCount,
  drawSaved,
  theme,
  onToggleTheme,
}: {
  drawStarted: boolean;
  drawComplete: boolean;
  countdown: string;
  revealedCount: number;
  totalCount: number;
  drawSaved: boolean;
  theme: "light" | "dark";
  onToggleTheme: () => void;
}) {
  return (
    <header className="appHeader">
      <div className="brandBlock">
        <div className="logoMark">
          <Trophy size={24} />
        </div>
        <div>
          <p className="eyebrow">Bishop Sycamore</p>
          <h1>Bishop Sycamore 2026 WC Sweepstakes</h1>
        </div>
      </div>
      <div className="statusRail">
        <div className="statusItem timerStatus">
          <Clock3 size={18} />
          <span>{drawStarted ? (drawComplete ? "Draw complete" : "Draw live") : countdown}</span>
        </div>
        <div className="statusItem">
          <Radio size={18} />
          <span>
            {revealedCount}/{totalCount} teams
          </span>
        </div>
        <div className="statusItem">
          <Database size={18} />
          <span>{drawSaved ? "Ledger saved" : "Seed locked"}</span>
        </div>
        <button className="themeToggle" type="button" onClick={onToggleTheme} aria-label="Toggle color theme">
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          <span>{theme === "dark" ? "Light" : "Dark"}</span>
        </button>
      </div>
    </header>
  );
}

function DrawStage({
  drawStarted,
  drawComplete,
  countdown,
  drawLoading,
  currentPick,
  revealed,
}: {
  drawStarted: boolean;
  drawComplete: boolean;
  countdown: string;
  drawLoading: boolean;
  currentPick?: Assignment;
  revealed: Assignment[];
}) {
  return (
    <section className={drawComplete ? "drawBand drawComplete" : "drawBand"}>
      <div className="drawCopy">
        <p className="eyebrow">Scheduled draw</p>
        <h2>Bishop Sycamore 2026 WC Sweepstakes</h2>
        <p>
          {drawStarted
            ? drawComplete
              ? "The draw is saved. From here on out, it is all scoreboard watching."
              : "The packs are opening live, one country at a time."
            : `Packs open at ${formatCentralTime(DRAW_START_ISO)}. Until then, the board stays sealed.`}
        </p>
      </div>

      {!drawComplete && (
        <div className={`packStage ${drawStarted ? "isOpening" : ""}`}>
          {!drawStarted && (
            <div className="sealedPack">
              <Sparkles size={30} />
              <strong>{countdown}</strong>
              <span>until pack one</span>
            </div>
          )}

          {drawLoading && (
            <div className="sealedPack">
              <Sparkles size={30} />
              <strong>Loading</strong>
              <span>opening the server ledger</span>
            </div>
          )}

          {drawStarted && currentPick && (
            <div className="countryCard">
              <div className="pickNumber">Pick {currentPick.pickNumber}</div>
              <Flag team={currentPick.team} large />
              <h3>{currentPick.team.name}</h3>
              <div className="assignedTo">
                <span>goes to</span>
                <strong>{currentPick.participant}</strong>
              </div>
              <div className="tierBadge">Tier {currentPick.team.tier}</div>
            </div>
          )}
        </div>
      )}

      {!drawComplete && (
        <div className="revealStrip" aria-label="Recently revealed teams">
          {revealed.slice(-10).map((assignment) => (
            <div className="miniReveal" key={assignment.team.id}>
              <Flag team={assignment.team} />
              <span>{assignment.team.name}</span>
              <strong>{assignment.participant}</strong>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function LeadersTab({
  assignments,
  drawStarted,
  marketOdds,
  liveStats,
  completedResults,
  liveSource,
  liveUpdatedAt,
}: {
  assignments: Assignment[];
  drawStarted: boolean;
  marketOdds: MarketOdd[];
  liveStats: TeamLiveStat[];
  completedResults: CompletedResult[];
  liveSource: string;
  liveUpdatedAt: string;
}) {
  const assignmentByTeam = new Map(assignments.map((assignment) => [assignment.team.id, assignment]));
  const withTeams = liveStats
    .map((stat) => ({ stat, team: teamById.get(stat.teamId) }))
    .filter((entry): entry is { stat: (typeof liveStats)[number]; team: Team } => Boolean(entry.team));
  const marketBoard = [...marketOdds].sort((a, b) => b.probability - a.probability);
  const favorite = marketBoard[0];
  const favoriteTeam = favorite ? teamById.get(favorite.teamId) : undefined;
  const leastGoals = withTeams.filter(({ stat }) => stat.played > 0).sort((a, b) => a.stat.goalsFor - b.stat.goalsFor)[0];
  const runnerUpResults = completedResults
    .map((result) => {
      const winner = teamById.get(result.winnerId);
      const runnerUp = teamById.get(result.loserId);
      if (!winner || !runnerUp || !isFinalRound(result.round)) return undefined;
      return { result, winner, runnerUp };
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result));
  const biggestUpset = completedResults
    .map((result) => {
      const winner = teamById.get(result.winnerId);
      const loser = teamById.get(result.loserId);
      if (!winner || !loser || winner.fifaRank <= loser.fifaRank) return undefined;
      return { ...result, winner, loser, gap: winner.fifaRank - loser.fifaRank };
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result))
    .sort((a, b) => b.gap - a.gap)[0];
  const biggestUpsetRows = completedResults
    .map((result) => {
      const winner = teamById.get(result.winnerId);
      const loser = teamById.get(result.loserId);
      if (!winner || !loser || winner.fifaRank <= loser.fifaRank) return undefined;
      return { result, winner, loser, gap: winner.fifaRank - loser.fifaRank };
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result))
    .sort((a, b) => b.gap - a.gap);
  const biggestBlowoutRows = completedResults
    .map((result) => {
      const winner = teamById.get(result.winnerId);
      const loser = teamById.get(result.loserId);
      const margin = scoreMargin(result.score);
      if (!winner || !loser || margin <= 0) return undefined;
      return { result, winner, loser, margin };
    })
    .filter((result): result is NonNullable<typeof result> => Boolean(result))
    .sort((a, b) => b.margin - a.margin || a.winner.name.localeCompare(b.winner.name));
  const biggestBlowout = biggestBlowoutRows[0];
  const winnerRows = marketBoard.slice(0, 5).map((odd, index) => {
    const team = teamById.get(odd.teamId);
    if (!team) return undefined;
    return {
      key: odd.teamId,
      rank: index + 1,
      team,
      primary: formatPercent(odd.probability),
      detail: "win",
    };
  });
  const runnerUpRows = runnerUpResults
    .slice(0, 5)
    .map(({ result, winner, runnerUp }, index) => ({
      key: `${result.round || "final"}-${runnerUp.id}`,
      rank: index + 1,
      team: runnerUp,
      primary: "Final",
      detail: `${result.score} vs ${winner.name}`,
    }));
  const upsetRows = biggestUpsetRows.slice(0, 5).map((result, index) => ({
      key: `${result.winner.id}-${result.loser.id}`,
      rank: index + 1,
      team: result.winner,
      primary: `+${result.gap}`,
      detail: `beat ${result.loser.name}`,
    }));
  const fewestGoalRows = leastGoals
    ? [...withTeams]
        .filter(({ stat }) => stat.played > 0)
        .sort((a, b) => a.stat.goalsFor - b.stat.goalsFor || b.stat.played - a.stat.played || a.team.name.localeCompare(b.team.name))
        .slice(0, 5)
        .map(({ team, stat }, index) => ({
          key: team.id,
          rank: index + 1,
          team,
          primary: `${stat.goalsFor}`,
          detail: `${stat.played} MP`,
        }))
    : [];
  const blowoutRows = biggestBlowout
    ? biggestBlowoutRows.slice(0, 5).map((result, index) => ({
        key: `${result.winner.id}-${result.loser.id}`,
        rank: index + 1,
        team: result.winner,
        primary: `+${result.margin}`,
        detail: `${result.result.score} vs ${result.loser.name}`,
      }))
    : [];

  const rows = [
    {
      title: "World Cup winner",
      detail: favorite
        ? `$${CATEGORY_POTS.champion} to the champion. ${Math.round(favorite.probability * 1000) / 10}% market lead.`
        : "No sportsbook outright odds loaded yet.",
      icon: <Trophy size={20} />,
      team: favoriteTeam,
      source: favorite ? formatMarketSource(favorite.updatedAt) : "The Odds API",
      rankings: winnerRows,
    },
    {
      title: "Runner up",
      detail: runnerUpRows.length ? `$${CATEGORY_POTS.runnerUp} to the completed Final loser.` : "No completed Final yet.",
      icon: <Medal size={20} />,
      team: runnerUpRows[0]?.team,
      source: `${liveSource} · ${formatUpdatedAt(liveUpdatedAt)}`,
      rankings: runnerUpRows,
    },
    {
      title: "Biggest upset",
      detail: biggestUpset
        ? `${biggestUpset.score}, FIFA rank gap ${biggestUpset.gap}`
        : "No completed ranking upset yet.",
      icon: <Target size={20} />,
      team: biggestUpset?.winner,
      source: `${liveSource} · ${formatUpdatedAt(liveUpdatedAt)}`,
      rankings: upsetRows,
    },
    {
      title: "Fewest total goals",
      detail: leastGoals ? `$${CATEGORY_POTS.fewestTotalGoals}; ${leastGoals.stat.goalsFor} goals through ${leastGoals.stat.played}` : "No completed team totals yet.",
      icon: <Database size={20} />,
      team: leastGoals?.team,
      source: `${liveSource} · ${formatUpdatedAt(liveUpdatedAt)}`,
      rankings: fewestGoalRows,
    },
    {
      title: "Biggest blowout",
      detail: biggestBlowout
        ? `${biggestBlowout.result.score}, ${biggestBlowout.margin}-goal margin over ${biggestBlowout.loser.name}`
        : "No completed winning margins yet.",
      icon: <Flame size={20} />,
      team: biggestBlowout?.winner,
      source: `${liveSource} · ${formatUpdatedAt(liveUpdatedAt)}`,
      rankings: blowoutRows,
    },
  ].map((board) => ({
    ...board,
    rankings: board.rankings.filter((row): row is NonNullable<typeof row> => Boolean(row)),
  }));

  return (
    <>
      <div className="leaderGrid">
        {rows.map((row) => (
          <article className="leaderCard" key={row.title}>
            <div className="leaderIcon">{row.icon}</div>
            <div className="leaderBody">
              <span className="leaderLabel">{row.title}</span>
              {row.team ? (
                <div className="leaderTeam">
                  <Flag team={row.team} />
                  <strong>{row.team.name}</strong>
                </div>
              ) : (
                <div className="noLeader">No leader yet</div>
              )}
              <p>{row.detail}</p>
              {row.team ? (
                drawStarted ? (
                  <OwnerLine assignment={assignmentByTeam.get(row.team.id)} />
                ) : (
                  <span className="muted">Managers unlock at draw</span>
                )
              ) : (
                <span className="muted">Blank until data lands</span>
              )}
              <div className="cardRankings" aria-label={`${row.title} top five`}>
                <span className="cardRankingsSource">{row.source}</span>
                {row.rankings.map((ranking) => (
                  <div className="cardRankingRow" key={ranking.key}>
                    <span>{ranking.rank}</span>
                    <div>
                      <Flag team={ranking.team} />
                      <strong>{ranking.team.name}</strong>
                      {drawStarted && assignmentByTeam.get(ranking.team.id) && <small>{assignmentByTeam.get(ranking.team.id)?.participant}</small>}
                    </div>
                    <b>{ranking.primary}</b>
                    <em>{ranking.detail}</em>
                  </div>
                ))}
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

function OwnersTab({ assignments }: { assignments: Assignment[] }) {
  const grouped = assignmentsByParticipant(assignments);
  const drawLocked = assignments.length > 0;

  return (
    <div className="ownersGrid">
      {PARTICIPANTS.map((participant) => {
        const ownerAssignments = grouped[participant] || [];
        return (
          <article className="ownerCard" key={participant}>
            <div className="ownerHeader">
              <div>
                <p className="eyebrow">Manager</p>
                <h3>{participant}</h3>
              </div>
              <div className="evBubble">{ownerAssignments.length || "-"} teams</div>
            </div>
            <div className="ownerTeams">
              {drawLocked ? (
                ownerAssignments.map((assignment) => <TeamPill key={assignment.team.id} team={assignment.team} />)
              ) : (
                <div className="lockedRoster">
                  <span>Roster locked until draw</span>
                  <div>
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function MarketTab({
  assignments,
  drawStarted,
  evs,
  marketOdds,
  oddsWarning,
  oddsRefreshIn,
}: {
  assignments: Assignment[];
  drawStarted: boolean;
  evs: TeamEv[];
  marketOdds: MarketOdd[];
  oddsWarning?: string;
  oddsRefreshIn: string;
}) {
  const assignmentByTeam = new Map(assignments.map((assignment) => [assignment.team.id, assignment]));
  const marketBoard = [...marketOdds]
    .map((odd) => ({ odd, team: teamById.get(odd.teamId) }))
    .filter((entry): entry is { odd: MarketOdd; team: Team } => Boolean(entry.team))
    .sort((a, b) => b.odd.probability - a.odd.probability);
  const marketByTeam = new Map(marketBoard.map(({ odd }) => [odd.teamId, odd]));
  const modelChampionByTeam = new Map(evs.map((ev) => [ev.teamId, ev.probabilities.champion]));
  const favorite = marketBoard[0];
  const topFiveMass = marketBoard.slice(0, 5).reduce((sum, entry) => sum + entry.odd.probability, 0);
  const ownerRows = PARTICIPANTS.map((participant) => {
    const owned = assignments.filter((assignment) => assignment.participant === participant);
    const priced = owned
      .map((assignment) => ({ assignment, odd: marketByTeam.get(assignment.team.id) }))
      .filter((entry): entry is { assignment: Assignment; odd: MarketOdd } => Boolean(entry.odd));
    const probability = priced.reduce((sum, entry) => sum + entry.odd.probability, 0);
    const championEv = probability * CATEGORY_POTS.champion;
    const best = [...priced].sort((a, b) => b.odd.probability - a.odd.probability)[0];

    return { participant, owned, priced, probability, championEv, best };
  }).sort((a, b) => b.probability - a.probability);
  const boardRows = marketBoard.slice(0, 14).map(({ odd, team }, index) => {
    const model = modelChampionByTeam.get(team.id) || 0;
    return {
      key: team.id,
      rank: index + 1,
      team,
      odd,
      owner: assignmentByTeam.get(team.id)?.participant,
      model,
      delta: odd.probability - model,
      championEv: odd.probability * CATEGORY_POTS.champion,
    };
  });
  const marketRisers = [...marketBoard]
    .map(({ odd, team }) => ({
      team,
      odd,
      model: modelChampionByTeam.get(team.id) || 0,
      delta: odd.probability - (modelChampionByTeam.get(team.id) || 0),
    }))
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);
  const marketSkeptics = [...marketBoard]
    .map(({ odd, team }) => ({
      team,
      odd,
      model: modelChampionByTeam.get(team.id) || 0,
      delta: odd.probability - (modelChampionByTeam.get(team.id) || 0),
    }))
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 5);

  return (
    <div className="marketShell">
      <section className="marketHero">
        <div>
          <p className="eyebrow">Odds lab</p>
          <h3>Market pulse</h3>
          <p>
            The sportsbook board is converted into no-vig title probabilities, then mapped onto managers and the $80
            champion pot.
          </p>
        </div>
        <div className="marketHeroStats">
          <div>
            <span>Favorite</span>
            <b>{favorite ? favorite.team.name : "No market"}</b>
            <small>{favorite ? `${formatPercent(favorite.odd.probability)} title chance` : "Waiting on odds"}</small>
          </div>
          <div>
            <span>Top 5 mass</span>
            <b>{formatPercent(topFiveMass)}</b>
            <small>{marketBoard.length} priced teams</small>
          </div>
          <div>
            <span>Refresh</span>
            <b>{oddsRefreshIn}</b>
            <small>{favorite ? formatMarketSource(favorite.odd.updatedAt) : oddsWarning || "Waiting on The Odds API"}</small>
          </div>
        </div>
        {oddsWarning && <div className="feedNotice">{oddsWarning}</div>}
      </section>

      <section className="marketGrid">
        <article className="marketCard ownerMarketCard">
          <div className="marketCardHeader">
            <div className="marketCardTitle">
              <p className="eyebrow">Managers</p>
              <h3>Title Equity</h3>
              <p>Tracks each manager's combined no-vig chance to own the eventual champion.</p>
            </div>
            <span>${CATEGORY_POTS.champion} pot</span>
          </div>
          {drawStarted ? (
            <div className="ownerMarketRows">
              {ownerRows.map((owner, index) => (
                <div className="ownerMarketRow" key={owner.participant}>
                  <span>{index + 1}</span>
                  <div>
                    <strong>{owner.participant}</strong>
                    <small>
                      {owner.best
                        ? `${owner.best.assignment.team.name} leads at ${formatPercent(owner.best.odd.probability)}`
                        : `${owner.owned.length || "-"} teams, none priced yet`}
                    </small>
                  </div>
                  <b>{formatPercent(owner.probability)}</b>
                  <em>${owner.championEv.toFixed(2)}</em>
                </div>
              ))}
            </div>
          ) : (
            <div className="marketLocked">
              <strong>Manager equity unlocks after the draw.</strong>
              <span>The odds feed is live, but rosters stay sealed until packs open.</span>
            </div>
          )}
        </article>

        <article className="marketCard">
          <div className="marketCardHeader">
            <div className="marketCardTitle">
              <p className="eyebrow">Board</p>
              <h3>Top Title Prices</h3>
              <p>Shows the most likely champions and their current value against the champion pot.</p>
            </div>
            <span>No-vig probabilities</span>
          </div>
          <div className="marketRows">
            {boardRows.map((row) => (
              <div className="marketRow" key={row.key}>
                <span>{row.rank}</span>
                <div className="marketTeam">
                  <Flag team={row.team} />
                  <strong>{row.team.name}</strong>
                  {drawStarted && row.owner && <small>{row.owner}</small>}
                </div>
                <b>{formatPercent(row.odd.probability)}</b>
                <em>${row.championEv.toFixed(2)}</em>
                <i>{signedPercent(row.delta)} vs model</i>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="marketSignalGrid">
        <article className="marketCard">
          <div className="marketCardHeader">
            <div className="marketCardTitle">
              <p className="eyebrow">Signal</p>
              <h3>Market Above Model</h3>
              <p>Highlights teams the sportsbook market likes more than the static pool model.</p>
            </div>
            <span>Odds minus static EV model</span>
          </div>
          <div className="signalRows">
            {marketRisers.map(({ team, odd, delta }) => (
              <div className="signalRow" key={team.id}>
                <div>
                  <Flag team={team} />
                  <strong>{team.name}</strong>
                </div>
                <b>{signedPercent(delta)}</b>
                <span>{formatPercent(odd.probability)}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="marketCard">
          <div className="marketCardHeader">
            <div className="marketCardTitle">
              <p className="eyebrow">Signal</p>
              <h3>Model Above Market</h3>
              <p>Highlights teams the static pool model rates higher than the current market.</p>
            </div>
            <span>Static model is more optimistic</span>
          </div>
          <div className="signalRows">
            {marketSkeptics.map(({ team, odd, delta }) => (
              <div className="signalRow" key={team.id}>
                <div>
                  <Flag team={team} />
                  <strong>{team.name}</strong>
                </div>
                <b>{signedPercent(delta)}</b>
                <span>{formatPercent(odd.probability)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}

function BracketTeam({
  entrant,
  assignment,
  drawStarted,
}: {
  entrant: BracketEntrant;
  assignment?: Assignment;
  drawStarted: boolean;
}) {
  const team = entrant.teamId ? teamById.get(entrant.teamId) : undefined;

  return (
    <div className={entrant.source === "api" ? "matchTeam apiTeam" : "matchTeam"}>
      <span className="matchSeed">{entrant.label}</span>
      {team ? (
        <>
          <TeamPill team={team} assignment={drawStarted ? assignment : undefined} />
          <div className="bracketDetail">
            <span>{entrant.detail}</span>
            {entrant.standing && (
              <b>
                {entrant.standing.won}-{entrant.standing.drawn}-{entrant.standing.lost}
              </b>
            )}
          </div>
          {drawStarted && <OwnerLine assignment={assignment} />}
        </>
      ) : (
        <span className="muted">{entrant.detail}</span>
      )}
    </div>
  );
}

function PlayoffsTab({
  assignments,
  drawStarted,
  fixtures,
  liveSource,
  liveUpdatedAt,
}: {
  assignments: Assignment[];
  drawStarted: boolean;
  fixtures: LiveFixture[];
  liveSource: string;
  liveUpdatedAt: string;
}) {
  const assignmentByTeam = new Map(assignments.map((assignment) => [assignment.team.id, assignment]));
  const board = buildKnockoutBoard(teams, fixtures);
  const hasApiBracket = board.some((match) => match.source === "api");

  return (
    <div className="bracketShell">
      <div className="bracketIntro">
        <div>
          <p className="eyebrow">Knockout board</p>
          <h3>{hasApiBracket ? "Knockout fixtures" : "Playoffs not started yet"}</h3>
        </div>
        <span>
          {liveSource} · {formatUpdatedAt(liveUpdatedAt)}
        </span>
      </div>
      {!hasApiBracket && (
        <div className="bracketEmpty">
          <strong>Playoffs not started yet</strong>
          <span>Knockout fixtures will appear here automatically once the API publishes matchups.</span>
        </div>
      )}
      {hasApiBracket && (
        <div className="bracketGrid">
          {board.map((match) => (
            <article className="matchCard" key={match.matchNumber}>
              <div className="matchMeta">
                <span className="matchRound">{match.round}</span>
                {match.status && <span>{match.status}</span>}
              </div>
              <strong>{match.slot}</strong>
              {match.score && <div className="matchScore">{match.score}</div>}
              <div className="matchTeams">
                {match.entrants.map((entrant, index) => (
                  <BracketTeam
                    assignment={entrant.teamId ? assignmentByTeam.get(entrant.teamId) : undefined}
                    drawStarted={drawStarted}
                    entrant={entrant}
                    key={`${match.matchNumber}-${entrant.teamId || entrant.label}-${index}`}
                  />
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function NerdStats({
  assignments,
  drawStarted,
  evs,
  marketOdds,
  liveStats,
  completedResults,
  liveSource,
  liveUpdatedAt,
  oddsRefreshIn,
  liveRefreshIn,
}: {
  assignments: Assignment[];
  drawStarted: boolean;
  evs: TeamEv[];
  marketOdds: MarketOdd[];
  liveStats: TeamLiveStat[];
  completedResults: CompletedResult[];
  liveSource: string;
  liveUpdatedAt: string;
  oddsRefreshIn: string;
  liveRefreshIn: string;
}) {
  const evByTeam = new Map(evs.map((ev) => [ev.teamId, ev]));
  const teamsWithEv = teams
    .map((team) => ({ team, ev: evByTeam.get(team.id)! }))
    .filter((entry) => Boolean(entry.ev));
  const topTeams = [...teamsWithEv].sort((a, b) => b.ev.total - a.ev.total).slice(0, 8);
  const targetEv = POT_TOTAL_DOLLARS / PARTICIPANTS.length;
  const categoryKeys = Object.keys(CATEGORY_POTS) as Array<keyof typeof CATEGORY_POTS>;
  const probabilityChecks = categoryKeys.map((category) => ({
    category,
    totalProbability: evs.reduce((sum, ev) => sum + ev.probabilities[category], 0),
    totalDollars: evs.reduce((sum, ev) => sum + ev.categoryEv[category], 0),
  }));
  const marketLeaders = [...marketOdds]
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 3)
    .map((odd) => {
      const team = teamById.get(odd.teamId);
      return team ? `${team.name} ${formatPercent(odd.probability)}` : undefined;
    })
    .filter((leader): leader is string => Boolean(leader));
  const finalRunnerUps = completedResults
    .filter((result) => isFinalRound(result.round))
    .slice(0, 3)
    .map((result) => {
      const runnerUp = teamById.get(result.loserId);
      const winner = teamById.get(result.winnerId);
      return runnerUp && winner ? `${runnerUp.name} lost ${result.score} to ${winner.name}` : undefined;
    })
    .filter((leader): leader is string => Boolean(leader));
  const observedUpsets = completedResults
    .map((result) => {
      const winner = teamById.get(result.winnerId);
      const loser = teamById.get(result.loserId);
      if (!winner || !loser || winner.fifaRank <= loser.fifaRank) return undefined;
      return { winner, loser, gap: winner.fifaRank - loser.fifaRank };
    })
    .filter((leader): leader is NonNullable<typeof leader> => Boolean(leader))
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 3)
    .map(({ winner, loser, gap }) => `${winner.name} +${gap} over ${loser.name}`);
  const observedLowGoals = liveStats
    .map((stat) => ({ stat, team: teamById.get(stat.teamId) }))
    .filter((entry): entry is { stat: TeamLiveStat; team: Team } => Boolean(entry.team) && entry.stat.played > 0)
    .sort((a, b) => a.stat.goalsFor - b.stat.goalsFor || b.stat.played - a.stat.played || a.team.name.localeCompare(b.team.name))
    .slice(0, 3)
    .map(({ team, stat }) => `${team.name} ${stat.goalsFor} in ${stat.played}`);
  const observedBlowouts = completedResults
    .map((result) => {
      const winner = teamById.get(result.winnerId);
      const loser = teamById.get(result.loserId);
      const margin = scoreMargin(result.score);
      if (!winner || !loser || margin <= 0) return undefined;
      return { winner, loser, margin, score: result.score };
    })
    .filter((leader): leader is NonNullable<typeof leader> => Boolean(leader))
    .sort((a, b) => b.margin - a.margin || a.winner.name.localeCompare(b.winner.name))
    .slice(0, 3)
    .map(({ winner, loser, margin, score }) => `${winner.name} +${margin}, ${score} vs ${loser.name}`);
  const observedLeaders = [
    { label: "Winner", source: "market odds", leaders: marketLeaders },
    { label: "Runner up", source: "completed Final", leaders: finalRunnerUps },
    { label: "Upset", source: "completed results", leaders: observedUpsets },
    { label: "Fewest goals", source: "team totals", leaders: observedLowGoals },
    { label: "Blowout", source: "winning margins", leaders: observedBlowouts },
  ];
  const dataRules = [
    { label: "Winner", formula: "normalized market odds from the outright futures board" },
    { label: "Runner up", formula: "completed Final loser only" },
    { label: "Upset", formula: "completed lower-ranked winner by FIFA ranking gap" },
    { label: "Fewest goals", formula: "goals for by teams with completed matches" },
    { label: "Blowout", formula: "completed winning margin" },
  ];
  const ownerTotals = PARTICIPANTS.map((participant) => {
    const owned = assignments.filter((assignment) => assignment.participant === participant);
    return {
      participant,
      teams: owned.length,
      tierOne: owned.filter((assignment) => assignment.team.tier === 1).length,
      total: owned.reduce((sum, assignment) => sum + assignment.ev.total, 0),
    };
  }).sort((a, b) => b.total - a.total);
  const ownerValues = ownerTotals.map((owner) => owner.total);
  const ownerAverage = ownerValues.reduce((sum, value) => sum + value, 0) / Math.max(1, ownerValues.length);
  const ownerStdDev = Math.sqrt(
    ownerValues.reduce((sum, value) => sum + (value - ownerAverage) ** 2, 0) / Math.max(1, ownerValues.length),
  );
  const ownerSpread = ownerValues.length ? Math.max(...ownerValues) - Math.min(...ownerValues) : 0;

  return (
    <section className="nerdPanel">
      <div className="nerdCopy">
        <p className="eyebrow">Nerd stats</p>
        <h3>Data lab</h3>
        <p>
          Winner is market-driven. Runner up, upset, total goals, and blowout use only observed tournament data; empty
          categories stay empty until WorldCup26 publishes completed-match evidence.
        </p>
        <div className="nerdFormula">
          <strong>${POT_TOTAL_DOLLARS} pot</strong>
          <span>Draw EV still balances hidden rosters before reveal</span>
          <span>Target manager EV = ${targetEv.toFixed(2)}</span>
        </div>
        <div className="metricGrid">
          <div>
            <span>Total draw EV</span>
            <b>${evs.reduce((sum, ev) => sum + ev.total, 0).toFixed(2)}</b>
          </div>
          <div>
            <span>Average team EV</span>
            <b>${(POT_TOTAL_DOLLARS / teams.length).toFixed(2)}</b>
          </div>
          <div>
            <span>Roster sizes</span>
            <b>8x5, 2x4</b>
          </div>
        </div>
      </div>
      <div className="nerdColumns">
        <div className="miniTable">
          <strong>Prize weights</strong>
          {categoryKeys.map((category) => (
            <div className="miniRow" key={category}>
              <span>{categoryLabels[category]}</span>
              <b>
                ${CATEGORY_POTS[category]} / {Math.round(CATEGORY_PERCENTAGES[category] * 100)}%
              </b>
            </div>
          ))}
        </div>
        <div className="miniTable">
          <strong>Draw EV checks</strong>
          {probabilityChecks.map((check) => (
            <div className="miniRow" key={check.category}>
              <span>
                {categoryLabels[check.category]}
                <small>{formatPercent(check.totalProbability)} probability mass</small>
              </span>
              <b>${check.totalDollars.toFixed(0)}</b>
            </div>
          ))}
        </div>
        <div className="miniTable">
          <strong>Data refresh</strong>
          <div className="refreshStats nerdRefreshStats">
            <span>
              <Clock3 size={15} />
              Odds in {oddsRefreshIn}
            </span>
            <span>
              <Clock3 size={15} />
              Live in {liveRefreshIn}
            </span>
          </div>
          <small>Server-side Redis caching protects the free API limits even when browsers check more often.</small>
        </div>
        <div className="miniTable">
          <strong>Data rules</strong>
          {dataRules.map((recipe) => (
            <div className="miniRow formulaRow" key={recipe.label}>
              <span>{recipe.label}</span>
              <code>{recipe.formula}</code>
            </div>
          ))}
        </div>
        <div className="miniTable">
          <strong>Current data leaders</strong>
          {observedLeaders.map(({ label, source, leaders }) => (
            <div className="miniRow" key={label}>
              <span>
                {label}
                <small>{leaders.length ? leaders.join(" / ") : `blank until ${source}`}</small>
              </span>
            </div>
          ))}
          <small>{liveSource} · {formatUpdatedAt(liveUpdatedAt)}</small>
        </div>
        <div className="miniTable wideMiniTable">
          <strong>Draw-balance EV, owner-free</strong>
          {topTeams.map(({ team, ev }) => (
            <div className="miniRow evBreakdownRow" key={team.id}>
              <span>
                {team.name}
                <small>
                  W ${ev.categoryEv.champion.toFixed(1)} · RU ${ev.categoryEv.runnerUp.toFixed(1)} · Upset ${ev.categoryEv.biggestUpset.toFixed(1)} · Low goals ${ev.categoryEv.fewestTotalGoals.toFixed(1)} · Blowout ${ev.categoryEv.biggestBlowout.toFixed(1)}
                </small>
              </span>
              <b>${ev.total.toFixed(1)}</b>
            </div>
          ))}
        </div>
        {drawStarted ? (
          <div className="miniTable wideMiniTable">
            <strong>Manager EV balance</strong>
            <div className="fairnessSummary">
              <span>Spread ${ownerSpread.toFixed(2)}</span>
              <span>Std dev ${ownerStdDev.toFixed(2)}</span>
              <span>Target ${targetEv.toFixed(2)}</span>
            </div>
            {ownerTotals.map((owner) => (
              <div className="miniRow" key={owner.participant}>
                <span>
                  {owner.participant}
                  <small>
                    {owner.teams || "-"} teams, {owner.tierOne} T1, delta ${(owner.total - targetEv).toFixed(2)}
                  </small>
                </span>
                <b>${owner.total.toFixed(1)}</b>
              </div>
            ))}
          </div>
        ) : (
          <div className="miniTable wideMiniTable lockMath">
            <strong>Manager EV balance</strong>
            <span>Hidden until the draw starts.</span>
            <small>
              The assignment ledger already exists deterministically in code, but this panel will not reveal manager/team
              EV totals before packs open.
            </small>
          </div>
        )}
      </div>
    </section>
  );
}

export function App() {
  const [now, setNow] = useState(() => Date.now());
  const [activeTab, setActiveTab] = useState<Tab>("leaders");
  const [nerdOpen, setNerdOpen] = useState(false);
  const [marketOddsState, setMarketOddsState] = useState<MarketOddsState>(initialMarketOddsState);
  const [liveState, setLiveState] = useState<LiveState>(initialLiveState);
  const [marketRefreshAt, setMarketRefreshAt] = useState(() => Date.now() + MARKET_REFRESH_MS);
  const [liveRefreshAt, setLiveRefreshAt] = useState(() => Date.now() + LIVE_REFRESH_MS);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof window === "undefined" ? "light" : window.localStorage.getItem("wc-theme") === "dark" ? "dark" : "light",
  );
  const evs = useMemo(() => computeTeamEvs(teams), []);
  const [storedAssignments] = useState<Assignment[] | null>(() => loadStoredDraw(teams, evs));
  const [lockedAssignments, setLockedAssignments] = useState<Assignment[] | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      fetchMarketOdds()
        .then((state) => {
          if (mounted) setMarketOddsState(state);
        })
        .finally(() => {
          if (mounted) setMarketRefreshAt(Date.now() + MARKET_REFRESH_MS);
        });
    };

    refresh();
    const timer = window.setInterval(refresh, MARKET_REFRESH_MS);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      fetchLiveState()
        .then((state) => {
          if (mounted) setLiveState(state);
        })
        .finally(() => {
          if (mounted) setLiveRefreshAt(Date.now() + LIVE_REFRESH_MS);
        });
    };

    refresh();
    const timer = window.setInterval(refresh, LIVE_REFRESH_MS);
    return () => {
      mounted = false;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("wc-theme", theme);
  }, [theme]);

  const assignments = lockedAssignments || [];
  const drawStart = new Date(DRAW_START_ISO).getTime();
  const elapsed = now - drawStart;
  const drawStarted = elapsed >= 0;

  useEffect(() => {
    if (!drawStarted) return;
    let cancelled = false;

    fetchDrawLedger(teams, evs).then((serverAssignments) => {
      if (cancelled) return;

      if (serverAssignments?.length) {
        saveStoredDraw(serverAssignments);
        setLockedAssignments(serverAssignments);
        return;
      }

      if (storedAssignments?.length) {
        setLockedAssignments(storedAssignments);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [drawStarted, evs, storedAssignments]);

  const drawLoading = drawStarted && assignments.length === 0;
  const currentIndex = drawStarted && assignments.length ? Math.min(assignments.length - 1, Math.floor(elapsed / PICK_REVEAL_MS)) : -1;
  const drawComplete = drawStarted && assignments.length > 0 && elapsed >= assignments.length * PICK_REVEAL_MS;
  const revealed = drawStarted && assignments.length ? assignments.slice(0, drawComplete ? assignments.length : currentIndex + 1) : [];
  const currentPick = drawComplete ? assignments[assignments.length - 1] : assignments[currentIndex];
  const countdown = formatCountdown(drawStart - now);
  const oddsRefreshIn = formatRefreshCountdown(Math.min(MARKET_REFRESH_MS, marketRefreshAt - now));
  const liveRefreshIn = formatRefreshCountdown(Math.min(LIVE_REFRESH_MS, liveRefreshAt - now));
  const marketOdds = marketOddsState.odds;

  return (
    <main>
      <AppHeader
        drawStarted={drawStarted}
        drawComplete={drawComplete}
        countdown={countdown}
        revealedCount={revealed.length}
        totalCount={teams.length}
        drawSaved={Boolean(lockedAssignments)}
        theme={theme}
        onToggleTheme={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
      />

      <DrawStage
        drawStarted={drawStarted}
        drawComplete={drawComplete}
        countdown={countdown}
        drawLoading={drawLoading}
        currentPick={currentPick}
        revealed={revealed}
      />

      <section className="tabsBand">
        <div className="tabBar" role="tablist" aria-label="World Cup challenge sections">
          {[
            { id: "leaders", label: "Current leaders", icon: Flame },
            { id: "owners", label: "Managers", icon: UsersRound },
            { id: "market", label: "Market", icon: TrendingUp },
            { id: "playoffs", label: "Playoffs", icon: Braces },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                className={activeTab === tab.id ? "tabButton active" : "tabButton"}
                key={tab.id}
                onClick={() => setActiveTab(tab.id as Tab)}
                type="button"
              >
                <Icon size={18} />
                <span>{tab.label}</span>
              </button>
            );
          })}
          <button className="nerdToggle" type="button" onClick={() => setNerdOpen((open) => !open)}>
            {nerdOpen ? <EyeOff size={18} /> : <Eye size={18} />}
            <span>Nerd stats</span>
          </button>
        </div>

        {activeTab === "leaders" && (
          <LeadersTab
            assignments={assignments}
            drawStarted={drawStarted}
            marketOdds={marketOdds}
            liveStats={liveState.stats}
            completedResults={liveState.results}
            liveSource={liveState.source}
            liveUpdatedAt={liveState.updatedAt}
          />
        )}
        {activeTab === "owners" && <OwnersTab assignments={drawStarted ? assignments : revealed} />}
        {activeTab === "market" && (
          <MarketTab
            assignments={assignments}
            drawStarted={drawStarted}
            evs={evs}
            marketOdds={marketOdds}
            oddsWarning={marketOddsState.warning}
            oddsRefreshIn={oddsRefreshIn}
          />
        )}
        {activeTab === "playoffs" && (
          <PlayoffsTab
            assignments={assignments}
            drawStarted={drawStarted}
            fixtures={liveState.fixtures}
            liveSource={liveState.source}
            liveUpdatedAt={liveState.updatedAt}
          />
        )}
      </section>

      {nerdOpen && (
        <NerdStats
          assignments={drawStarted ? assignments : []}
          drawStarted={drawStarted}
          evs={evs}
          marketOdds={marketOdds}
          liveStats={liveState.stats}
          completedResults={liveState.results}
          liveSource={liveState.source}
          liveUpdatedAt={liveState.updatedAt}
          oddsRefreshIn={oddsRefreshIn}
          liveRefreshIn={liveRefreshIn}
        />
      )}

      <footer>
        <span>Static-host friendly</span>
        <ChevronRight size={14} />
        <span>Draw ledger is sealed server-side, then saved in browser storage after reveal</span>
      </footer>
    </main>
  );
}
