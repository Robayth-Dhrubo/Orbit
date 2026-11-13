FROM node:22-bookworm-slim

WORKDIR /app
COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
RUN cd apps/api && npm ci --no-audit --no-fund

COPY apps/api/ ./apps/api/
COPY database/migrations/ ./database/migrations/
COPY openapi.yaml ./openapi.yaml

WORKDIR /app/apps/api
EXPOSE 3000
# Migrations are atomic and safe to rerun; the API is never served before they finish.
CMD ["sh", "-c", "node --import tsx scripts/db-migrate.ts && exec node --import tsx src/server.ts"]
