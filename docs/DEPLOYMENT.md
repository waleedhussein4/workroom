# Deploying

Three pieces: the Next.js app, the sync server, and a Postgres database. The app and the sync server share a database and two secrets.

Nothing here needs a paid plan except the sync server, which needs a host that keeps a process alive. That runs a few dollars a month.

**You do not need to buy a domain.** Both hosts hand you one:

| Piece       | Host   | URL you get                    |
| ----------- | ------ | ------------------------------ |
| Sync server | Fly.io | `https://<app-name>.fly.dev`   |
| Web app     | Vercel | `https://<project>.vercel.app` |

Deploy the sync server first, because the web app needs its hostname at build time.

## 1. Database

Neon's free tier is enough. Create a project, then take the **pooled** connection string.

Drop `channel_binding=require` from it if present. `node-postgres` does not understand that parameter, and `sslmode=require` on its own is what this app expects.

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

## 3. Sync server, first

Fly.io, around $3/month for a shared-cpu-1x with 256 MB. That is plenty: Yjs update messages are often under 50 bytes, and twenty people typing in one document is a few hundred kilobytes a minute.

`fly launch` cannot auto-detect anything here, because the repository is an npm workspace and the server is one package inside it. There is no runtime to infer at the root. The Dockerfile and `fly.toml` are committed, so skip `launch` and deploy directly.

Set the secrets first, either from the app's Secrets tab in the Fly dashboard, or with the CLI.

On macOS and Linux:

```bash
fly secrets set   DATABASE_URL='postgresql://...'   REALTIME_JWT_SECRET='...'   SYNC_INTERNAL_SECRET='...'
```

On Windows, PowerShell does not treat a backslash as a line continuation, so keep it on one line and quote each pair:

```powershell
fly secrets set "DATABASE_URL=postgresql://..." "REALTIME_JWT_SECRET=..." "SYNC_INTERNAL_SECRET=..." --app workroom
```

`fly auth login` needs a real terminal and will not run from a script or a CI step. If you cannot use it, the dashboard does the same job, or `fly tokens create` produces a `FLY_API_TOKEN` that works headlessly.

`PORT` is already set in `fly.toml` and does not belong in secrets.

Then, from the **repository root** rather than `apps/sync`:

```bash
fly deploy --ha=false
```

`--ha=false` matters. Without it flyctl creates a _second_ machine on the first deploy, for high availability. That is the wrong trade here: the two instances hold separate copies of every document with nothing shared between them, so two people editing the same document can land on different machines and never see each other's edits. There is deliberately no Redis, and the design assumes one machine.

If a deploy has already created two, `fly scale count 1` removes the extra.

The build context has to be the repository root, since the server imports two workspace packages that live outside its own directory. `/fly.toml` points at `apps/sync/Dockerfile` and takes care of that.

Keep it at **one machine**. A single instance owns every room, so there is no Redis and no sticky-session routing to think about. `auto_stop_machines` is off deliberately: stopping the machine when HTTP traffic goes quiet would drop every open WebSocket, which is the one thing this service exists to hold. Scaling past one machine means routing by document id at the load balancer rather than round-robin, or two instances end up holding divergent copies of the same document.

Check it:

```bash
curl https://<app-name>.fly.dev/health     # {"ok":true,"documents":0}
```

Write that hostname down. The web app needs it twice, as `https://` for server-to-server calls and `wss://` for the browser.

## 4. Web app

Import the repository on Vercel and set **Root Directory** to `apps/web`. Leave "Include source files outside of the Root Directory" enabled, or the workspace packages will not resolve. Vercel detects Next.js and npm workspaces on its own; the build and install commands need no changes.

Environment variables, with `<sync-app>` and `<project>` replaced by the hostnames Fly and Vercel gave you:

```
DATABASE_URL          postgresql://...            same string as the sync server
BETTER_AUTH_SECRET    <generated>
BETTER_AUTH_URL       https://<project>.vercel.app
REALTIME_JWT_SECRET   <generated>                 must match the sync server
SYNC_INTERNAL_SECRET  <generated>                 must match the sync server
SYNC_INTERNAL_URL     https://<sync-app>.fly.dev  server to server, https
NEXT_PUBLIC_SYNC_URL  wss://<sync-app>.fly.dev    from the browser, wss
```

Note the two different schemes on the last pair. They point at the same machine.

Optional:

```
GITHUB_CLIENT_ID        GitHub sign-in is hidden entirely when unset
GITHUB_CLIENT_SECRET
RESEND_API_KEY          without it, emails are logged to the server console
EMAIL_FROM
NEXT_PUBLIC_SENTRY_DSN
```

Two things that bite:

`NEXT_PUBLIC_SYNC_URL` **is inlined at build time**, not read at runtime. Changing it needs a redeploy, not just an environment edit.

`BETTER_AUTH_URL` **is a chicken and egg.** You do not know the project URL until the first deploy finishes. Deploy once, copy the URL, set the variable, redeploy. Sign-in fails with an origin mismatch until it is right.

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

If you would rather let Vercel's own Git integration handle deploys, leave `DEPLOY_ENABLED` unset and disconnect nothing. The two are alternatives, not partners: turning both on deploys twice.

## 6. GitHub sign-in

Create an OAuth app at [https://github.com/settings/developers](https://github.com/settings/developers):

- Homepage: `https://<project>.vercel.app`
- Callback: `https://<project>.vercel.app/api/auth/callback/github`

A second app pointed at `http://localhost:3000` is worth having for local work, since callback URLs cannot be wildcarded.

## 7. Monitoring

Sentry's free tier allows 5,000 errors a month. Filter WebSocket reconnect noise in `beforeSend` from the first deploy: a reconnect storm will otherwise consume a month's quota in an afternoon.

## Checks after deploying

```bash
curl https://<sync-app>.fly.dev/health

SYNC_URL=wss://<sync-app>.fly.dev REALTIME_JWT_SECRET=... \
  node scripts/probe-realtime-auth.mjs
```

The probe should authenticate the matching room and reject the other four cases. If a mismatched room authenticates, the room check is not running and any member can reach any document.

Then open the app in two browser windows: drag a card in one and watch it move in the other, and type into the same paragraph of a document from both.

## When something is wrong

**Sign-in fails, or redirects loop.** `BETTER_AUTH_URL` does not match the origin you are actually visiting. It must be the exact scheme and host, no trailing slash.

**The board says "Offline" and nothing syncs.** Either `NEXT_PUBLIC_SYNC_URL` is wrong or stale (it is baked at build time, so redeploy after changing it), or `REALTIME_JWT_SECRET` differs between the two services. The browser console shows the WebSocket failing to connect.

**Edits save but the other window never updates.** `SYNC_INTERNAL_URL` or `SYNC_INTERNAL_SECRET` is wrong. Publishing is deliberately fire-and-forget so a sync outage cannot fail a write that already committed, which means this fails quietly. The web app logs a warning.

`fly deploy` **cannot find a Dockerfile.** You are running it from `apps/sync`. Run it from the repository root.
