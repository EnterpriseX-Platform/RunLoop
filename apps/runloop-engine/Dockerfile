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
RUN apk --no-cache add \
        ca-certificates \
        bash \
        python3 \
        py3-pip \
        nodejs \
        npm \
        docker-cli

WORKDIR /root/

# Copy the binary from builder
COPY --from=builder /app/runloop-engine .

# Expose port
EXPOSE 8092

# Run the binary
CMD ["./runloop-engine"]
