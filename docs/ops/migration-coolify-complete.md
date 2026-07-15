# Migration Dilemme — Replit → Coolify (zéro dépendance Replit)

> Tutoriel complet pour migrer l'application depuis Replit vers un serveur
> auto-hébergé avec Coolify. Après cette migration, l'application tourne
> entièrement hors de Replit, sans aucun SDK ni plugin propre à cette plateforme.

---

## 1. Cartographie des dépendances Replit

### 1a. Dépendances dans le code source

| Fichier | Dépendance Replit | Impact | Action |
|---------|------------------|--------|--------|
| `vite.config.ts` | `@replit/vite-plugin-runtime-error-modal` | Importé inconditionnellement — présent même en build production | **Supprimer** ✅ fait |
| `vite.config.ts` | `@replit/vite-plugin-cartographer` | Conditionnel `REPL_ID !== undefined` — inactif hors Replit | Laisser (déjà inoffensif) |
| `vite.config.ts` | `@replit/vite-plugin-dev-banner` | Conditionnel `REPL_ID !== undefined` — inactif hors Replit | Laisser (déjà inoffensif) |
| `server/db.ts` | `@neondatabase/serverless` | Driver PostgreSQL avec transport WebSocket Neon | Garder si Neon cloud, remplacer par `pg` si PostgreSQL local |
| `.replit` | Fichier de config Replit | Workflows, modules Nix, cible de déploiement autoscale | Ignorer — inutile hors Replit |

### 1b. Variables d'environnement Replit

| Variable | Rôle dans le code | Hors Replit |
|----------|------------------|-------------|
| `REPL_ID` | Active les plugins Replit dans `vite.config.ts` | Ne pas définir — les plugins s'éteindront automatiquement |
| `DATABASE_URL` | Connexion PostgreSQL (Neon ou autre) | À redéfinir avec la nouvelle URL de base |
| `PGHOST`, `PGPORT`, `PGUSER`, `PGPASSWORD`, `PGDATABASE` | Composants individuels de la DB (Replit les injecte) | Non nécessaires si `DATABASE_URL` est définie |
| `PORT` | Port d'écoute (Replit fixe à 5000) | Fixer à `5000` dans les env vars Coolify |
| `SESSION_SECRET` | Secret Express session | À générer et configurer |

### 1c. Intégrations Replit (`.replit` → `[agent].integrations`)

```toml
integrations = ["javascript_openai:1.0.0", "javascript_database:1.0.0", "google-sheet:1.0.0"]
```

Ces intégrations sont des **helpers UI Replit uniquement** — elles ne s'injectent
pas dans le code. Vérification :

- **OpenAI** : le code utilise le SDK npm `openai` avec `process.env.OPENAI_API_KEY` → ✅ portable
- **Base de données** : le code utilise `@neondatabase/serverless` avec `DATABASE_URL` → ✅ portable (remplacer si besoin)
- **Google Sheets** : le code fait un `fetch()` vers un Google Apps Script URL → ✅ portable, aucune dépendance Replit

---

## 2. Modifications de code nécessaires

### 2a. Supprimer le plugin runtime-error-modal de Vite ✅ déjà fait

**Fichier** : `vite.config.ts`

L'import et l'usage de `@replit/vite-plugin-runtime-error-modal` ont été supprimés.
Ce plugin était chargé inconditionnellement, y compris en build de production,
rendant le bundle dépendant d'un package `@replit/*`.

### 2b. Désinstaller les packages @replit/* (après clonage hors Replit)

Sur ta machine de développement, une fois le repo cloné hors Replit :
```bash
npm uninstall @replit/vite-plugin-runtime-error-modal \
              @replit/vite-plugin-cartographer \
              @replit/vite-plugin-dev-banner
```

Les deux derniers (`cartographer`, `dev-banner`) peuvent rester en `devDependencies`
sans danger — ils sont conditionnels à `REPL_ID !== undefined` et ne s'activent
pas hors Replit. Mais il est plus propre de les supprimer.

### 2c. Base de données — deux options

#### Option A — Garder Neon PostgreSQL (recommandé, le plus simple)

Neon est un service cloud PostgreSQL standard, complètement indépendant de Replit.
Aucun code à changer. Copier exactement le même `DATABASE_URL` depuis Replit → Coolify.

