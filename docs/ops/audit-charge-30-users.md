# Audit de charge — 30 connexions simultanées sur Replit autoscale

> Réalisé le 12 juin 2026. Basé sur une revue statique du code source et de la configuration.

---

## Contexte

L'application Dilemme est déployée sur Replit en mode **autoscale** (un seul conteneur Node.js / Express). Elle gère :
- Des flux SSE (Server-Sent Events) pour le streaming GPT via l'OpenAI Assistant API
- Des appels TTS vers ElevenLabs (synthèse vocale, ~1-3s/appel)
- Des WebSockets relayés vers Deepgram (transcription live)
- Une base PostgreSQL Neon serverless via Drizzle ORM
- Des caches et queues de concurrence entièrement en mémoire

L'objectif est de déterminer si le déploiement actuel tient sans bug ni rupture pour **30 élèves simultanés**.

---

## Architecture de concurrence actuelle

### Queues applicatives (en mémoire, globales au process)

| Composant | Concurrence max | File d'attente max | Source |
|-----------|-----------------|-------------------|--------|
| ElevenLabs TTS | `ELEVENLABS_MAX_CONCURRENT` (défaut **5**) | `ELEVENLABS_MAX_QUEUED` (défaut 100) | `server/routes.ts:55-58` |
| OpenAI chat streams | `OPENAI_MAX_CONCURRENT_STREAMS` (défaut **10**) | `OPENAI_MAX_QUEUED_STREAMS` (défaut 30) | `server/routes.ts:63-64` |
| Chat turn / session | 1 tour actif par session | Bloquant (rejet immédiat si conflit) | `server/chat-turn-control.ts` |
| Deepgram WebSocket | 100 total, 1 par session | — | `server/deepgramRelay.ts:12-13` |
| Resume pregen | 1 concurrent | 0 en queue | `server/routes.ts:59-62` |

### Rate limiters

| Limiteur | Seuil | Fenêtre | Clé |
|----------|-------|---------|-----|
| Général (`/api/*`) | 300 req | 15 min | session token → IP fallback |
| TTS | 60 req | 15 min | session token |
| STT | 60 req | 15 min | session token |
| Auth brute-force | 10 échecs | 1 min | (IP, sessionId) |

---

## Problèmes identifiés

### 🔴 CRITIQUE — Pool PostgreSQL sans `max` configuré

**Fichier** : `server/db.ts`

```ts
// État actuel — dangereux
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```

Le pool `@neondatabase/serverless` n'a pas de paramètre `max` explicite. Sa valeur par défaut est **10 connexions**.

Avec 30 utilisateurs simultanés, chaque échange chat génère en cascade :
- `getSession()` (auth Deepgram WS + routes)
- `addMessage()` (sauvegarde STT transcript)
- `updateSession()` × 2-3 (foundClues, score, messageCount)
- `googleSheetsSync.upsertSessionRow()` (fire-and-forget mais consomme une connexion)

Pic estimé : **30-40 connexions simultanées** → dépassement systématique du pool → les requêtes s'accumulent en attente → timeouts aléatoires, erreurs 500 silencieuses.

**Correction** :
```ts
import { positiveIntFromEnv } from "./request-limiter";
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: positiveIntFromEnv('DB_POOL_MAX', 30),
});
```

---

### 🔴 CRITIQUE — ElevenLabs : 5 slots TTS pour 30 élèves simultanés

**Fichier** : `server/routes.ts`, ligne 55-58

Avec `ELEVENLABS_MAX_CONCURRENT = 5` et des appels TTS de 1-3s :

| Élève en queue | Attente estimée |
|----------------|----------------|
| Positions 1-5 | 0s (immédiat) |
| Positions 6-10 | +2-4s |
| Positions 11-20 | +5-10s |
| Positions 21-30 | **+10-20s** |

Lors d'un passage de classe synchronisé (le prof donne la consigne, tous les élèves parlent), les 25 derniers élèves à soumettre attendent presque 20 secondes après la fin du GPT avant d'entendre la réponse. C'est perçu comme un bug ou un gel.

La file de 100 évite tout rejet silencieux, mais la latence est très visible.

**Correction** (env var, sans changement de code) :
- Vérifier le plan ElevenLabs souscrit (Creator = 5 concurrent, Scale = 10+)
- Définir `ELEVENLABS_MAX_CONCURRENT=10` dans les secrets Replit si le plan le permet

---

### 🟠 ÉLEVÉ — OpenAI : timeout de queue trop court (15s)

**Fichier** : `server/routes.ts`, ligne 65

```ts
const OPENAI_QUEUE_WAIT_TIMEOUT_MS = positiveIntFromEnv('OPENAI_QUEUE_WAIT_TIMEOUT_MS', 15_000);
```

Avec 10 streams simultanés max et 30 utilisateurs envoyant simultanément, les positions 11-30 entrent en queue. Chaque stream GPT dure 8-20s. Les élèves aux positions 21-30 attendent :
- Délai queue = (21-10) × ~12s / 10 ≈ **13-16s** d'attente avant même que GPT démarre

Ce délai dépasse le timeout de 15s → `ChatAdmissionTimeoutError` → erreur affichée à l'élève.

**Correction** :
```ts
const OPENAI_QUEUE_WAIT_TIMEOUT_MS = positiveIntFromEnv('OPENAI_QUEUE_WAIT_TIMEOUT_MS', 30_000);
```
Et env var recommandée : `OPENAI_MAX_QUEUED_STREAMS=60` pour absorber la simultanéité.

---

### 🟠 ÉLEVÉ — TTS cache trop petit, thrashing garanti

