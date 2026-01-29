FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
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
