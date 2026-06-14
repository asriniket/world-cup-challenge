# Bishop Sycamore 2026 WC Sweepstakes

A static-host friendly 2026 World Cup friends pool app.

## Run locally

```bash
npm install
npm run dev
```

## Configure the pool

Edit `src/data/config.ts`:

- `PARTICIPANTS` controls who is in the draw.
- `DRAW_START_ISO` is the scheduled draw time. It is currently set to 5pm Central on June 13, 2026.
- `DRAW_SEED` is the public draw version used for browser storage invalidation.
- `DRAW_SEED_SECRET` is the private server-only seed that actually controls the allocation. Rotate it before the draw if you need a fresh allocation.

The app is configured for exactly 48 teams and 10 people. Eight people receive five teams and two people receive four teams. The hidden EV model uses the $200 pot:

- 40% / $80 to World Cup winner
- 15% / $30 to runner up
- 20% / $40 to biggest upset by FIFA ranking gap
- 15% / $30 to fewest total goals
- 10% / $20 to biggest blowout by final-score margin

Before the draw, the assignment ledger is sealed behind `/api/draw`; the browser does not precompute assignments. Once the draw starts, the server returns the ledger and the browser saves it in `localStorage`.

## API feeds

The app intentionally uses only two upstream APIs:

1. Copy `.env.example` into your Vercel or Netlify environment variables.
2. Use WorldCup26 for live World Cup scores, goals, fixtures, and match results.
3. Set `THE_ODDS_API_KEY` for The Odds API futures/outright odds.
4. Create a free Upstash Redis database and set `UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN` for server-side caching and API budget guards.
5. Set `DRAW_SEED_SECRET` as a long random server-only value before the draw.

`api/live-state.ts` calls `https://worldcup26.ir/get/games` and derives everything the prize boards need from that one response: 104 fixtures, live scores, completed results, team goal totals, final-score margins, upset winners, and the round/type label used to detect the completed Final runner up. Successful snapshots are cached for 6 minutes by default. `WORLDCUP26_DAILY_LIMIT=240` keeps the server from making more than roughly one upstream fetch every 6 minutes when Redis is configured; if the budget is reached or the upstream is down, the API route serves the last cached snapshot. If no cache exists, it returns an explicit warning with empty arrays instead of static data.

Use a tiny manual override only if a provider has a bad team total:

```bash
LIVE_STAT_OVERRIDES_JSON='[{"teamId":"united-states","played":1,"goalsFor":4,"goalsAgainst":1,"cleanSheets":0,"form":"W"}]'
```

`api/market-odds.ts` calls The Odds API v4 odds endpoint for `soccer_fifa_world_cup_winner` with exactly one market: `outrights`. The default `THE_ODDS_REGIONS=us` costs 1 credit per refresh. With `THE_ODDS_CACHE_HOURS=6`, the route spends about 4 credits/day or 120/month, and `THE_ODDS_MONTHLY_LIMIT=450` adds a hard guard under the 500-credit/month free tier. If The Odds API is down, over budget, or missing the World Cup outrights market, the app serves the last cached snapshot. If no cache exists, it returns an explicit warning with an empty odds board instead of static odds. The route normalizes futures odds into no-vig title probabilities and averages across returned books.

API-Football was removed as a runtime option because it duplicates the WorldCup26 fixture path for this app and its free tier is only 100 requests/day. The Odds API scores endpoint was not used for match data because it only returns live/upcoming and recently completed games for selected sports, not the full tournament history needed for the prize boards.

Useful provider docs:

- WorldCup26 API: `https://github.com/rezarahiminia/worldcup2026`
- API-Football World Cup guide: `https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports`
- The Odds API v4: `https://the-odds-api.com/liveapi/guides/v4/`
- Upstash Redis REST API: `https://upstash.com/docs/redis/features/restapi`

For Vercel, the included `api/` routes deploy automatically. For Netlify, use Vercel-style functions support or adapt these two files into Netlify functions.

For local API verification without spending extra setup time, load `.env.local` and call the handler directly:

```bash
set -a; source .env.local; set +a
npx tsx -e "import { GET } from './api/live-state'; (async () => { const r = await GET(); console.log(await r.json()); })();"
```

## Logic checks

```bash
npm test
```

The test suite verifies that:

- EV category probabilities sum to 100% per category.
- EV dollars sum to the full $200 pot.
- all 48 teams are assigned exactly once.
- every person receives exactly four or five teams.
- exactly eight people receive five teams and two receive four.
- the draw is deterministic for the same seed.
- stored draw hydration preserves owner/team/pick order.

## Deploy

Vercel and Netlify both work with the standard Vite build:

```bash
npm run build
```

Build output goes to `dist/`.
