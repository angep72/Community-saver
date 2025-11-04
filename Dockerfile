# Stage 1 — Install dependencies
FROM node:18-alpine AS dependencies
WORKDIR /app

# Install build tools for native dependencies
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install production dependencies
RUN if [ -f package-lock.json ]; then \
    npm ci --only=production --ignore-scripts; \
    else \
    npm install --only=production --ignore-scripts; \
    fi && \
    npm cache clean --force

# Stage 2 — Production runtime
FROM node:18-alpine
WORKDIR /app

# Install dumb-init and curl
RUN apk add --no-cache dumb-init curl

# Copy dependencies from previous stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy package files
COPY package*.json ./

# Copy application files and folders
COPY server.js ./
COPY index.js ./
COPY config ./config
COPY controller ./controller
COPY middleware ./middleware
COPY models ./models
COPY routes ./routes

# Set environment variables
ENV NODE_ENV=production \
    PORT=5000

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

EXPOSE 5000

# Healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:${PORT}/api/health || exit 1

# Use dumb-init and start
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "server.js"]