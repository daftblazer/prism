FROM debian:trixie
LABEL org.opencontainers.image.source=https://github.com/daftblazer/prism

# Install all dependencies including Node.js and build tools
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      ffmpeg mkvtoolnix mediainfo build-essential cmake ninja-build \
      nasm yasm pkg-config git nodejs npm python3 python3-pip \
      curl ca-certificates wget tmux htop procps file gosu jq \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything
COPY . .

# Build the React frontend manually inside the container
WORKDIR /app/webui/client
RUN npm install
RUN npm run build

# Back to main app dir
WORKDIR /app

# Install backend dependencies
WORKDIR /app/webui/server
RUN npm install

WORKDIR /app

# Environment variables
ENV ENCODERS_DIR=/config/encoders
ENV INPUT_DIR=/input
ENV OUTPUT_DIR=/output
ENV CONFIG_DIR=/config
ENV PORT=3000

# Create volume mount points
RUN mkdir -p /input /output /config/encoders

EXPOSE 3000

ENTRYPOINT ["/app/entrypoint.sh"]