```
DATABASE_URL=postgresql://user:password@ep-xxx.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

Le driver `@neondatabase/serverless` fonctionne hors Replit sans aucune modification.

#### Option B — PostgreSQL local sur Coolify

Remplacer dans `server/db.ts` :

```typescript
// AVANT (Neon serverless avec transport WebSocket)
import { Pool, neonConfig } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import ws from "ws";
neonConfig.webSocketConstructor = ws;
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle({ client: pool, schema });

// APRÈS (pg standard pour PostgreSQL local ou tout provider standard)
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 30,
});
export const db = drizzle({ client: pool, schema });
```

Installer le nouveau driver :
```bash
npm install pg
npm install --save-dev @types/pg
npm uninstall @neondatabase/serverless ws
```

> **Note** : si tu gardes Neon, le `ws` en `dependencies` reste utile pour le
> transport WebSocket Neon — ne pas le désinstaller dans ce cas.

---

## 3. Migration de la base de données

### Exporter les données depuis Replit (Neon)

```bash
# Récupérer DATABASE_URL depuis Replit Secrets
# Puis sur ta machine locale :
pg_dump "postgresql://user:pass@host/dbname?sslmode=require" \
  --no-owner --no-acl \
  -f dilemme_backup_$(date +%Y%m%d).sql
```

### Importer dans la nouvelle base

**Option A — Nouvelle base Neon** (aucune migration nécessaire si on garde le même projet Neon) :
```bash
# Vérifier que le schéma est à jour
DATABASE_URL="postgresql://..." npx drizzle-kit push
```

**Option B — PostgreSQL local Coolify** :
```bash
# 1. Créer la base dans Coolify (interface UI → New Resource → PostgreSQL)
# 2. Récupérer l'URL de connexion interne Coolify

# 3. Pousser le schéma Drizzle
DATABASE_URL="postgresql://coolify_user:pass@postgres:5432/dilemme" \
  npx drizzle-kit push

# 4. Importer les données existantes
psql "postgresql://coolify_user:pass@host:5432/dilemme" \
  < dilemme_backup_$(date +%Y%m%d).sql
```

---

## 4. Dockerfile et .dockerignore ✅ déjà créés à la racine

### Dockerfile (multi-stage Node 20 Alpine)

```dockerfile
# ─── Étape 1 : build ───────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ─── Étape 2 : image de production ─────────────────────────────────────
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/attached_assets ./attached_assets

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "dist/index.js"]
```

### .dockerignore

```
node_modules
dist
.git
.local
.canvas
.agents
attached_assets/screenshots
*.log
.env
.env.local
drizzle
migrations
scripts/load-test-class.mjs
```

---

## 5. Installation de Coolify sur ton serveur

### Prérequis serveur

| Ressource | Minimum (30 élèves) | Recommandé |
|-----------|--------------------|----|
| CPU | 2 cœurs | 4 cœurs |
| RAM | 4 GB | 8 GB |
| Stockage | 20 GB SSD | 40 GB SSD |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Réseau | 100 Mbit/s | 1 Gbit/s |

### Installer Coolify

```bash
# Se connecter en SSH au serveur
ssh root@TON_IP_SERVEUR

# Mise à jour système
apt update && apt upgrade -y

# Installer Coolify (inclut Docker Engine automatiquement)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Coolify est ensuite accessible sur `http://TON_IP:8000`.
Créer le compte administrateur à la première connexion.

---

## 6. Déploiement dans Coolify

### 6a. Connecter le dépôt Git

1. **Settings → Sources → Add new Source → GitHub** (ou GitLab, Gitea)
2. Suivre le flux OAuth — Coolify installe un webhook automatique sur le dépôt
3. À chaque `git push main`, Coolify redéploie sans intervention manuelle

### 6b. Créer l'application

1. **Projects → New Project** → nom : `Dilemme`
2. Dans le projet → **New Resource → Application**
3. Sélectionner le dépôt et la branche `main`
4. **Build Pack** → `Dockerfile`
5. **Port** → `5000`
6. **Domaine** → ex. `dilemme.tonecole.ch`
   → HTTPS Let's Encrypt configuré automatiquement via Traefik

### 6c. Variables d'environnement

