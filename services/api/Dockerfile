FROM node:20-slim

WORKDIR /app

# Install system dependencies including OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

# Copy workspace configuration and package.json files first
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/
COPY services/api/package.json ./services/api/
COPY apps/web/package.json ./apps/web/
COPY apps/extension/package.json ./apps/extension/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy the rest of the monorepo source code
COPY . .

# Generate Prisma client and build API package
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" DIRECT_URL="postgresql://dummy:dummy@localhost:5432/dummy" pnpm --filter @viralcue/db exec prisma generate --schema=prisma/schema.prisma
RUN pnpm --filter @viralcue/shared build && pnpm --filter @viralcue/db build && pnpm --filter @viralcue/api build

# Expose port
EXPOSE 3001

# Use non-root node user
USER node

# Start the API
CMD ["pnpm", "--filter", "@viralcue/api", "start"]
