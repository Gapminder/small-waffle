# syntax=docker/dockerfile:1
# Install native dependencies for the target platform, not the build host.
FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN --mount=type=cache,target=/root/.npm npm install --omit=dev --no-audit --no-fund --package-lock=false

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3333
COPY --from=dependencies /app/node_modules ./node_modules
COPY package.json index.js git-ops-sidecar-process.index.js ./
COPY src ./src
COPY static ./static
COPY scripts/run-container.mjs ./scripts/run-container.mjs
ARG SOURCE_REVISION=working-tree
ARG SOURCE_DIRTY=true
LABEL org.opencontainers.image.source="https://github.com/gapminder/small-waffle" \
      org.opencontainers.image.revision="$SOURCE_REVISION" \
      io.vizabi.source-dirty="$SOURCE_DIRTY"
RUN mkdir datasets events backup && chown node:node datasets events backup
USER node
EXPOSE 3333
HEALTHCHECK --interval=30s --timeout=5s --start-period=120s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + process.env.PORT + '/status').then(r => { if (!r.ok) process.exitCode = 1 }).catch(() => { process.exitCode = 1 })"]
CMD ["node", "scripts/run-container.mjs"]
