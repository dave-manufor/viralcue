FROM node:20-slim

WORKDIR /app

# Install system dependencies including OpenSSL for Prisma
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

RUN npm install -g pnpm

# Copy the entire monorepo
COPY . .

# Install dependencies and build
RUN pnpm install
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN pnpm --filter @viralcue/api build

# Expose port
EXPOSE 3001

# Start the API
CMD ["pnpm", "--filter", "@viralcue/api", "start"]
