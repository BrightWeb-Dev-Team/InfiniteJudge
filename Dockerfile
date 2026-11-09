FROM node:22-bookworm-slim AS builder

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=4001 \
    DB_PATH=/app/data/infinte.db

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      g++ \
      openjdk-17-jdk-headless \
      python3 \
      tini \
      unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/server ./server
COPY --from=builder --chown=node:node /app/plugins ./plugins
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/ABOUT.md /app/LICENSE ./
RUN mkdir -p /app/data/uploads /app/runtime && chown -R node:node /app/data /app/runtime

USER node
EXPOSE 4001
VOLUME ["/app/data"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4001/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["node", "server/index.js"]
