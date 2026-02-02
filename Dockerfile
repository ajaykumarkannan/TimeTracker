# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cached unless package.json changes)
COPY package*.json ./
RUN npm ci --include=dev

# Copy config files (separate layer for better caching)
COPY tsconfig*.json vite.config.ts eslint.config.js ./

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

# Copy package files first
COPY package*.json ./

# Install production dependencies only (separate from build deps)
RUN npm ci --omit=dev && npm cache clean --force

# Copy built files from builder
COPY --from=builder /app/dist ./dist

# Create a package.json for the server without "type": "module" since server is compiled to CommonJS
RUN node -e "const p=require('./package.json'); delete p.type; require('fs').writeFileSync('./dist/server/package.json', JSON.stringify({name:p.name,version:p.version,private:true}))"

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
