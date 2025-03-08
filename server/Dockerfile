FROM golang:1.21-alpine AS builder

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

# Expose API port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:8080/health || exit 1

# Run with lower privileges
RUN adduser -D -g '' appuser
USER appuser

# Run the binary
CMD ["./main"]
