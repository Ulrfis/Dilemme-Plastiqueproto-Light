# Déploiement Coolify — Plan pour 50 utilisateurs simultanés

> **Contexte** : 25 étudiants ont utilisé l'app en même temps et ça a crashé.  
> Ce document explique pourquoi, ce qui doit être corrigé dans le code, et comment déployer sur un serveur auto-hébergé via Coolify.

## Mise à jour après audit du code

Le premier plan surestimait l'impact des connexions SSE et proposait trop tôt un
cluster PM2 avec sticky sessions. Les blocages les plus immédiats sont applicatifs :

1. Les quotas HTTP étaient calculés par IP. Une classe derrière le même réseau
   public partage donc artificiellement les limites `200/15 min` et `60/15 min`.
2. Deepgram limitait à trois WebSockets par IP. Sur un réseau scolaire ou derrière
   un reverse proxy, le quatrième élève pouvait être refusé même avec une session valide.
3. Les appels ElevenLabs lancés par les réponses, les accueils et les reprises
   n'étaient pas régulés par une file commune.
4. La pré-génération de reprise ajoutait un appel OpenAI et un appel ElevenLabs
   après chaque échange, y compris en période de charge.
5. Une optimisation de fin de réponse pouvait régénérer un bloc audio fusionné
   alors qu'un premier bloc ElevenLabs continuait déjà en parallèle.

Les corrections implémentées utilisent désormais l'identité de session pour les
quotas coûteux, limitent Deepgram à une connexion par session, plafonnent la
concurrence ElevenLabs avec une file bornée et abandonnent les pré-générations de
reprise optionnelles lorsque les services AI sont occupés.

Pour le premier déploiement Coolify, utiliser **un seul processus Node.js** et
mesurer `/api/health/load`. Le passage à plusieurs processus ou plusieurs
conteneurs doit venir après externalisation des stores audio vers Redis ou vers
un stockage partagé. Les sticky sessions seules restent fragiles pendant les
redéploiements et n'assurent pas le partage du cache.

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
Le niveau exact dépend de l'abonnement ElevenLabs. Sans file applicative, une
classe peut néanmoins lancer plusieurs dizaines d'appels en rafale et provoquer
des erreurs 429 ou des latences longues.

**2. Limites IP incompatibles avec un réseau scolaire**
Les élèves d'une même classe peuvent partager une IP publique. Les anciens
quotas HTTP et la limite Deepgram par IP transformaient alors la classe entière
en un seul client.

**3. Mémoire des stores en RAM**
`ttsRequestStore`, `pregenResumeStore` et les buffers audio ElevenLabs sont en
mémoire process. Ce n'est pas nécessairement la cause du premier crash, mais
cela empêche de répliquer l'application sans stockage partagé.

**4. Pré-générations optionnelles sous charge**
Après chaque échange, une reprise était préparée avec OpenAI puis ElevenLabs,
même si l'élève ne quittait jamais l'écran. Cette optimisation de confort doit
s'effacer pendant une affluence.

---

## 2. Corrections apportées dans le code

### A. File de concurrence ElevenLabs

Tous les chemins TTS partagent une file bornée. Les réponses visibles sont
prioritaires. La concurrence et la longueur maximale de file sont configurables :

```env
ELEVENLABS_MAX_CONCURRENT=5
ELEVENLABS_MAX_QUEUED=100
```

### B. Délestage des reprises optionnelles

Une seule pré-génération de reprise peut s'exécuter à la fois. Si OpenAI ou
ElevenLabs sont déjà sollicités, cette tâche de confort est abandonnée.

### C. Admission OpenAI et état de charge

Les appels OpenAI possèdent un plafond configurable, une file bornée et un
verrou par session. Le réglage initial recommandé est de 10 appels actifs et
30 en attente, avec un timeout d'attente de 15 secondes. L'endpoint admin
`GET /api/health/load` expose les appels OpenAI actifs/en attente, les tours
verrouillés par session, la file ElevenLabs, les stores RAM et la mémoire.

### D. Quotas par session

Les routes Whisper et TTS vérifient le token de session. Les quotas coûteux sont
attribués à cette session lorsqu'elle est disponible. Deepgram autorise une
connexion WebSocket active par session, avec un garde-fou global par processus.

---

## 3. Infrastructure requise pour Coolify

### Dimensionnement initial à valider sous charge

| Critère | Point de départ staging |
|---|---|
| CPU | 4 cœurs |
| RAM | 8 GB |
| OS | Ubuntu LTS supporté par Coolify |
| Stockage | 20 GB SSD |
| Réseau | 100 Mbit/s |

Ce n'est pas une garantie de capacité. Valider avec des tests à 10, 25 puis 50
sessions et observer `/api/health/load` avant d'augmenter ou réduire la machine.

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

COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist

EXPOSE 5000

# Commencer avec un seul processus tant que les stores audio sont en RAM.
CMD ["node", "dist/index.js"]
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

