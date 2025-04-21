FROM node:18-slim AS deps

WORKDIR /app

# Copy package files for dependency installation
COPY package.json package-lock.json ./

# Install dependencies (including dev dependencies for build)
RUN npm ci

# Build stage
FROM node:18-slim AS builder

WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN npm run build

# Production stage
FROM node:18-slim AS production

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy build output and public files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.* ./

# Create cache directories with appropriate permissions
RUN mkdir -p .next/cache/images .next/cache/fetch \
    && chmod -R 777 .next

# Set appropriate user for security
RUN chown -R node:node /app
USER node

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000 || exit 1

# Use production start command
CMD ["npm", "start"]
