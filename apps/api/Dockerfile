# API image. Build from the repository root:
#   docker build -f apps/api/Dockerfile -t byteringscms-api .
FROM node:24-bookworm-slim AS base
RUN npm install -g pnpm@10.34.9 \
 && apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@byteringscms/api...
# Self-contained production bundle (workspace packages copied, dev deps dropped).
RUN pnpm --filter @byteringscms/api deploy --prod --legacy /out \
 && cd /out && npx prisma generate

FROM node:24-bookworm-slim AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    PORT=4000 \
    TEMPLATES_DIR=/app/templates \
    PLUGINS_DIR=/app/plugins \
    STORAGE_LOCAL_DIR=/data/storage
WORKDIR /app
COPY --from=build /out ./
COPY --from=build /repo/templates ./templates
COPY --from=build /repo/plugins ./plugins
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# RUN_MIGRATIONS=true applies pending migrations before starting.
CMD ["sh", "-c", "if [ \"$RUN_MIGRATIONS\" = \"true\" ]; then npx prisma migrate deploy; fi && exec node dist/main.js"]
