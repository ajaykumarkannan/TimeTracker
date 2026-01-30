# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cached unless package.json changes)
COPY package*.json ./
RUN npm ci

# Copy config files
COPY tsconfig*.json vite.config.ts ./

# Copy source files
COPY server ./server
COPY src ./src
COPY public ./public
COPY index.html ./

# Build application
RUN npm run build

# Production stage
FROM node:20-alpine

# Add non-root user for security
RUN addgroup -g 1001 -S chronoflow && \
    adduser -S chronoflow -u 1001 -G chronoflow

WORKDIR /app

# Copy built files and package info
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Create data directory with correct permissions
RUN mkdir -p /app/data /app/logs && \
    chown -R chronoflow:chronoflow /app

# Switch to non-root user
USER chronoflow

# Expose port
EXPOSE 4739

# Environment defaults
ENV NODE_ENV=production
ENV PORT=4739
ENV DB_PATH=/app/data/timetracker.db
ENV TRUST_PROXY=true

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4739/api/health || exit 1

# Start server
CMD ["node", "dist/server/index.js"]
