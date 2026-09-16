# Built from the REPOSITORY ROOT, not from this directory:
#
#   docker build -f backend/dashboarr-backend/Dockerfile -t dashboarr-backend .
#
# The web editor bundles the app's pure config modules (lib/, store/) straight
# from the app tree, so the build context must contain them. Paths inside the
# build stage mirror the repository layout for the same reason.

# ---------- build ----------
FROM node:22-alpine AS build
WORKDIR /repo/backend/dashboarr-backend

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

# Dependency layers first so source edits do not invalidate npm ci.
COPY backend/dashboarr-backend/package*.json backend/dashboarr-backend/tsconfig.json ./
RUN npm ci
COPY backend/dashboarr-backend/src ./src
COPY backend/dashboarr-backend/web ./web
COPY lib /repo/lib
COPY store /repo/store
RUN npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:22-alpine
# tini is PID 1; su-exec drops privileges from the entrypoint.
# npm/yarn/corepack are build-time tools the runtime never invokes (the
# entrypoint execs plain `node`); removing them keeps their bundled deps
# out of CVE scans and off the attack surface.
RUN apk upgrade --no-cache && apk add --no-cache tini su-exec \
    && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
       /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/corepack
WORKDIR /app

COPY --from=build /repo/backend/dashboarr-backend/node_modules ./node_modules
COPY --from=build /repo/backend/dashboarr-backend/dist ./dist
COPY backend/dashboarr-backend/package.json ./
COPY backend/dashboarr-backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=4000

VOLUME ["/data"]
EXPOSE 4000

# Liveness probe. GET /health with no Authorization header answers 200
# {"ok":true,"name":"dashboarr-backend"} (see src/routes/health.ts). busybox
# wget is the only HTTP client left in the runtime image — npm/npx/yarn are
# stripped above — and it exits non-zero on any status >= 400, which is exactly
# why hand-written probes against the old bearer-only /health marked every
# container unhealthy forever (#357). Shell form so $PORT resolves at runtime.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:$PORT/health" || exit 1

# NOTE: Do NOT enable Expo "Enhanced Security for Push Notifications" on the
# shared projectId. If enabled, every user-hosted backend breaks silently.
LABEL dashboarr.warning="Do NOT enable Expo Enhanced Security for Push Notifications — it breaks every self-hosted backend."

# The entrypoint starts as root so it can chown /data (handles host-mounted
# volumes owned by the host user), then su-exec's into the `node` user before
# running node. The dist/ tree and node_modules remain root-owned and
# read-only to the node user — attack surface is minimized.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