**Fichier** : `server/routes.ts`, ligne 174

```ts
const TTS_CACHE_MAX_SIZE = 100;
```

Calcul réaliste pour une session de classe :
- 30 élèves × ~8-10 phrases générées par Peter = **240-300 entrées**
- Le cache sature à 100 → éviction LRU → les premières phrases ne sont plus en cache
- Résultat : le cache n'a aucun effet utile pour les élèves en deuxième moitié de session

**Correction** :
```ts
const TTS_CACHE_MAX_SIZE = 300;
```

---

### 🟠 MOYEN — HTTP `keepAliveTimeout` non configuré

**Fichier** : `server/index.ts`, autour de `server.listen()`

Node.js par défaut : `keepAliveTimeout = 5 000 ms`, `headersTimeout = 60 000 ms`.

Le reverse proxy de Replit (et tout proxy HTTP standard) maintient des connexions persistantes plus longtemps. Si le proxy envoie une nouvelle requête sur une connexion que Node vient de fermer (race condition), on obtient un `ECONNRESET` ou un 502 côté client. Ce problème est particulièrement visible sur les flux SSE de longue durée (10-45s par échange GPT).

**Correction** (dans `server/index.ts`, après `server.listen(...)`) :
```ts
server.keepAliveTimeout = 65_000;   // > timeout du proxy Replit (~60s)
server.headersTimeout = 66_000;     // doit être > keepAliveTimeout
```

---

## Ce qui fonctionne correctement ✅

| Composant | Pourquoi c'est bien géré |
|-----------|--------------------------|
| Deepgram WS | Max 100 total, 1/session → 30 users = 30 sockets, bien en dessous |
| ElevenLabs queue backlog | 100 en attente → pas de drop à 30 users |
| Chat turn controller | Empêche le double-envoi par session |
| Rate limiter par session | Crucial pour un classroom derrière le même NAT/IP |
| Auth brute-force | 10 échecs/min/IP par sessionId |
| Multer audio upload | 2 MB max, memory storage → ~60 MB peak à 30 users simultanés |
| Connection warming | OpenAI + ElevenLabs toutes les 30s → réduit la latence first-request |
| Graceful shutdown | SIGTERM/SIGINT → flush PostHog avant exit |
| In-memory state | Autoscale = 1 seul conteneur → queues globalement cohérentes |
| Google Sheets sync | Fire-and-forget, dans les limites API (~300 req/min) |
| Mémoire audio | ~50-200 KB/buffer × 30 users = ~6 MB max → négligeable |

---

## Limites architecturales à documenter

### Replit autoscale = processus unique
Replit autoscale **ne fait pas** de scaling horizontal automatique (pas de spawn de réplicas parallèles). Un seul conteneur Node.js sert toutes les requêtes. C'est un avantage pour la cohérence des Maps en mémoire, mais un plafond absolu de charge.

### Neon serverless — connexions poolées à distance
Le pool Neon utilise des WebSockets pour chaque connexion DB (via le driver `neonConfig.webSocketConstructor = ws`). Chaque ouverture de WebSocket a une latency d'établissement (~50-150ms). Configurer `max` au bon niveau évite cette latence de pool-establishment sous charge.

### State in-memory — pas de survie au redémarrage
Rate limiters, TTS cache, pregen store, unauthorized events, pool stats d'ElevenLabs : tout est perdu au redémarrage. Implications :
- Après un redémarrage de Replit, les 30 premiers élèves paient la latence TTS complète (pas de cache chaud)
- Un utilisateur qui avait atteint sa limite de rate peut contourner via redémarrage (acceptable en contexte scolaire)

---

## Plan de correction (Tâche #37)

| Priorité | Fichier | Changement | Env var associée |
|----------|---------|-----------|-----------------|
| 🔴 1 | `server/db.ts` | Ajouter `max: positiveIntFromEnv('DB_POOL_MAX', 30)` | `DB_POOL_MAX=30` |
| 🔴 2 | `server/routes.ts` | `TTS_CACHE_MAX_SIZE` : 100 → 300 | — |
| 🟠 3 | `server/index.ts` | `keepAliveTimeout = 65_000`, `headersTimeout = 66_000` | — |
| 🟠 4 | `server/routes.ts` | `OPENAI_QUEUE_WAIT_TIMEOUT_MS` défaut : 15 000 → 30 000 | `OPENAI_QUEUE_WAIT_TIMEOUT_MS=30000` |
| 🟠 5 | Docs + Replit env | Documentation env vars + réglage manuel | voir ci-dessous |

### Env vars recommandées à configurer dans Replit Secrets

```
DB_POOL_MAX=30
ELEVENLABS_MAX_CONCURRENT=10      # selon plan ElevenLabs (Creator=5, Scale=10+)
OPENAI_MAX_CONCURRENT_STREAMS=20  # permet 20 élèves simultanés sans queue
OPENAI_MAX_QUEUED_STREAMS=60      # absorbe 60 élèves supplémentaires en attente
OPENAI_QUEUE_WAIT_TIMEOUT_MS=30000
```

---

## Estimation de capacité après corrections

| Scénario | Avant corrections | Après corrections |
|----------|-----------------|-----------------|
| 10 élèves simultanés | ✅ OK | ✅ OK |
| 30 élèves simultanés | ⚠️ DB pool overflow + TTS latency pic | ✅ OK avec env vars ci-dessus |
| 50 élèves simultanés | ❌ DB crash + erreurs GPT timeout | ⚠️ Faisable mais ElevenLabs reste le goulot |
| > 50 élèves | ❌ Nécessite architecture multi-process | ❌ Hors périmètre Replit autoscale |
