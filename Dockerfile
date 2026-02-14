FROM node:20-alpine

# Labels
LABEL maintainer="Katsuma"
LABEL description="SQLite-4.0 - Secure Embedded Database"
LABEL version="4.0.0"

# Install dependencies
RUN apk add --no-cache \
    bash \
    openssl \
    ca-certificates \
    dumb-init \
    tini

# Create directories
RUN mkdir -p /data /var/log/sqlite4 /etc/sqlite4 /home/sqlite4

# Set environment
ENV NODE_ENV=production \
    SQLITE4_DATADIR=/data \
    SQLITE4_LOGDIR=/var/log/sqlite4 \
    SQLITE4_PORT=4444 \
    SQLITE4_ADMIN_PORT=8443

# Copy application
COPY package.json /app/
WORKDIR /app
RUN npm install --production

COPY src /app/src/
COPY security-configs /app/security-configs/

# Create symlinks for binaries
RUN ln -s /app/src/sqlite4.js /usr/local/bin/sqlite4 && \
    ln -s /app/src/server.js /usr/local/bin/sqlite4-server && \
    ln -s /app/src/client.js /usr/local/bin/sqlite4-client && \
    ln -s /app/src/cli.js /usr/local/bin/sqlite4-cli && \
    ln -s /app/src/admin.js /usr/local/bin/sqlite4-admin && \
    ln -s /app/src/backup.js /usr/local/bin/sqlite4-backup && \
    ln -s /app/src/replication.js /usr/local/bin/sqlite4-replication

# Create non-root user
RUN addgroup -g 1000 sqlite4 && \
    adduser -u 1000 -G sqlite4 -s /bin/bash -D sqlite4 && \
    chown -R sqlite4:sqlite4 /data /var/log/sqlite4 /etc/sqlite4 /app

# Switch to non-root user
USER sqlite4

# Expose ports
EXPOSE 4444 8443

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD sqlite4-cli --ping || exit 1

# Default command
ENTRYPOINT ["tini", "--"]
CMD ["node", "src/server.js"]

# Labels for Docker Compose
VOLUME ["/data", "/var/log/sqlite4"]
