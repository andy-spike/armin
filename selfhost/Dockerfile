# Images for a self-hosted Armin instance. Built by selfhost/docker-compose.yml
# with the repository root as the build context. See https://docs.armincards.app/guides/self-hosting/.
ARG NODE_IMAGE=node:24.22.1-bookworm-slim

# The pnpm workspace with web and backend dependencies installed.
FROM ${NODE_IMAGE} AS workspace
ENV CI=true COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile --filter "@armin/web..." --filter "@armin/backend..."

# The web app, built for Node. The browser receives these public URLs, so they
# are fixed at build time; setup.sh and update.sh rebuild when they change.
FROM workspace AS web-build
ARG SITE_URL
ARG CONVEX_CLOUD_ORIGIN
ARG CONVEX_SITE_ORIGIN
ENV VITE_SITE_URL=${SITE_URL} \
    VITE_CONVEX_URL=${CONVEX_CLOUD_ORIGIN} \
    VITE_CONVEX_SITE_URL=${CONVEX_SITE_ORIGIN} \
    VITE_SELF_HOSTED=true
RUN test -n "$SITE_URL" && test -n "$CONVEX_CLOUD_ORIGIN" && test -n "$CONVEX_SITE_ORIGIN" \
  && pnpm --filter @armin/web build:node

FROM ${NODE_IMAGE} AS web
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
WORKDIR /app
COPY --from=web-build /app/apps/web/dist ./dist
COPY --from=web-build /app/apps/web/node-server.mjs ./
RUN echo '{"type":"module"}' > package.json
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/favicon.ico').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
CMD ["node", "node-server.mjs"]

# The Convex CLI with the backend source: pushes functions, sets deployment
# variables, and runs exports, imports, and operator commands.
FROM workspace AS tools
ENV HOME=/tmp PATH=/app/node_modules/.bin:$PATH
WORKDIR /app/packages/backend
