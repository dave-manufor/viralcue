FROM node:20-slim

WORKDIR /app

# Install system dependencies including OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

# Copy the entire monorepo
COPY . .

# Install dependencies and build
RUN pnpm install
RUN DATABASE_URL="postgresql://dummy:dummy@localhost:5432/dummy" DIRECT_URL="postgresql://dummy:dummy@localhost:5432/dummy" pnpm --filter @viralcue/db exec prisma generate --schema=prisma/schema.prisma
RUN pnpm --filter @viralcue/api build

# Expose port
EXPOSE 3001

# Start the API
CMD ["pnpm", "--filter", "@viralcue/api", "start"]
