# syntax=docker/dockerfile:1

# One image for all five backend processes: they differ only in the entry file
# (node dist/apps/<app>/main.js), which each compose service overrides.

FROM node:22-alpine AS build
WORKDIR /app

# Dependencies first: this layer is reused until the lockfile changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY apps ./apps
COPY shared ./shared
COPY scripts ./scripts
COPY seed.json ./

# Every app is a separate rspack project, so each one is built explicitly.
# The seed runner is a plain tsc project that lands next to them in dist/seed,
# so `node dist/seed/scripts/seed.js` works inside the runtime image too.
RUN npm run build:all && npm run seed:build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# The compiled output imports its dependencies with ESM specifiers, so the
# production tree has to be present next to dist/.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
# Compose runs the seeder from /app as the one-shot `seed` service, so the data
# file has to sit next to it:
#   docker compose run --rm seed
COPY seed.json ./seed.json

# The gateway is the only process that publishes a port; the others are started
# with `command: node dist/apps/<service>/main.js`.
EXPOSE 3003
CMD ["node", "dist/apps/backend/main.js"]
