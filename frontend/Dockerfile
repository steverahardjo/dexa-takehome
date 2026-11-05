# syntax=docker/dockerfile:1

# Development image: the container runs `next dev`, not a production build, so
# the source can be mounted from the host and edits hot-reload. `next.config.ts`
# is evaluated at boot, which is why GATEWAY_URL is a runtime variable here
# rather than a build argument.

FROM oven/bun:1-alpine

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

# Dependencies first: this layer is reused until the lockfile changes.
# Bun migrates the npm lockfile the first time and writes bun.lock for later.
COPY package.json package-lock.json ./
RUN bun install

COPY . .

EXPOSE 3000

# `next dev` binds every interface, so the published port works from the host.
CMD ["bun", "run", "dev"]
