# --- Base Stage for Dependencies ---
FROM node:18-slim AS deps
WORKDIR /app

# Copy only package files for better caching
COPY package.json package-lock.json ./

# Install dependencies with clear separation between dev and prod
RUN npm ci

# --- Builder Stage ---
FROM node:18-slim AS builder
WORKDIR /app

# Copy dependencies
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

# Copy application source
COPY . .

# Disable telemetry 
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Build the application
RUN npm run build

# --- Production Stage ---
FROM node:18-slim
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Create cache directory with appropriate permissions
# This approach is safer than mounting volumes
RUN mkdir -p .next/cache/images .next/cache/fetch \
    && chmod -R 777 .next

# Copy build output and public files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.* ./

# Set appropriate permissions on all files
# This will handle any current and future directory structure
RUN chmod -R 777 /app/.next \
    && chown -R node:node /app

# Use node user for better security
USER node

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

EXPOSE 3000

# Use proper production command
CMD ["npm", "start"]
