FROM golang:1.25-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git

WORKDIR /app

# Copy go.mod and go.sum for better layer caching
COPY go.mod go.sum* ./

# Download dependencies
RUN go mod download

# Copy the source code
COPY . .

# Build the application with optimizations
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags="-s -w" -o main .

# Final lightweight image
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache ca-certificates tzdata wget

WORKDIR /app

# Copy the binary from build stage
COPY --from=builder /app/main .

# Copy tutorial data for initial import
COPY --from=builder /app/tutorial.json .

# Create media directory for user uploads
RUN mkdir -p /app/media

# Expose API port (actual port configured via SERVER_PORT env var)
EXPOSE 8765

# Health check - port must match SERVER_PORT environment variable
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:${SERVER_PORT:-8765}/health || exit 1

# Run with lower privileges
RUN adduser -D -g '' appuser && chown -R appuser:appuser /app
USER appuser

# Run the binary
CMD ["./main"]
