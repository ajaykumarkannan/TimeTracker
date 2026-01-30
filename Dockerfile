FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies first (cached unless package.json changes)
COPY package*.json ./
RUN npm ci

# Copy config files (rarely change)
COPY tsconfig*.json vite.config.ts ./

# Copy source files separately for better cache utilization
COPY server ./server
COPY src ./src
COPY public ./public
COPY index.html ./

RUN npm run build

FROM node:20-alpine

WORKDIR /app

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/package*.json ./

RUN npm ci --omit=dev

EXPOSE 3001

ENV NODE_ENV=production
ENV DB_PATH=/app/data/timetracker.db

CMD ["node", "dist/server/index.js"]
