# Deploying

Three pieces: the Next.js app, the sync server, and a Postgres database. The app and the sync server share a database and two secrets.

Nothing here needs a paid plan except the sync server, which needs a host that keeps a process alive. That runs a few dollars a month.

**You do not need to buy a domain.** Both hosts hand you one:

| Piece       | Host   | URL you get                    |
| ----------- | ------ | ------------------------------ |
| Sync server | Fly.io | `https://<app-name>.fly.dev`   |
| Web app     | Vercel | `https://<project>.vercel.app` |

Deploy the sync server first, because the web app needs its hostname at build time.

The numbered sections below are the whole procedure, and each one says whether
it is already done for the current deployment. They are kept in full so the
document still works for a fresh clone or a rebuild from scratch.

## Where this stands

Deployed and verified on 2026-08-24. The full Playwright suite was run against
the live environment, not just locally, and all nine specs passed, including
the two-window convergence test.

| Piece       | Where                                                       | State |
| ----------- | ----------------------------------------------------------- | ----- |
| Web app     | <https://workroom-web.vercel.app>                           | live  |
| Sync server | <https://workroom.fly.dev>, one shared-cpu-1x in `ams`      | live  |
| Database    | Neon, `ep-still-wave-b2ngn1v0-pooler`, migrations at `0001` | live  |
| CI          | six jobs, green                                             | green |

**One thing stops a stranger signing up.** Email verification is required and
no mail provider is configured, so the confirmation link is written to the
Vercel runtime log and nowhere else. Nobody outside the log can finish signing
up. Fix it either way before sharing the URL:

- set `RESEND_API_KEY` and `EMAIL_FROM`, which sends real mail; or
- set `AUTH_REQUIRE_EMAIL_VERIFICATION=false`, which drops the step entirely.

The second is reasonable for a demo anyone should be able to try in a few
seconds. The first is what a real product does.

**Deploys are gated on the tests.** A push to `main` runs format, lint,
typecheck, unit tests, build and end to end, and only ships if all six pass.
One pipeline covers both services: Vercel for the web app, Fly for the sync
server. Verified working on run `32752039512`.

Section by section:

| Section                  | State                                    |
| ------------------------ | ---------------------------------------- |
| 1. Database              | done, migrated to `0001`                 |
| 2. Secrets               | done on both services and in CI          |
| 3. Sync server           | done, live, one machine, deploys from CI |
| 4. Web app               | done, live, seven vars, deploys from CI  |
| 5. Continuous deployment | done, gated on six checks, both services |
| 6. GitHub sign-in        | not done. Button hidden until configured |
| 7. Monitoring            | not done                                 |

## 1. Database — done

Neon project `ep-still-wave-b2ngn1v0-pooler`, `eu-central-1`, migrations applied
through `0001`. Nothing to do here unless a new migration is generated, in which
case run `npm run db:migrate` against it again.

Neon's free tier is enough. Create a project, then take the **pooled** connection string.

Drop `channel_binding=require` from it if present. `node-postgres` does not understand that parameter, and `sslmode=require` on its own is what this app expects.

Neon suspends an idle database after five minutes and resumes on the next connection, which is fine here. Supabase is the obvious alternative but pauses free projects after a week of inactivity and needs a manual restore from the dashboard, which is a bad property for a link somebody might click a month from now.

Run the migrations against it once:

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

## 2. Secrets — done

All three are generated and set on both Fly and Vercel. They do want rotating at
some point, since they passed through a chat transcript; the two realtime ones
must be changed on both services together or live updates stop.

