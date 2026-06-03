FROM node:22-alpine AS builder

RUN apk add --no-cache libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .

FROM node:22-alpine AS runner

RUN apk add --no-cache nginx shadow su-exec gettext

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/astro.config.mjs ./
COPY --from=builder /app/tsconfig.json ./
COPY --from=builder /app/tailwind.config.mjs ./
COPY --from=builder /app/admin ./admin

COPY docker/nginx.conf.template /app/docker/nginx.conf.template
COPY docker/entrypoint.sh /entrypoint.sh

RUN mkdir -p /photos /config && \
    adduser -D -u 1001 appuser && \
    chown -R appuser:appuser /app /var/lib/nginx /var/log/nginx /photos /config && \
    chmod +x /entrypoint.sh

EXPOSE 8080

ENV NODE_ENV=production
ENV ADMIN_PASSWORD=${ADMIN_PASSWORD}

ENTRYPOINT ["/entrypoint.sh"]
