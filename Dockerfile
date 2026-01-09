# Use Bun official image
FROM oven/bun:1 AS base

# Install dependencies
FROM base AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Build the application
FROM base AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun --bun run build

# Production image
FROM base AS runtime
WORKDIR /app

RUN mkdir -p /data

# Copy built application and package files
COPY --from=build /app/.svelte-kit/adapter-bun ./.svelte-kit/adapter-bun
COPY --from=build /app/.svelte-kit/output ./.svelte-kit/output
COPY --from=build /app/server.js ./
COPY --from=build /app/static ./static
COPY --from=build /app/package.json ./
COPY --from=deps /app/node_modules ./node_modules

# Expose port (SvelteKit adapter-bun defaults to 3000)
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

# Enable limited sync mode for safer deployments
# Set to "false" to disable limited sync mode
ENV LIMIT_SYNC=true

# Start the application with Bun
CMD ["bun", "--bun", "run", "server.js"]

