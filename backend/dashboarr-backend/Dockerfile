# ---------- build ----------
FROM node:20-alpine AS build
WORKDIR /app

# better-sqlite3 needs build tools
RUN apk add --no-cache python3 make g++

COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build && npm prune --omit=dev

# ---------- runtime ----------
FROM node:20-alpine
# tini is PID 1; su-exec drops privileges from the entrypoint.
RUN apk add --no-cache tini su-exec
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENV NODE_ENV=production \
    DATA_DIR=/data \
    PORT=4000

VOLUME ["/data"]
EXPOSE 4000

# NOTE: Do NOT enable Expo "Enhanced Security for Push Notifications" on the
# shared projectId. If enabled, every user-hosted backend breaks silently.
LABEL dashboarr.warning="Do NOT enable Expo Enhanced Security for Push Notifications — it breaks every self-hosted backend."

# The entrypoint starts as root so it can chown /data (handles host-mounted
# volumes owned by the host user), then su-exec's into the `node` user before
# running node. The dist/ tree and node_modules remain root-owned and
# read-only to the node user — attack surface is minimized.
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
