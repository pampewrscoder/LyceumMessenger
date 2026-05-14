FROM node:22-bookworm AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml .npmrc ./

COPY artifacts/messenger ./artifacts/messenger

RUN npm install -g pnpm && pnpm install --ignore-scripts

ARG VITE_API_BASE=""
ENV VITE_API_BASE=$VITE_API_BASE
ENV PORT=3000
ENV BASE_PATH=/

RUN pnpm --filter @workspace/messenger run build

# ── Serve with nginx ──────────────────────────────────────────────────────
FROM nginx:1.27-alpine

COPY artifacts/messenger/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/artifacts/messenger/dist/public /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
