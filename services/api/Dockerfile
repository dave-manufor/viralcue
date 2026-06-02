FROM node:20-slim

WORKDIR /app
RUN npm install -g pnpm

# Copy the entire monorepo
COPY . .

# Install dependencies and build
RUN pnpm install
RUN pnpm --filter @viralcue/api build

# Expose port
EXPOSE 3001

# Start the API
CMD ["pnpm", "--filter", "@viralcue/api", "start"]
