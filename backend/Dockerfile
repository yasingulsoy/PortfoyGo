# syntax=docker/dockerfile:1
# =============================================================================
# PortfoyGo API (Express) — üretim imajı
# Build bağlamı REPO KÖKÜDÜR (npm workspaces + kökteki package-lock.json):
#   docker build -f backend/Dockerfile -t portfoygo-api .
# Çalıştırma:   node dist/index.js   (API, port 5001, GET /healthz)
# Worker:       node dist/worker.js  (zamanlanmış işler, WORKER_PORT 5002, GET /healthz; API'de RUN_JOBS=0)
#               aynı imaj: docker run ... portfoygo-api node dist/worker.js  (HEALTHCHECK için HEALTH_PORT=5002)
# Migration:    docker run --rm -e DATABASE_URL=... portfoygo-api node dist/scripts/migrate.js
# =============================================================================
ARG NODE_IMAGE=node:22-alpine

# --- 1) Workspace manifest'leri: lockfile ile tutarlı kurulum için tüm paketlerin package.json'u gerekir
FROM ${NODE_IMAGE} AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY admin/package.json admin/
COPY packages/shared/package.json packages/shared/

# --- 2) Derleme: backend bağımlılıkları (dev dahil) + tsc → backend/dist
FROM manifests AS build
RUN npm ci --workspace @portfoygo/backend --include-workspace-root=false --ignore-scripts --no-audit --no-fund
COPY backend/tsconfig.json backend/
COPY backend/src backend/src
RUN npm run build -w @portfoygo/backend

# --- 3) Yalnızca production bağımlılıkları
FROM manifests AS prod-deps
RUN npm ci --omit=dev --workspace @portfoygo/backend --include-workspace-root=false --ignore-scripts --no-audit --no-fund \
 && mkdir -p backend/node_modules \
 && npm cache clean --force

# --- 4) Çalışma imajı (root olmayan kullanıcı)
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    PORT=5001
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/backend/node_modules ./backend/node_modules
COPY backend/package.json ./backend/package.json
COPY backend/migrations ./backend/migrations
COPY --from=build /app/backend/dist ./backend/dist

WORKDIR /app/backend
USER node
EXPOSE 5001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.HEALTH_PORT||process.env.PORT||5001)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
