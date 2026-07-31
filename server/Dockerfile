FROM golang:1.25-alpine@sha256:2b6edeb8c6b1071bfa16473f24bb7b7da0b1579009f97bb1542f239b14aabd8f AS builder

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
FROM alpine:latest@sha256:79ff19e9084a00eece421b2523fb93e22d730e2c0e525905de047e848e56d95f

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
HEALTHCHECK --interval=60s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:${SERVER_PORT:-8765}/health || exit 1

# Run with lower privileges
RUN adduser -D -g '' appuser && chown -R appuser:appuser /app
USER appuser

# Run the binary
CMD ["./main"]
