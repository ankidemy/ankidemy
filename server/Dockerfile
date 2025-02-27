# Multistage build for Go server

# Build stage
FROM golang:alpine AS builder

# Install git for fetching dependencies
RUN apk add --no-cache git

# Set working directory
WORKDIR /app

# Copy go.mod and go.sum files first to leverage Docker cache
COPY go.mod go.sum* ./

# Download dependencies (if go.sum exists, otherwise it will be created)
RUN go mod download || go mod tidy

# Copy the source code
COPY . .

# Build the application with optimizations:
# - CGO_ENABLED=0: pure Go build
# - -ldflags="-s -w": strip debug info and symbol tables
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -ldflags="-s -w" -o main .

# Final stage - using distroless for minimal image size and security
FROM gcr.io/distroless/static-debian11

# Set working directory
WORKDIR /app

# Copy the binary from the builder stage
COPY --from=builder /app/main .

# Copy config file if it exists
COPY --from=builder /app/config.yaml* ./

# Expose the port
EXPOSE ${SERVER_PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD ["/app/main", "-health-check"] || exit 1

# Run the binary
CMD ["./main"]
