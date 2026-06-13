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

## Odds feed

The UI uses static fallback data when keys are missing. The production setup is designed to stay inside free tiers:

1. Copy `.env.example` into your Vercel or Netlify environment variables.
2. Set `API_FOOTBALL_KEY` for live World Cup scores, goals, and match results.
3. Set `ODDS_PROVIDER=the-odds-api` plus `THE_ODDS_API_KEY` for futures/outright odds.
4. Create a free Upstash Redis database and set `UPSTASH_REDIS_REST_URL` plus `UPSTASH_REDIS_REST_TOKEN` for server-side caching and API budget guards.
5. Set `DRAW_SEED_SECRET` as a long random server-only value before the draw.

`api/live-state.ts` fetches API-Football `league=1&season=2026` fixtures and caches successful responses in Upstash for 30 minutes. `API_FOOTBALL_FIXTURE_DAILY_LIMIT=55` keeps the fixtures feed under the free 100 requests/day plan even if CDN caching is not doing much.

Use a tiny manual override only if a provider has a bad team total:

```bash
LIVE_STAT_OVERRIDES_JSON='[{"teamId":"united-states","played":1,"goalsFor":4,"goalsAgainst":1,"cleanSheets":0,"form":"W"}]'
```

`api/market-odds.ts` uses The Odds API free tier and caches successful odds snapshots in Upstash for 6 hours. With the default one-region, one-market request, that is roughly 4 provider credits/day and about 120/month. `ODDS_API_MONTHLY_LIMIT=450` adds a hard guard under the 500-credit/month free plan. If The Odds API is down, over budget, or missing the World Cup outrights market, the app serves the last cached snapshot; if there is no cache yet, it serves static fallback odds. It normalizes futures/outright odds into probability percentages and removes bookmaker overround within each book before averaging.

Useful provider docs:

- API-Football World Cup guide: `https://www.api-football.com/news/post/fifa-world-cup-2026-guide-to-using-data-with-api-sports`
- The Odds API v4: `https://the-odds-api.com/liveapi/guides/v4/`
- Upstash Redis REST API: `https://upstash.com/docs/redis/features/restapi`

For Vercel, the included `api/` routes deploy automatically. For Netlify, use Vercel-style functions support or adapt these two files into Netlify functions.

For local API verification without spending extra setup time, load `.env.local` and call the handler directly:

```bash
set -a; source .env.local; set +a
npx tsx -e "import live from './api/live-state'; (async () => { const r = await live(); console.log(await r.json()); })();"
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
