# Déploiement Coolify — Plan pour 50 utilisateurs simultanés

> **Contexte** : 25 étudiants ont utilisé l'app en même temps et ça a crashé.  
> Ce document explique pourquoi, ce qui doit être corrigé dans le code, et comment déployer sur un serveur auto-hébergé via Coolify.

---

## 1. Pourquoi ça a crashé

Chaque échange avec Peter déclenche plusieurs appels API lourds en parallèle :

| Action | Par étudiant | Pour 25 étudiants |
|---|---|---|
| Connexion SSE OpenAI (maintenue 30s) | 1 | **25 connexions longues simultanées** |
| Appels ElevenLabs TTS (Phase 1 + 2a + 2b) | 3 | **75 appels en parallèle** |
| Upload audio Whisper (multipart, en RAM) | 1 | 25 uploads simultanés |
| WebSocket Deepgram (live transcription) | 1 | 25 WebSockets ouverts |
| Buffer audio ElevenLabs réponse (~300 KB) | ~300 KB | **~7 MB de buffers simultanés** |

### Causes concrètes du crash

**1. Limite de concurrence ElevenLabs**  
Le plan ElevenLabs a une limite de requêtes simultanées (souvent 10-15 selon le tier). 75 appels en parallèle → les requêtes au-delà de la limite reçoivent des erreurs 429. Le serveur accumule les timeouts, les buffers audio restent en mémoire, la RAM monte.

**2. Saturation de l'event loop Node.js**  
L'application tourne sur **un seul processus** (single-threaded). 25 streams SSE OpenAI ouverts en même temps saturent la boucle d'événements — les nouveaux appels attendent plusieurs centaines de ms avant d'être traités.

**3. Mémoire des stores en RAM**  
`ttsRequestStore`, `pregenResumeStore` et les buffers audio ElevenLabs sont tous en mémoire process. Sous charge, ça gonfle rapidement. Si le processus est tué par OOM (Out Of Memory), toutes les sessions perdent leur état instantanément.

**4. Contraintes Replit**  
Replit `autoscale` peut lancer plusieurs instances, mais les stores en mémoire ne sont **pas partagés** entre instances — un token audio généré par l'instance A est introuvable sur l'instance B.

---

## 2. Corrections à apporter dans le code

Ces changements sont à implémenter en Build mode.

### A. Limiteur de concurrence sur `/api/chat/stream`

Autoriser maximum 10 streams OpenAI simultanés. Les suivants reçoivent une erreur 503 claire (pas un timeout de 30s).

```typescript
// server/routes.ts — à ajouter en haut du fichier
let activeStreams = 0;
const MAX_CONCURRENT_STREAMS = 10;

// Dans le handler /api/chat/stream :
if (activeStreams >= MAX_CONCURRENT_STREAMS) {
  return res.status(503).json({
    error: 'Serveur momentanément occupé. Réessaie dans quelques secondes.'
  });
}
activeStreams++;
// ... traitement ...
// Dans finally :
activeStreams--;
```

### B. Réduire le TTL des buffers pregenResumeStore

Le TTL actuel est 5 minutes. Sous charge avec 25 sessions, c'est beaucoup de RAM. Ramener à 2 minutes.

```typescript
// server/routes.ts
const PREGEN_RESUME_TTL_MS = 2 * 60 * 1000; // 2 min au lieu de 5
```

### C. Route `/api/health` avec état de charge

```typescript
app.get('/api/health', (req, res) => {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    activeStreams,
    ttsRequestStoreSize: ttsRequestStore.size,
    pregenResumeStoreSize: pregenResumeStore.size,
    ttsCacheSize: ttsCache.size,
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMB: Math.round(mem.heapTotal / 1024 / 1024),
      rssMB: Math.round(mem.rss / 1024 / 1024),
    },
    uptime: Math.round(process.uptime()),
  });
});
```

---

## 3. Infrastructure requise pour Coolify

### Serveur recommandé

| Critère | Minimum (50 users) | Confortable (100 users) |
|---|---|---|
| CPU | 4 cœurs | 8 cœurs |
| RAM | 8 GB | 16 GB |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| Stockage | 20 GB SSD | 40 GB SSD |
| Réseau | 100 Mbit/s | 1 Gbit/s |

Exemples de serveurs compatibles : Hetzner CX32 (~12€/mois), OVH VPS Comfort, Infomaniak VPS-2.

### Logiciels nécessaires

- Docker Engine 24+
- Coolify (installé automatiquement via script)
- Traefik (inclus dans Coolify — reverse proxy + HTTPS automatique)
- PostgreSQL (sur le serveur Coolify, ou garder Neon)

---

## 4. Tutoriel d'installation pas à pas

### Étape 1 — Préparer le serveur

```bash
# Connexion SSH
ssh root@TON_IP_SERVEUR

# Mise à jour système
apt update && apt upgrade -y

# Installer Coolify (inclut Docker automatiquement)
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Coolify sera accessible sur `http://TON_IP:8000`.  
Crée ton compte administrateur à la première connexion.

---

### Étape 2 — Créer le Dockerfile dans le repo

Fichier à la racine du projet (`Dockerfile`) :

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# PM2 pour le mode cluster multi-cœurs
RUN npm install -g pm2

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

EXPOSE 5000

# 4 instances = 4 cœurs utilisés = capacité ×4
CMD ["pm2-runtime", "start", "dist/index.js", \
     "--name", "dilemme", \
     "--instances", "4", \
     "--exec-mode", "cluster"]
