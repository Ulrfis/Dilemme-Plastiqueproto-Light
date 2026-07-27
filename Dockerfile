# ─── Étape 1 : build ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

# Copier les manifestes en premier pour tirer parti du cache Docker
COPY package*.json ./
RUN npm ci --include=dev

# Copier le code source et builder
COPY . .
RUN npm run build

# ─── Étape 2 : image de production ─────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Dépendances de production seulement
COPY package*.json ./
RUN npm ci --omit=dev

# Artefacts de build
COPY --from=builder /app/dist ./dist

# Fichiers statiques nécessaires au runtime (images, sons)
COPY --from=builder /app/attached_assets ./attached_assets

EXPOSE 5000

# Health check applicatif (30s interval, 3 retries avant unhealthy)
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "dist/index.js"]
