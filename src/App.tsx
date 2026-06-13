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
import { bracketMatches } from "./data/bracket";
import type { CompletedResult, TeamLiveStat } from "./data/live";
import { teams, type Team } from "./data/teams";
import { fetchDrawLedger } from "./services/drawLedger";
import { fallbackLiveState, fetchLiveState, type LiveState } from "./services/liveState";
import { fetchMarketOdds, fallbackMarketOdds, type MarketOdd } from "./services/marketOdds";
import { assignmentsByParticipant, type Assignment } from "./lib/draw";
import { computeTeamEvs, type TeamEv } from "./lib/ev";
import { loadStoredDraw, saveStoredDraw } from "./lib/persistence";
import { formatCentralTime, formatCountdown } from "./lib/time";

type Tab = "leaders" | "owners" | "playoffs";

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

function scoreMargin(score: string) {
  const [winnerGoals, loserGoals] = score.split("-").map((part) => Number(part.trim()));
  if (!Number.isFinite(winnerGoals) || !Number.isFinite(loserGoals)) return 0;
  return Math.max(0, winnerGoals - loserGoals);
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

      <div className="revealStrip" aria-label="Recently revealed teams">
        {revealed.slice(-10).map((assignment) => (
          <div className="miniReveal" key={assignment.team.id}>
            <Flag team={assignment.team} />
            <span>{assignment.team.name}</span>
            <strong>{assignment.participant}</strong>
          </div>
        ))}
      </div>
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
  evs,
}: {
  assignments: Assignment[];
  drawStarted: boolean;
  marketOdds: MarketOdd[];
  liveStats: TeamLiveStat[];
  completedResults: CompletedResult[];
  liveSource: string;
  liveUpdatedAt: string;
  evs: TeamEv[];
}) {
  const assignmentByTeam = new Map(assignments.map((assignment) => [assignment.team.id, assignment]));
  const evByTeam = new Map(evs.map((ev) => [ev.teamId, ev]));
  const teamsWithEv = teams
    .map((team) => ({ team, ev: evByTeam.get(team.id) }))
    .filter((entry): entry is { team: Team; ev: TeamEv } => Boolean(entry.ev));
  const withTeams = liveStats
    .map((stat) => ({ stat, team: teamById.get(stat.teamId) }))
    .filter((entry): entry is { stat: (typeof liveStats)[number]; team: Team } => Boolean(entry.team));
  const marketBoard = [...marketOdds].sort((a, b) => b.probability - a.probability);
  const favorite = marketBoard[0] || fallbackMarketOdds[0];
  const favoriteTeam = teamById.get(favorite.teamId)!;
  const runnerUpProjection = [...teamsWithEv].sort((a, b) => b.ev.probabilities.runnerUp - a.ev.probabilities.runnerUp)[0];
  const leastGoals = withTeams.filter(({ stat }) => stat.played > 0).sort((a, b) => a.stat.goalsFor - b.stat.goalsFor)[0];
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
  const runnerUpRows = [...teamsWithEv]
    .sort((a, b) => b.ev.probabilities.runnerUp - a.ev.probabilities.runnerUp)
    .slice(0, 5)
    .map(({ team, ev }, index) => ({
      key: team.id,
      rank: index + 1,
      team,
      primary: formatPercent(ev.probabilities.runnerUp),
      detail: "runner up",
    }));
  const upsetRows = [
    ...biggestUpsetRows.slice(0, 5).map((result, index) => ({
      key: `${result.winner.id}-${result.loser.id}`,
      rank: index + 1,
      team: result.winner,
      primary: `+${result.gap}`,
      detail: `beat ${result.loser.name}`,
    })),
    ...[...teamsWithEv]
      .filter(({ team }) => !biggestUpsetRows.some((row) => row.winner.id === team.id))
      .sort((a, b) => b.ev.probabilities.biggestUpset - a.ev.probabilities.biggestUpset)
      .slice(0, 5)
      .map(({ team, ev }, index) => ({
        key: `model-${team.id}`,
        rank: biggestUpsetRows.length + index + 1,
        team,
        primary: formatPercent(ev.probabilities.biggestUpset),
        detail: `rank ${team.fifaRank}`,
      })),
  ].slice(0, 5);
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
    : [...teamsWithEv]
        .sort((a, b) => b.ev.probabilities.fewestTotalGoals - a.ev.probabilities.fewestTotalGoals)
        .slice(0, 5)
        .map(({ team, ev }, index) => ({
          key: team.id,
          rank: index + 1,
          team,
          primary: formatPercent(ev.probabilities.fewestTotalGoals),
          detail: "low goals",
        }));
  const blowoutRows = biggestBlowout
    ? biggestBlowoutRows.slice(0, 5).map((result, index) => ({
        key: `${result.winner.id}-${result.loser.id}`,
        rank: index + 1,
        team: result.winner,
        primary: `+${result.margin}`,
        detail: `${result.result.score} vs ${result.loser.name}`,
      }))
    : [...teamsWithEv]
      .sort((a, b) => b.team.attack + b.team.power - (a.team.attack + a.team.power))
      .slice(0, 5)
      .map(({ team }, index) => ({
        key: team.id,
        rank: index + 1,
        team,
        primary: `${team.attack}`,
        detail: "attack",
      }));

  const rows = [
    {
      title: "World Cup winner",
      detail: `$${CATEGORY_POTS.champion} to the champion. ${Math.round(favorite.probability * 1000) / 10}% market lead.`,
      icon: <Trophy size={20} />,
      team: favoriteTeam,
      source: formatMarketSource(favorite.updatedAt),
      rankings: winnerRows,
    },
    {
      title: "Runner up",
      detail: `$${CATEGORY_POTS.runnerUp} to second place. Projection follows the pool model.`,
      icon: <Medal size={20} />,
      team: runnerUpProjection?.team,
      source: "Pre-tournament estimate",
      rankings: runnerUpRows,
    },
    {
      title: "Biggest upset",
      detail: biggestUpset
        ? `${biggestUpset.score}, FIFA rank gap ${biggestUpset.gap}`
        : `$${CATEGORY_POTS.biggestUpset}; projected leaders until an upset lands`,
      icon: <Target size={20} />,
      team: biggestUpset?.winner || upsetRows[0]?.team,
      source: biggestUpset ? `${liveSource} · ${formatUpdatedAt(liveUpdatedAt)}` : "Pre-tournament estimate",
      rankings: upsetRows,
    },
    {
      title: "Fewest total goals",
      detail: leastGoals ? `$${CATEGORY_POTS.fewestTotalGoals}; ${leastGoals.stat.goalsFor} goals through ${leastGoals.stat.played}` : "Projected low-scoring leaders until matches post",
      icon: <Database size={20} />,
      team: leastGoals?.team || fewestGoalRows[0]?.team,
      source: leastGoals ? `${liveSource} · ${formatUpdatedAt(liveUpdatedAt)}` : "Pre-tournament estimate",
      rankings: fewestGoalRows,
    },
    {
      title: "Biggest blowout",
      detail: biggestBlowout
        ? `${biggestBlowout.result.score}, ${biggestBlowout.margin}-goal margin over ${biggestBlowout.loser.name}`
        : "Projected blowout leaders until final-score margins post",
      icon: <Flame size={20} />,
      team: biggestBlowout?.winner || blowoutRows[0]?.team,
      source: biggestBlowout ? `${liveSource} · ${formatUpdatedAt(liveUpdatedAt)}` : "Pre-tournament attack estimate",
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
              {drawStarted && row.team ? (
                <OwnerLine assignment={assignmentByTeam.get(row.team.id)} />
              ) : (
                <span className="muted">Managers unlock at draw</span>
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

function PlayoffsTab({ assignments, drawStarted }: { assignments: Assignment[]; drawStarted: boolean }) {
  const assignmentByTeam = new Map(assignments.map((assignment) => [assignment.team.id, assignment]));

  return (
    <div className="bracketShell">
      <div className="bracketIntro">
        <div>
          <p className="eyebrow">Knockout board</p>
          <h3>Round of 32 slots</h3>
        </div>
        <span>{drawStarted ? "Owners attached" : "Owners attach after draw"}</span>
      </div>
      <div className="bracketGrid">
        {bracketMatches.map((match) => (
          <article className="matchCard" key={match.slot}>
            <div className="matchRound">{match.round}</div>
            <strong>{match.slot}</strong>
            <div className="matchTeams">
              {match.teamIds.map((teamId, index) => {
                const team = teamId ? teamById.get(teamId) : undefined;
                return (
                  <div className="matchTeam" key={`${match.slot}-${index}`}>
                    {team ? (
                      <>
                        <TeamPill team={team} assignment={drawStarted ? assignmentByTeam.get(team.id) : undefined} />
                        {drawStarted && <OwnerLine assignment={assignmentByTeam.get(team.id)} />}
                      </>
                    ) : (
                      <span className="muted">TBD qualifier</span>
                    )}
                  </div>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function NerdStats({
  assignments,
  drawStarted,
  evs,
  oddsRefreshIn,
  liveRefreshIn,
}: {
  assignments: Assignment[];
  drawStarted: boolean;
  evs: TeamEv[];
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
  const categoryLeaders = categoryKeys.map((category) => {
    const leaders = [...teamsWithEv]
      .sort((a, b) => b.ev.categoryEv[category] - a.ev.categoryEv[category])
      .slice(0, 3);
    return { category, leaders };
  });
  const modelRecipes = [
    { label: "Winner", formula: "softmax(exp((power - 55) / 13))" },
    { label: "Runner up", formula: "softmax(exp((power - 52) / 15) x (1.08 - P(win)))" },
    { label: "Upset", formula: "softmax(exp((rank - 25) / 22) x exp((power - 42) / 24))" },
    { label: "Fewest goals", formula: "softmax(exp((58 - attack) / 12) x (1.12 - power / 120))" },
    { label: "Blowout", formula: "softmax(exp((attack + power - 130) / 18))" },
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
        <h3>EV lab</h3>
        <p>
          Every team gets five category probabilities, each category is normalized to 100%, and dollar EV is just
          probability times payout. The draw algorithm then balances total roster EV while preserving four or five teams.
        </p>
        <div className="nerdFormula">
          <strong>${POT_TOTAL_DOLLARS} pot</strong>
          <span>Team EV = Σ P(category win) x category payout</span>
          <span>Target manager EV = ${targetEv.toFixed(2)}</span>
        </div>
        <div className="metricGrid">
          <div>
            <span>Total modeled EV</span>
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
          <strong>Normalization checks</strong>
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
          <small>Server-side Redis/CDN caching protects the free API limits even when browsers check more often.</small>
        </div>
        <div className="miniTable">
          <strong>Model recipes</strong>
          {modelRecipes.map((recipe) => (
            <div className="miniRow formulaRow" key={recipe.label}>
              <span>{recipe.label}</span>
              <code>{recipe.formula}</code>
            </div>
          ))}
        </div>
        <div className="miniTable">
          <strong>Category probability leaders</strong>
          {categoryLeaders.map(({ category, leaders }) => (
            <div className="miniRow" key={category}>
              <span>
                {categoryLabels[category]}
                <small>{leaders.map(({ team, ev }) => `${team.name} ${formatPercent(ev.probabilities[category])}`).join(" / ")}</small>
              </span>
            </div>
          ))}
        </div>
        <div className="miniTable wideMiniTable">
          <strong>Highest team EV, owner-free</strong>
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
  const [marketOdds, setMarketOdds] = useState<MarketOdd[]>(fallbackMarketOdds);
  const [liveState, setLiveState] = useState<LiveState>(fallbackLiveState);
  const [marketRefreshAt, setMarketRefreshAt] = useState(() => Date.now() + MARKET_REFRESH_MS);
  const [liveRefreshAt, setLiveRefreshAt] = useState(() => Date.now() + LIVE_REFRESH_MS);
  const [theme, setTheme] = useState<"light" | "dark">(() =>
    typeof window === "undefined" ? "light" : window.localStorage.getItem("wc-theme") === "dark" ? "dark" : "light",
  );
  const evs = useMemo(() => computeTeamEvs(teams), []);
  const [lockedAssignments, setLockedAssignments] = useState<Assignment[] | null>(() => loadStoredDraw(teams, evs));

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;
    const refresh = () => {
      fetchMarketOdds()
        .then((odds) => {
          if (mounted) setMarketOdds(odds);
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
    if (!drawStarted || lockedAssignments) return;
    let cancelled = false;

    fetchDrawLedger(teams, evs).then((serverAssignments) => {
      if (cancelled || !serverAssignments?.length) return;
      saveStoredDraw(serverAssignments);
      setLockedAssignments(serverAssignments);
    });

    return () => {
      cancelled = true;
    };
  }, [drawStarted, evs, lockedAssignments]);

  const drawLoading = drawStarted && assignments.length === 0;
  const currentIndex = drawStarted && assignments.length ? Math.min(assignments.length - 1, Math.floor(elapsed / PICK_REVEAL_MS)) : -1;
  const drawComplete = drawStarted && assignments.length > 0 && elapsed >= assignments.length * PICK_REVEAL_MS;
  const revealed = drawStarted && assignments.length ? assignments.slice(0, drawComplete ? assignments.length : currentIndex + 1) : [];
  const currentPick = drawComplete ? assignments[assignments.length - 1] : assignments[currentIndex];
  const countdown = formatCountdown(drawStart - now);
  const oddsRefreshIn = formatRefreshCountdown(Math.min(MARKET_REFRESH_MS, marketRefreshAt - now));
  const liveRefreshIn = formatRefreshCountdown(Math.min(LIVE_REFRESH_MS, liveRefreshAt - now));

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
            evs={evs}
          />
        )}
        {activeTab === "owners" && <OwnersTab assignments={drawStarted ? assignments : revealed} />}
        {activeTab === "playoffs" && <PlayoffsTab assignments={assignments} drawStarted={drawStarted} />}
      </section>

      {nerdOpen && (
        <NerdStats
          assignments={drawStarted ? assignments : []}
          drawStarted={drawStarted}
          evs={evs}
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
