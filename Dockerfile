# syntax=docker/dockerfile:1

# ---- build -----------------------------------------------------------------
# The build output is plain JavaScript and static files, so it is built once on
# the builder's native architecture and copied into every target platform.
FROM --platform=$BUILDPLATFORM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund

COPY tsconfig.base.json ./
COPY packages packages
COPY apps apps
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:24-alpine AS runtime

ARG VERSION=0.0.0-dev
ARG REVISION=unknown

LABEL org.opencontainers.image.title="Earshot" \
      org.opencontainers.image.description="Self-hosted spatial audio scene designer. Place a sound. Hear it there." \
      org.opencontainers.image.source="https://github.com/joecrockett5/earshot" \
      org.opencontainers.image.url="https://github.com/joecrockett5/earshot" \
      org.opencontainers.image.documentation="https://github.com/joecrockett5/earshot#readme" \
      org.opencontainers.image.licenses="MIT" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}"

# su-exec lets the entrypoint drop from root to the unprivileged `node` user.
RUN apk add --no-cache su-exec && mkdir -p /data && chown node:node /data

ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data

WORKDIR /app
# The server is a single bundled file, so the image carries no node_modules.
COPY --from=build /app/apps/server/dist/index.cjs apps/server/dist/index.cjs
COPY --from=build /app/apps/web/dist apps/web/dist
COPY docker/entrypoint.sh /usr/local/bin/earshot-entrypoint

VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --start-interval=1s --retries=3 \
  CMD wget -q -O /dev/null "http://127.0.0.1:${PORT}/api/health" || exit 1

ENTRYPOINT ["earshot-entrypoint"]
CMD ["node", "apps/server/dist/index.cjs"]
