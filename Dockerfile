FROM node:22-bookworm-slim

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY backend ./backend
COPY web ./web
COPY mcp ./mcp
COPY sql ./sql

RUN mkdir -p /app/config /app/logs /app/knowledge && chown -R node:node /app
USER node
EXPOSE 3001
CMD ["npm", "run", "web"]