### Étape 6 — Dimensionner avec les métriques applicatives

Configurer d'abord un seul processus Node.js. Les réglages principaux sont :

```env
ELEVENLABS_MAX_CONCURRENT=5
ELEVENLABS_MAX_QUEUED=100
OPENAI_MAX_CONCURRENT_STREAMS=10
OPENAI_MAX_QUEUED_STREAMS=30
OPENAI_QUEUE_WAIT_TIMEOUT_MS=15000
OPENAI_RUN_TIMEOUT_MS=45000
```

Adapter `ELEVENLABS_MAX_CONCURRENT` au niveau de concurrence réellement autorisé
par l'abonnement ElevenLabs. Vérifier ensuite la file et la mémoire avec
`GET /api/health/load` accompagné du header `x-admin-token`.

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

# Vérifier les logs applicatifs
docker logs <container_id>

# Tester l'état de charge
curl -H "x-admin-token: $ADMIN_TOKEN" https://dilemme.tonecole.ch/api/health/load
```

Résultat attendu :
```json
{
  "activeChatStreams": 0,
  "maxConcurrentChatStreams": 10,
  "openai": {
    "active": 0,
    "queued": 0,
    "maxConcurrent": 10,
    "maxQueued": 30,
    "rejectedConflicts": 0,
    "rejectedCapacity": 0,
    "timedOut": 0
  },
  "elevenlabs": { "active": 0, "queued": 0, "maxConcurrent": 5 },
  "stores": { "ttsRequests": 0, "pregenResume": 0, "ttsCache": 0 },
  "memory": { "heapUsedMB": 120, "heapTotalMB": 200 }
}
```

---

## 5. Architecture finale comparée

```
Replit (actuel)                    Ton serveur Coolify
────────────────────────           ────────────────────────────────────
1 processus Node.js                1 processus Node.js mesuré
~2 GB RAM disponible               8 GB RAM dédiés
CPU partagé (burst)                4 cœurs dédiés
Stores mémoire non partagés        Stores RAM assumés sur une instance
Limite Replit autoscale            Aucune limite artificielle
Capacité non mesurée               Capacité validée par tests de charge
Redéploiement manuel               Redéploiement auto à chaque git push
HTTPS géré par Replit              HTTPS Let's Encrypt via Traefik
```

---

## 6. Migration depuis Replit

### Checklist de migration

- [ ] Dockerfile et .dockerignore créés dans le repo
- [x] File bornée ElevenLabs et délestage des reprises optionnelles
- [x] File bornée OpenAI, timeout et verrou d'un tour par session
- [x] Quotas coûteux calculés par session et Deepgram limité par session
- [x] Route admin `/api/health/load` ajoutée
- [ ] Serveur provisionné et Coolify installé
- [ ] Repo Git connecté à Coolify
- [ ] Toutes les variables d'environnement configurées
- [ ] Base de données migrée ou Neon gardé
- [ ] Domaine configuré + HTTPS vérifié
- [ ] Test de charge : `SESSIONS=10`, puis `25`, puis `30 npm run test:load:class`
- [ ] Health check `/api/health/load` répond correctement avec `x-admin-token`

### Test de charge classe

Lancer uniquement sur staging ou dans une fenêtre de test dédiée. Le script
crée de vraies sessions `LoadTest-*` et consomme les services OpenAI/TTS.

```bash
export BASE_URL=https://staging.dilemme.tonecole.ch
export ADMIN_TOKEN=...

# Monter progressivement après analyse de chaque résultat
SESSIONS=5 TURNS=1 npm run test:load:class
SESSIONS=10 TURNS=1 npm run test:load:class
SESSIONS=25 TURNS=1 npm run test:load:class
SESSIONS=30 TURNS=1 npm run test:load:class
```

Conserver le rapport JSON de chaque palier. Ne pas passer au palier suivant si
des erreurs apparaissent ou si la file OpenAI approche de sa limite.

### Maintenir les deux en parallèle pendant la transition

Pendant la migration, tu peux garder Replit actif en production et tester Coolify sur un domaine de staging (`staging.dilemme.tonecole.ch`) avant de basculer le DNS.

---

## 7. Pour aller plus loin (si > 50 users)

Avant de lancer plusieurs processus ou plusieurs conteneurs, la prochaine étape est de **sortir les stores de la mémoire process** vers Redis :

- `ttsRequestStore` → Redis avec TTL automatique
- `pregenResumeStore` → Redis avec TTL automatique
- `ttsCache` → Redis avec TTL automatique

Avec Redis, plusieurs processus peuvent lire et écrire dans le même store partagé.
Il faut ensuite valider le comportement sous charge avant d'augmenter le nombre
de conteneurs. Coolify permet d'ajouter un service Redis (**New Resource** → **Redis**).

Cette évolution est une tâche de refactoring estimée à ~2-3h.
