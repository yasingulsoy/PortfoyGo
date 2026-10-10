# syntax=docker/dockerfile:1
# =============================================================================
# PortfoyGo yönetim paneli (Next.js, output: 'standalone') — üretim imajı
# Build bağlamı REPO KÖKÜDÜR (npm workspaces):
#   docker build -f admin/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.ornek.com/api \
#     --build-arg NEXT_PUBLIC_APP_URL=https://ornek.com -t portfoygo-admin .
# NEXT_PUBLIC_* değişkenleri (ve CSP connect-src) BUILD sırasında gömülür.
# =============================================================================
ARG NODE_IMAGE=node:22-alpine

FROM ${NODE_IMAGE} AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY admin/package.json admin/
COPY backend/package.json backend/
COPY packages/shared/package.json packages/shared/
RUN npm ci --workspace @portfoygo/admin --include-workspace-root=false --no-audit --no-fund

FROM deps AS build
ARG NEXT_PUBLIC_API_URL=http://localhost:5001/api
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL} \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_TELEMETRY_DISABLED=1
COPY packages/shared packages/shared
COPY admin admin
RUN npm run build -w @portfoygo/admin

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3001 \
    HOSTNAME=0.0.0.0
WORKDIR /app
# standalone çıktısı izleme kökünü (repo kökü) korur: server.js → admin/server.js
COPY --from=build --chown=node:node /app/admin/.next/standalone ./
COPY --from=build --chown=node:node /app/admin/.next/static ./admin/.next/static
COPY --from=build --chown=node:node /app/admin/public ./admin/public

USER node
EXPOSE 3001

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/login').then(r=>process.exit(r.status<500?0:1)).catch(()=>process.exit(1))"

CMD ["node", "admin/server.js"]