Dans l'onglet **Environment Variables** de l'application Coolify :

```env
# ── Runtime ──────────────────────────────────────────────────
NODE_ENV=production
PORT=5000

# ── Base de données ───────────────────────────────────────────
DATABASE_URL=postgresql://...        # Neon cloud OU PostgreSQL Coolify

# ── APIs tierces ──────────────────────────────────────────────
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
DEEPGRAM_API_KEY=...
POSTHOG_API_KEY=phc_...
POSTHOG_PERSONAL_API_KEY=phx_...
POSTHOG_PROJECT_ID=107669
SESSION_SECRET=<générer avec: openssl rand -base64 48>

# ── Google Sheets (optionnel — analytics séances) ─────────────
# URL du Google Apps Script déployé (voir google-apps-script.js à la racine)
GOOGLE_SCRIPT_URL=https://script.google.com/macros/s/.../exec

# ── Sécurité admin ────────────────────────────────────────────
# Requis pour accéder à /admin et /api/health/load
ADMIN_TOKEN=<token_secret_32+_chars>

# ── Tuning charge (30 élèves simultanés) ─────────────────────
DB_POOL_MAX=30
ELEVENLABS_MAX_CONCURRENT=10        # Selon plan ElevenLabs (Creator=5, Scale=10+)
ELEVENLABS_MAX_QUEUED=100
OPENAI_MAX_CONCURRENT_STREAMS=20
OPENAI_MAX_QUEUED_STREAMS=60
OPENAI_QUEUE_WAIT_TIMEOUT_MS=30000
OPENAI_RUN_TIMEOUT_MS=45000
```

> **Générer SESSION_SECRET** : `openssl rand -base64 48`  
> **Générer ADMIN_TOKEN** : `openssl rand -hex 32`

### 6d. Lancer le premier déploiement

Dans Coolify → cliquer **Deploy**.

