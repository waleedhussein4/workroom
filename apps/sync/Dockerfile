# The sync server. Built from the repository root, because it depends on two
# workspace packages that live outside this directory.
#
#   fly deploy            # from the repository root, using /fly.toml
#
FROM node:24-alpine

WORKDIR /app
ENV NODE_ENV=production

# Manifests first so that changing source code does not invalidate the
# dependency layer.
#
# apps/web's manifest is copied even though the web app is never installed
# here: `npm ci` validates the whole workspace against the lockfile, and a
# missing workspace directory makes it refuse to run.
COPY package.json package-lock.json ./
COPY apps/sync/package.json ./apps/sync/
COPY apps/web/package.json ./apps/web/
COPY packages/core/package.json ./packages/core/
COPY packages/db/package.json ./packages/db/

RUN npm ci --workspace @workroom/sync --include-workspace-root --omit=dev

COPY packages/core ./packages/core
COPY packages/db ./packages/db
COPY apps/sync ./apps/sync

# Node's own type stripping needs explicit file extensions, which the
# workspace packages deliberately do not use, so the service runs under tsx.
ENV PORT=1234
EXPOSE 1234

CMD ["npm", "run", "start", "--workspace", "@workroom/sync"]
