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
  ShieldAlert,
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
  fastestRedCard: "Fastest red card",
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
    <section className="drawBand">
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

      <div className={`packStage ${drawStarted && !drawComplete ? "isOpening" : ""}`}>
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
  const favorite = marketBoard[0] || fallbackMarketOdds[0];
  const runnerUpProjection = marketBoard[1] || fallbackMarketOdds[1] || favorite;
  const favoriteTeam = teamById.get(favorite.teamId)!;
  const runnerUpTeam = teamById.get(runnerUpProjection.teamId)!;
  const fastestRed = withTeams
    .filter(({ stat }) => typeof stat.redCardMinute === "number")
    .sort((a, b) => (a.stat.redCardMinute || 999) - (b.stat.redCardMinute || 999))[0];
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

  const rows = [
    {
      title: "World Cup winner",
      detail: `$${CATEGORY_POTS.champion} to the champion. ${Math.round(favorite.probability * 1000) / 10}% market lead.`,
      icon: <Trophy size={20} />,
      team: favoriteTeam,
    },
    {
      title: "Runner up",
      detail: `$${CATEGORY_POTS.runnerUp} to second place. Projection follows market board.`,
      icon: <Medal size={20} />,
      team: runnerUpTeam,
    },
    {
      title: "Biggest upset",
      detail: biggestUpset
        ? `${biggestUpset.score}, FIFA rank gap ${biggestUpset.gap}`
        : `$${CATEGORY_POTS.biggestUpset}; no lower-ranked winner yet`,
      icon: <Target size={20} />,
      team: biggestUpset?.winner,
    },
    {
      title: "Fewest total goals",
      detail: leastGoals ? `$${CATEGORY_POTS.fewestTotalGoals}; ${leastGoals.stat.goalsFor} goals through ${leastGoals.stat.played}` : "Waiting on first match",
      icon: <Flame size={20} />,
      team: leastGoals?.team,
    },
    {
      title: "Fastest red card",
      detail: fastestRed ? `$${CATEGORY_POTS.fastestRedCard}; ${fastestRed.stat.redCardMinute}' red card` : "No red cards yet",
      icon: <ShieldAlert size={20} />,
      team: fastestRed?.team,
    },
  ];

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
            </div>
          </article>
        ))}
      </div>

      <div className="dataGrid">
        <article className="feedCard">
          <div className="dataCardHeader">
            <p className="eyebrow">Odds feed</p>
            <h3>Market board</h3>
            <span>{favorite.source} · {formatUpdatedAt(favorite.updatedAt)}</span>
          </div>
          <div className="oddsBoard" aria-label="World Cup outright odds">
            {marketBoard.slice(0, 8).map((odd, index) => {
              const team = teamById.get(odd.teamId);
              if (!team) return null;

              return (
                <div className="oddsRow" key={odd.teamId}>
                  <span>{index + 1}</span>
                  <div>
                    <Flag team={team} />
                    <strong>{team.name}</strong>
                  </div>
                  <b>{(odd.probability * 100).toFixed(1)}%</b>
                </div>
              );
            })}
          </div>
        </article>

        <article className="tableCard">
          <div className="dataCardHeader">
            <p className="eyebrow">Live feed</p>
            <h3>Quick form</h3>
            <span>
              {liveSource} · {formatUpdatedAt(liveUpdatedAt)}
            </span>
          </div>
          <div className="formTable">
            <div className="formRow formHead">
              <span>Team</span>
              <span>MP</span>
              <span>GF</span>
              <span>GA</span>
              <span>Cards</span>
              <span>Form</span>
            </div>
            {withTeams.slice(0, 10).map(({ team, stat }) => (
              <div className="formRow" key={team.id}>
                <div className="formTeam">
                  <Flag team={team} />
                  <span>{team.name}</span>
                  {drawStarted && assignmentByTeam.get(team.id) && <b>{assignmentByTeam.get(team.id)?.participant}</b>}
                </div>
                <span>{stat.played}</span>
                <span>{stat.goalsFor}</span>
                <span>{stat.goalsAgainst}</span>
                <span>{stat.yellowCards + stat.redCards}</span>
                <span>{stat.form}</span>
              </div>
            ))}
          </div>
        </article>
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
    { label: "Fastest red", formula: "softmax(exp((disciplineRisk - 35) / 14))" },
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
                  W ${ev.categoryEv.champion.toFixed(1)} · RU ${ev.categoryEv.runnerUp.toFixed(1)} · Upset ${ev.categoryEv.biggestUpset.toFixed(1)} · Low goals ${ev.categoryEv.fewestTotalGoals.toFixed(1)} · Red ${ev.categoryEv.fastestRedCard.toFixed(1)}
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