```

Fichier `.dockerignore` :

```
node_modules
dist
.git
.local
attached_assets
*.log
```

---

### Étape 3 — Connecter le repo Git à Coolify

Dans l'interface Coolify :
1. **Sources** → **Add new Source** → GitHub (ou GitLab)
2. Suis le flux OAuth — Coolify installe automatiquement un webhook sur le repo
3. À chaque `git push` sur `main`, Coolify redéploie automatiquement

---

### Étape 4 — Créer l'application

1. **Projects** → **New Project** → nom : `Dilemme`
2. Dans le projet → **New Resource** → **Application**
3. Sélectionne le repo et la branche `main`
4. **Build Pack** → `Dockerfile`
5. **Port** → `5000`
6. **Domaine** → ex : `dilemme.tonecole.ch`  
   → Coolify configure automatiquement HTTPS via Let's Encrypt

---

### Étape 5 — Variables d'environnement

Dans l'onglet **Environment Variables** de l'application :

```env
NODE_ENV=production
PORT=5000
DATABASE_URL=postgresql://...        # Neon ou PostgreSQL local
OPENAI_API_KEY=sk-...
ELEVENLABS_API_KEY=...
DEEPGRAM_API_KEY=...
SESSION_SECRET=...                   # Chaîne aléatoire longue (32+ chars)
POSTHOG_API_KEY=...
POSTHOG_PERSONAL_API_KEY=...
POSTHOG_PROJECT_ID=...
```

**Option A — Garder Neon PostgreSQL** (le plus simple)  
Copie le même `DATABASE_URL` depuis Replit. Neon supporte très bien le multi-instance.

**Option B — PostgreSQL sur Coolify**  
Dans Coolify → **New Resource** → **PostgreSQL** → Coolify génère une base et son URL. Lance ensuite `npm run db:push` pour créer le schéma :
```bash
# Depuis ton poste local avec l'URL de la DB Coolify :
DATABASE_URL=postgresql://... npx drizzle-kit push
```

---

### Étape 6 — Sticky sessions (obligatoire avec le mode cluster)

Avec 4 processus Node.js, les stores en mémoire (`ttsRequestStore`, `pregenResumeStore`) ne sont pas partagés. Un token audio généré par le processus #2 serait introuvable si la requête suivante arrive sur le processus #3.

**Solution : sticky sessions** — chaque navigateur étudiant reste épinglé au même processus.

Dans Coolify → **Advanced** → **Labels** (Traefik), ajouter :

```
traefik.http.services.dilemme.loadbalancer.sticky.cookie=true
traefik.http.services.dilemme.loadbalancer.sticky.cookie.name=dilemme_node
```

---

### Étape 7 — Premier déploiement

Dans Coolify → clique **Deploy**.

Coolify effectue automatiquement :
1. Clone du repo
2. Build de l'image Docker (multi-stage)
3. Push dans le registry interne
4. Lancement du conteneur
5. Configuration Traefik (reverse proxy + HTTPS)
6. Health check automatique

Durée typique : 2-3 minutes au premier build, ~1 minute pour les suivants.

---

### Étape 8 — Vérifier que tout fonctionne

```bash
# Sur le serveur, vérifier que le conteneur tourne
docker ps

# Vérifier les logs PM2 dans le conteneur
docker exec -it <container_id> pm2 logs

# Tester le health check
curl https://dilemme.tonecole.ch/api/health
```

Résultat attendu :
```json
{
  "status": "ok",
  "activeStreams": 0,
  "ttsRequestStoreSize": 0,
  "pregenResumeStoreSize": 0,
  "memory": { "heapUsedMB": 120, "heapTotalMB": 200 }
}
```

---

## 5. Architecture finale comparée

```
Replit (actuel)                    Ton serveur Coolify
────────────────────────           ────────────────────────────────────
1 processus Node.js                4 processus Node.js (PM2 cluster)
~2 GB RAM disponible               8 GB RAM dédiés
CPU partagé (burst)                4 cœurs dédiés
Stores mémoire non partagés        Sticky sessions → même process
Limite Replit autoscale            Aucune limite artificielle
~15 users simultanés max           ~50 users confortablement
Redéploiement manuel               Redéploiement auto à chaque git push
HTTPS géré par Replit              HTTPS Let's Encrypt via Traefik
```

---

## 6. Migration depuis Replit

### Checklist de migration

- [ ] Dockerfile et .dockerignore créés dans le repo
- [ ] Correction du limiteur de concurrence streams (serveur/routes.ts)
- [ ] Route `/api/health` ajoutée
- [ ] Serveur provisionné et Coolify installé
- [ ] Repo Git connecté à Coolify
- [ ] Toutes les variables d'environnement configurées
- [ ] Base de données migrée ou Neon gardé
- [ ] Domaine configuré + HTTPS vérifié
- [ ] Sticky sessions activées (labels Traefik)
- [ ] Test de charge : simuler 10 puis 25 puis 50 connexions simultanées
- [ ] Health check `/api/health` répond correctement

### Maintenir les deux en parallèle pendant la transition

Pendant la migration, tu peux garder Replit actif en production et tester Coolify sur un domaine de staging (`staging.dilemme.tonecole.ch`) avant de basculer le DNS.

---

## 7. Pour aller plus loin (si > 50 users)

Si tu dépasses 50 utilisateurs simultanés régulièrement, la prochaine étape est de **sortir les stores de la mémoire process** vers Redis :

- `ttsRequestStore` → Redis avec TTL automatique
- `pregenResumeStore` → Redis avec TTL automatique
- `ttsCache` → Redis avec TTL automatique

Avec Redis, tu peux lancer **autant de conteneurs que tu veux** sans sticky sessions — chaque processus lit et écrit dans le même store partagé. Coolify permet d'ajouter un service Redis en un clic (**New Resource** → **Redis**).

Cette évolution est une tâche de refactoring estimée à ~2-3h.