Coolify effectue automatiquement :
1. Clone du dépôt Git
2. Build de l'image Docker (multi-stage, ~3 min au premier build)
3. Push dans le registry Docker interne
4. Lancement du conteneur avec les env vars configurées
5. Configuration Traefik (reverse proxy + HTTPS Let's Encrypt)
6. Health check automatique (30s interval, 3 retries)

Durée typique : **2-4 minutes** au premier build, ~1 minute pour les suivants.

---

## 7. Vérification après déploiement

```bash
# Vérifier que le conteneur tourne
docker ps | grep dilemme

# Logs applicatifs en temps réel
docker logs -f <container_id>

# Tester le health check de base (doit retourner 200)
curl https://dilemme.tonecole.ch/api/health

# Tester l'état de charge (nécessite ADMIN_TOKEN)
curl -H "x-admin-token: $ADMIN_TOKEN" \
     https://dilemme.tonecole.ch/api/health/load
```

Réponse `/api/health/load` attendue à vide :
```json
{
  "activeChatStreams": 0,
  "openai": { "active": 0, "queued": 0, "timedOut": 0 },
  "elevenlabs": { "active": 0, "queued": 0 },
  "stores": { "ttsRequests": 0, "pregenResume": 0, "ttsCache": 0 },
  "memory": { "heapUsedMB": 90, "heapTotalMB": 180 }
}
```

Résultat des logs Docker attendu au démarrage :
```
[GoogleSheets] ✅ Google Apps Script URL configured
[Server] ✅ Assistant validated: Peter décembre 2025 proto Replit
[Deepgram] Live transcription relay attached at /ws/deepgram
serving on port 5000
[Connection Warming] OpenAI connection warming enabled (every 30s)
[Connection Warming] ElevenLabs connection warming enabled (every 30s)
```

---

## 8. Migration progressive (zéro downtime)

Recommandé pour ne pas interrompre une classe en cours :

```
Semaine 1 → Coolify staging sur dilemme-staging.tonecole.ch
              Tests avec 5 puis 10 sessions simultanées
              Observer /api/health/load pendant les tests
Semaine 2 → Test avec une vraie classe (30 élèves) sur staging
              Valider latence TTS et OpenAI sous charge réelle
Semaine 3 → Basculer le DNS production → IP Coolify
              Garder Replit actif en fallback 24-48h
Semaine 4 → Désactiver Replit, archiver le dépôt Replit si nécessaire
```

### Basculer le DNS

Pointer le domaine de production vers l'IP du serveur Coolify.
Le changement DNS peut prendre 1-24h selon les TTL configurés.
Pendant cette période, les deux instances peuvent recevoir du trafic —
c'est acceptable car la base de données est partagée (Neon) ou déjà migrée.

---

## 9. Comparaison Replit vs Coolify

| Critère | Replit autoscale | Coolify self-hosted |
|---------|-----------------|---------------------|
| RAM disponible | ~2 GB partagés | 8 GB dédiés |
| CPU | Partagé, burst | 4 cœurs dédiés |
| Restart automatique | Géré par Replit | Coolify + Docker `restart: unless-stopped` |
| HTTPS | Automatique | Traefik + Let's Encrypt |
| Redéploiement | Via UI Replit | `git push` → webhook → auto |
| Logs | UI Replit | `docker logs` + Coolify UI |
| Limites artificielles | Oui (autoscale Replit) | Aucune |
| Coût serveur | Inclus dans plan Replit | ~10-30€/mois VPS |
| In-memory state | Reset à chaque restart | Reset à chaque restart |
| Données persistées | Neon PostgreSQL (cloud) | PostgreSQL Coolify ou Neon |
| DB pool max | 10 (défaut, non configuré) | 30 (configuré via `DB_POOL_MAX`) |

---

## 10. Pour aller plus loin — > 50 utilisateurs simultanés

Si la charge dépasse 50 élèves simultanés, la prochaine étape est d'externaliser
les stores audio de la RAM vers **Redis** :

| Store actuel | Redis équivalent | TTL |
|---|---|---|
| `ttsRequestStore` (in-memory Map) | Redis avec TTL 60s | 60s |
| `pregenResumeStore` (in-memory Map) | Redis avec TTL | 5min |
| `ttsCache` (in-memory Map, 300 entrées) | Redis avec TTL | 24h |

Coolify supporte Redis nativement : **New Resource → Redis**.

Cela permet ensuite de lancer plusieurs répliques du conteneur Node.js avec
Coolify en mode réplication, Traefik faisant le load balancing.
Estimation du refactoring : 3-5h de développement.

---

## Checklist de migration complète

### Préparation du code
- [x] Supprimer `runtimeErrorOverlay()` de `vite.config.ts`
- [ ] Désinstaller `@replit/vite-plugin-runtime-error-modal` du `package.json` (hors Replit)
- [x] Ajouter `max: DB_POOL_MAX` au Pool PostgreSQL dans `server/db.ts`
- [x] Ajouter `server.keepAliveTimeout = 65_000` dans `server/index.ts`
- [x] Créer `Dockerfile` à la racine
- [x] Créer `.dockerignore` à la racine
- [x] Mettre à jour `.env.example` avec toutes les variables

### Infrastructure
- [ ] Serveur VPS provisionné (Ubuntu 22.04, 4 vCPU, 8 GB RAM)
- [ ] Coolify installé et accessible sur port 8000
- [ ] Dépôt Git connecté à Coolify via OAuth

### Base de données
- [ ] Choisir entre Neon cloud (Option A) ou PostgreSQL local (Option B)
- [ ] Si Option A : copier `DATABASE_URL` Neon dans Coolify env vars
- [ ] Si Option B : créer la DB, pousser le schéma, importer les données

### Déploiement
- [ ] Toutes les variables d'environnement configurées dans Coolify
- [ ] Premier deploy réussi (build vert, conteneur en cours)
- [ ] `GET /api/health` répond 200
- [ ] `GET /api/health/load` répond avec les bonnes métriques

### Tests de charge
- [ ] Test à 10 sessions simultanées sur staging (`SESSIONS=10 npm run test:load:class`)
- [ ] Test à 30 sessions simultanées (`SESSIONS=30 npm run test:load:class`)
- [ ] Aucun `ChatAdmissionTimeoutError` ni timeout DB

### Bascule production
- [ ] DNS de production pointé vers IP Coolify
- [ ] HTTPS vérifié sur le domaine de production
- [ ] Monitoring PostHog actif (vérifier `posthog_health_check` dans PostHog EU)
- [ ] Replit désactivé / archivé
