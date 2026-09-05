FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile

FROM dependencies AS web-build
COPY index.html vite.config.ts ./
COPY public ./public
COPY src ./src
RUN pnpm build:client

FROM node:22-alpine AS api
WORKDIR /app
ARG APP_VERSION=0.1.0
LABEL org.opencontainers.image.title="Townscape Guides API"
LABEL org.opencontainers.image.version=$APP_VERSION
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --prod --frozen-lockfile && pnpm store prune
COPY server ./server
COPY src ./src
COPY schemas ./schemas
COPY data/projects ./data/projects
COPY data/exports/*-listed-buildings.csv ./data/exports/
USER node
EXPOSE 3001
CMD ["node", "--import", "tsx", "server/index.ts"]

FROM nginxinc/nginx-unprivileged:1.27-alpine AS web
ARG APP_VERSION=0.1.0
LABEL org.opencontainers.image.title="Townscape Guides web"
LABEL org.opencontainers.image.version=$APP_VERSION
COPY --from=web-build /app/dist /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