Generate three:

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
openssl rand -base64 32   # REALTIME_JWT_SECRET
openssl rand -base64 32   # SYNC_INTERNAL_SECRET
```

`REALTIME_JWT_SECRET` and `SYNC_INTERNAL_SECRET` **must be identical** on the web app and the sync server. The first signs the room tickets the browser trades its session for; the second guards the endpoint the web app publishes board events to. If they differ, WebSocket connections are rejected and live updates silently stop.

## 3. Sync server — done

Live at <https://workroom.fly.dev>, one `shared-cpu-1x` machine in `ams`, health
check green. Secrets are set, and it now redeploys from CI on every push to
`main`, so the manual `fly deploy` below is only needed to bootstrap a new app
or to recover when CI cannot.

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

## 4. Web app — done

Live at <https://workroom-web.vercel.app>, project `workroom-web`, root directory
`apps/web`, all seven environment variables set and marked Sensitive. Redeploys
from CI on every push to `main`; its own Git integration is disconnected.

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

## 5. Continuous deployment — done

A push to `main` runs format, lint, typecheck, unit tests, build and end to
end. Only if all six pass does anything ship, and then both services ship from
the same run: `deploy-production` to Vercel and `deploy-sync` to Fly. Pull
requests get a preview deploy. `workflow_dispatch` allows a manual re-run,
which matters when the thing that changed was a secret rather than the code.

Configured with:

```bash
gh secret set VERCEL_TOKEN          # account-scoped, see below
gh secret set VERCEL_ORG_ID
gh secret set VERCEL_PROJECT_ID
gh secret set FLY_API_TOKEN         # flyctl tokens create deploy --app <app>
gh variable set DEPLOY_ENABLED --body true
```

Unsetting `DEPLOY_ENABLED` turns every deploy job off without deleting
anything, which is the quickest way to stop shipping if something is wrong.

### The dashboards must be disconnected

Vercel and Fly both offer their own Git integrations, and either one running
alongside these jobs deploys the same commit twice. Worse, their deploys are
not gated on anything, so the guarantee this whole arrangement exists for is
only as good as the weakest path.

- **Vercel**: Project, Settings, Git, Disconnect. Done.
- **Fly**: no `flyctl` command exists for this. The reliable route is the
  GitHub side: <https://github.com/settings/installations>, Fly.io, Configure,
  then either remove this repository or uninstall.

Verify with `flyctl releases --app <app>`: one new release per push, not two.

### Two things that cost an afternoon

**The Vercel token must be account-scoped, not project-scoped.** A
project-scoped token reads the project and its environment variables perfectly
well, but returns 403 on the team endpoint and 404 on the user endpoint, so the
CLI cannot work out which account owns the project. It fails with
`Could not retrieve Project Settings`, which reads like a wrong project id.

**Deploys upload source and let Vercel build.** The obvious arrangement, `pull`
then `build` then `deploy --prebuilt`, does not work here, because the
project's environment variables are marked Sensitive. `vercel pull` returns the
literal string `[SENSITIVE]` for those rather than their values, and the build
then fails during prerender on `new URL("[SENSITIVE]")`, which looks like an
application bug rather than a configuration one.

Building on Vercel is the better arrangement anyway: the runner never handles
production secrets, and marking a variable Sensitive keeps meaning what it
says. The cost is that the build runs twice, once in the `build` job to catch
errors early and once on Vercel to produce the artifact that ships.

**The Fly deploy passes `--ha=false`.** Without it flyctl adds a second
machine, and two instances hold separate copies of every document with nothing
shared between them, so two people editing the same document can land on
different machines and never see each other. The job also takes a concurrency
lock, since a deploy replaces the machine holding every open WebSocket and two
overlapping deploys would disconnect everyone twice.

## 6. GitHub sign-in — not done

No OAuth app exists, so the button is hidden and email and password is the only
way in. Nothing is broken; the feature is simply absent.

Create an OAuth app at [https://github.com/settings/developers](https://github.com/settings/developers):

- Homepage: `https://<project>.vercel.app`
- Callback: `https://<project>.vercel.app/api/auth/callback/github`

A second app pointed at `http://localhost:3000` is worth having for local work, since callback URLs cannot be wildcarded.

## 7. Monitoring — not done

No Sentry in the codebase. Errors currently go to the Vercel and Fly runtime
logs and nowhere else, which means nobody finds out about them unless they look.

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
