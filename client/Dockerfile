# --- Base Stage for Dependencies ---
FROM node:18-slim AS deps
WORKDIR /app

# Copy only package files for better caching
COPY package.json package-lock.json ./

# Install dependencies with clear separation between dev and prod
RUN npm ci

# --- Development Stage ---
FROM node:18-slim AS development
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./

# Copy application source
COPY . .

# Create .next directory and set proper permissions
RUN mkdir -p .next && \
    chown -R node:node /app

# Set non-root user for security
USER node

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=development

EXPOSE 3000
CMD ["npm", "run", "dev"]

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
FROM node:18-slim AS production
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev

# Copy build artifacts and public files
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.js ./next.config.js

# Set non-root user
USER node

# Disable telemetry
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

EXPOSE 3000

# Use proper production command
CMD ["npm", "start"]
