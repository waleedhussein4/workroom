# Deploying

Three pieces: the Next.js app, the sync server, and a Postgres database. The app and the sync server share a database and two secrets.

Nothing here needs a paid plan except the sync server, which needs a host that keeps a process alive. That runs a few dollars a month.

## 1. Database

Neon's free tier is enough. Create a project, then take the **pooled** connection string.

Neon suspends an idle database after five minutes and resumes on the next connection, which is fine here. Supabase is the obvious alternative but pauses free projects after a week of inactivity and needs a manual restore from the dashboard, which is a bad property for a link somebody might click a month from now.

Run the migrations against it once:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

## 2. Secrets

Generate three:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # REALTIME_JWT_SECRET
openssl rand -base64 32   # SYNC_INTERNAL_SECRET
```

`REALTIME_JWT_SECRET` and `SYNC_INTERNAL_SECRET` **must be identical** on the web app and the sync server. The first signs the room tickets the browser trades its session for; the second guards the endpoint the web app publishes board events to. If they differ, WebSocket connections are rejected and live updates silently stop.

## 3. Sync server

Any host that runs a long-lived Node process. Fly.io at around $3/month for a shared-cpu-1x with 256 MB is enough: Yjs update messages are often under 50 bytes, and twenty people typing in one document is a few hundred kilobytes a minute.

Keep it at **one machine**. A single instance owns every room, so there is no Redis and no sticky-session routing to think about. Scaling past that means routing by document id at the load balancer, not round-robin, or two instances will hold divergent copies of the same document.

Environment:

```
DATABASE_URL
REALTIME_JWT_SECRET
SYNC_INTERNAL_SECRET
PORT                    # defaults to 1234
```

`GET /health` returns `{ ok: true, documents: n }` and is what a platform health check should hit.

## 4. Web app

Vercel, with the repository root as the project root and `apps/web` as the app directory.

Environment:

```
DATABASE_URL
BETTER_AUTH_SECRET
BETTER_AUTH_URL         # the deployed origin, e.g. https://workroom.example.com
REALTIME_JWT_SECRET     # same value as the sync server
SYNC_INTERNAL_SECRET    # same value as the sync server
SYNC_INTERNAL_URL       # https://sync.example.com, reached server to server
NEXT_PUBLIC_SYNC_URL    # wss://sync.example.com, reached from the browser
```

Optional:

```
GITHUB_CLIENT_ID        # GitHub sign-in is hidden entirely when unset
GITHUB_CLIENT_SECRET
RESEND_API_KEY          # without it, emails are logged to the server console
EMAIL_FROM
NEXT_PUBLIC_SENTRY_DSN
```

`NEXT_PUBLIC_SYNC_URL` is inlined at build time rather than read at runtime, so changing it means a rebuild, not just an environment update.

## 5. Continuous deployment

The deploy jobs already exist in `.github/workflows/ci.yml` and are gated on format, lint, typecheck, unit tests, build and end-to-end all passing. Deploying from Actions rather than Vercel's own Git integration is deliberate: the Git integration deploys whether or not CI passed.

They stay skipped until a repository variable turns them on:

```bash
gh secret set VERCEL_TOKEN          # vercel.com/account/tokens
gh secret set VERCEL_ORG_ID         # from .vercel/project.json after `vercel link`
gh secret set VERCEL_PROJECT_ID
gh variable set DEPLOY_ENABLED --body true
```

Push to `main` deploys production; a pull request gets a preview.

## 6. GitHub sign-in

Create an OAuth app at <https://github.com/settings/developers>:

- Homepage: the deployed origin
- Callback: `<origin>/api/auth/callback/github`

A second app pointed at `http://localhost:3000` is worth having for local work, since callback URLs cannot be wildcarded.

## 7. Monitoring

Sentry's free tier allows 5,000 errors a month. Filter WebSocket reconnect noise in `beforeSend` from the first deploy: a reconnect storm will otherwise consume a month's quota in an afternoon.

## Checks after deploying

```bash
curl https://sync.example.com/health

SYNC_URL=wss://sync.example.com REALTIME_JWT_SECRET=... \
  node scripts/probe-realtime-auth.mjs
```

The probe should authenticate the matching room and reject the other four cases. If a mismatched room authenticates, the room check is not running and any member can reach any document.

Then open the app in two browser windows: drag a card in one and watch it move in the other, and type into the same paragraph of a document from both.
