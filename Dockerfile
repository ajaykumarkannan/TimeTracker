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

# Create a package.json for the server that uses CommonJS (no "type": "module")
RUN node -e "const p=require('./package.json'); delete p.type; require('fs').writeFileSync('./dist/server/package.json', JSON.stringify({name:p.name,version:p.version,private:true}))"

# Install production dependencies only
RUN npm ci --omit=dev && \
    npm cache clean --force

# Create data directory with correct permissions
RUN mkdir -p /app/data /app/logs && \
    chown -R chronoflow:chronoflow /app

# Switch to non-root user
USER chronoflow

# Port configuration (can be overridden at build or runtime)
ARG PORT=4849
ENV PORT=${PORT}
EXPOSE ${PORT}

# Environment defaults
ENV NODE_ENV=production
ENV DB_PATH=/app/data/timetracker.db
ENV TRUST_PROXY=true

# Health check uses the PORT env var
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/api/health || exit 1

# Start server
CMD ["node", "dist/server/index.js"]
