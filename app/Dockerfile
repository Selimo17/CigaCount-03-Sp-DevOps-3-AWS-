# syntax=docker/dockerfile:1

# ---- Stage 1: install production dependencies only ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

# ---- Stage 2: minimal runtime image ----
FROM node:24-alpine AS runtime

# Version injected by the CI pipeline (git commit SHA), exposed by /api/health.
ARG APP_VERSION=dev

ENV NODE_ENV=production \
    PORT=3000 \
    APP_VERSION=${APP_VERSION}

WORKDIR /app

# The package managers are not needed at runtime: removing them reduces the
# attack surface and the number of reported vulnerabilities.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    /opt/yarn* /usr/local/bin/yarn /usr/local/bin/yarnpkg

# Files are owned by root and read-only for the application user.
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY src ./src
COPY public ./public

# Run as the unprivileged "node" user (uid/gid 1000) of the official image.
USER 1000:1000

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "src/healthcheck.js"]

# Exec form: node is PID 1 and receives SIGTERM directly from ECS.
CMD ["node", "src/server.js"]
