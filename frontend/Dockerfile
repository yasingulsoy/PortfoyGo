# syntax=docker/dockerfile:1
# =============================================================================
# PortfoyGo site (Next.js, output: 'standalone') — üretim imajı
# Build bağlamı REPO KÖKÜDÜR (npm workspaces):
#   docker build -f frontend/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.ornek.com/api -t portfoygo-web .
# NEXT_PUBLIC_* değişkenleri (ve CSP connect-src, API_PROXY_TARGET rewrite'ı) BUILD sırasında gömülür;
# değiştirmek için imajı yeniden derleyin. Sunucu tarafı anahtarlar (FINNHUB_API_KEY…) çalışma zamanında verilir.
# =============================================================================
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY admin/package.json admin/
COPY backend/package.json backend/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @portfoygo/frontend --include-workspace-root=false --no-audit --no-fund

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:5001/api
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG API_PROXY_TARGET=
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL} \
    API_PROXY_TARGET=${API_PROXY_TARGET} \
    NEXT_TELEMETRY_DISABLED=1
COPY packages/shared packages/shared
COPY frontend frontend
RUN npm run build -w @portfoygo/frontend

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# standalone çıktısı izleme kökünü (repo kökü) korur: server.js → frontend/server.js
COPY --from=build --chown=node:node /app/frontend/.next/standalone ./
COPY --from=build --chown=node:node /app/frontend/.next/static ./frontend/.next/static
COPY --from=build --chown=node:node /app/frontend/public ./frontend/public

USER node
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "frontend/server.js"]
