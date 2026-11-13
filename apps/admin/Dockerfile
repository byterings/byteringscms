# Admin Studio image. Build from the repository root:
#   docker build -f apps/admin/Dockerfile -t byteringscms-admin .
FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@10.34.9
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ENV NEXT_OUTPUT=standalone \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@byteringscms/admin...

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/admin/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/admin/.next/static ./apps/admin/.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# API_URL (runtime) tells the same-origin proxy where the API runs.
CMD ["node", "apps/admin/server.js"]
