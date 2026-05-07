# Build stage
FROM golang:1.25-alpine AS builder

WORKDIR /app

# Install dependencies
RUN apk add --no-cache git

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Build the binary
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o runloop-engine main.go

# Final stage
FROM alpine:latest

# Runtimes for executor nodes: Python, Node.js, Docker CLI, Bash for Shell
# (see internal/executor — Python/NodeJS/Docker spawn the respective binary
# in $PATH; without these the node fails immediately with "executable not
# found"). docker-cli only — the daemon must be reached via mounted socket.
# curl is included so Shell scheduler tasks can call internal/external HTTP
# endpoints (e.g. webhook fan-out, pipeline executor APIs) without bundling
# their own binary — it's the most common dependency in user shell scripts.
RUN apk --no-cache add \
        ca-certificates \
        bash \
        curl \
        python3 \
        py3-pip \
        nodejs \
        npm \
        docker-cli

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/runloop-engine .

# Expose port (Go HTTP convention; override via EXECUTOR_PORT env var)
EXPOSE 8080

# Run the binary
CMD ["./runloop-engine"]
