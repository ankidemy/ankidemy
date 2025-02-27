# Multistage build for NextJS client

# --- Base Stage (for shared dependencies) ---
FROM node:18-slim AS base
WORKDIR /app
COPY package*.json ./

# --- Development Stage (for hot-reloading) ---
FROM base AS development
RUN npm ci --also=dev
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]

# --- Builder Stage ---
FROM base AS builder
RUN npm ci --also=dev
COPY . .
RUN npm run build

# --- Production Stage - using smaller image ---
FROM node:18-slim AS production
WORKDIR /app

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy package.json and package-lock.json
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json ./package-lock.json

# Install only production dependencies:
RUN npm ci --omit=dev

# Copy only necessary files from the builder stage:
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/next.config.js ./next.config.js

# Set proper ownership
RUN chown -R nextjs:nodejs /app

# Switch to non-root user
USER nextjs

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

EXPOSE 3000
CMD ["npm", "start"]
