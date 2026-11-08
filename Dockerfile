# Production image: builds the web app and serves it together with the API.
FROM node:22-slim AS web
WORKDIR /app/client
COPY client/package*.json ./
RUN npm ci
COPY client/ ./
RUN npm run build

FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app/server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
COPY --from=web /app/client/dist /app/client/dist
RUN mkdir -p /data/storage && chown -R node:node /data /app
USER node
ENV STORAGE_DIR=/data/storage PORT=4000
EXPOSE 4000
CMD ["npx", "tsx", "src/main.ts"]
