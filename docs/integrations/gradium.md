# Intégrer Gradium TTS dans un projet Node.js/Express

> Guide pratique rédigé après la migration complète d'ElevenLabs → Gradium dans le projet **Dilemme Plastique** (juillet 2026). Chaque section documente non seulement *comment faire* mais *pourquoi* — pour éviter les heures perdues sur des pièges non documentés.

---

## Sommaire

1. [Ce que Gradium propose](#1-ce-que-gradium-propose)
2. [Variables d'environnement requises](#2-variables-denvironnement-requises)
3. [Appel REST minimal](#3-appel-rest-minimal)
4. [Pièges critiques et solutions](#4-pièges-critiques-et-solutions)
   - [4.1 Format audio : WAV uniquement](#41-format-audio--wav-uniquement)
   - [4.2 En-tête WAV streamé : tailles à `0xFFFFFFFF`](#42-en-tête-wav-streamé--tailles-à-0xffffffff)
   - [4.3 Nom du header d'authentification](#43-nom-du-header-dauthentification)
5. [Pool de connexions persistantes (undici)](#5-pool-de-connexions-persistantes-undici)
6. [Warming de connexion](#6-warming-de-connexion)
7. [File d'attente et contrôle de concurrence](#7-file-dattente-et-contrôle-de-concurrence)
8. [Servir l'audio au navigateur](#8-servir-laudio-au-navigateur)
9. [Health check](#9-health-check)
10. [Exemple complet de fonction `generateTtsAudio`](#10-exemple-complet-de-fonction-generatettsaudio)
11. [Checklist d'intégration](#11-checklist-dintégration)

---

## 1. Ce que Gradium propose

- API REST simple, un seul endpoint : `POST https://api.gradium.ai/api/post/speech/tts`
- Synthèse vocale française de bonne qualité avec `json_config: { language: "fr" }`
- Un seul modèle disponible : `"default"` (passer autre chose → erreur 422)
- Latence correcte pour un usage conversationnel (< 2 s pour ~200 mots)
- **Aucun streaming SSE côté Gradium** — la réponse est un buffer WAV complet

---

## 2. Variables d'environnement requises

```env
GRADIUM_API_KEY=votre_clé_gradium
GRADIUM_VOICE_ID=votre_voice_id_gradium

# Optionnel — tuning charge
GRADIUM_MAX_CONCURRENT=5
GRADIUM_MAX_QUEUED=100
```

> **Ne jamais hard-coder le voice ID.** Utilisez toujours `process.env.GRADIUM_VOICE_ID`. Le voice ID est lié à un compte et peut changer.

---

## 3. Appel REST minimal

```typescript
const response = await fetch('https://api.gradium.ai/api/post/speech/tts', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': process.env.GRADIUM_API_KEY!,   // ← voir §4.3
  },
  body: JSON.stringify({
    text: 'Bonjour, je suis Peter.',
    voice_id: process.env.GRADIUM_VOICE_ID!,
    model_name: 'default',          // seule valeur supportée
    output_format: 'wav',           // ← voir §4.1 — ne pas mettre 'mp3'
    only_audio: true,
    json_config: { language: 'fr' },
  }),
});

if (!response.ok) throw new Error(`Gradium HTTP ${response.status}`);

const audioBuffer = Buffer.from(await response.arrayBuffer());
// ← appliquer fixWavHeader() ici avant de servir (voir §4.2)
```

---

## 4. Pièges critiques et solutions

### 4.1 Format audio : WAV uniquement

**Symptôme** : `output_format: "mp3"` → Gradium retourne **HTTP 200 avec body vide** (0 octet). Aucune erreur, aucun message — silence total.

**Cause** : le format MP3 n'est pas implémenté côté Gradium à la date de juillet 2026 malgré l'absence d'erreur explicite dans la réponse.

**Solution** : toujours utiliser `output_format: "wav"`. Servir l'audio avec `Content-Type: audio/wav`.

```typescript
// ✅ Correct
output_format: 'wav'

// ❌ Retourne un body vide sans erreur HTTP
output_format: 'mp3'
```

---

### 4.2 En-tête WAV streamé : tailles à `0xFFFFFFFF`

C'est le piège le plus insidieux. **L'audio est parfaitement lisible** — mais le séquencement de votre file audio est cassé.

**Symptôme** : les phrases de l'assistant se superposent, se mélangent, ne correspondent pas au texte affiché. L'événement `ended` du `<audio>` est peu fiable ou jamais déclenché.

**Cause** : Gradium envoie le WAV en mode streaming HTTP, avec les champs de taille d'en-tête à la valeur placeholder `0xFFFFFFFF`. Les navigateurs lisent ces champs pour calculer `audio.duration`. Avec `Infinity` comme durée, les événements `ended` sont unreliables.

**Diagnostic** : inspecter les 44 premiers octets du buffer reçu :
```
RIFF ff ff ff ff WAVE fmt  ... data ff ff ff ff ...
          ↑ placeholder                ↑ placeholder
```

**Solution** : réécrire les tailles en place côté serveur, après avoir reçu le buffer complet :

```typescript
/**
 * Gradium streame le WAV avec des tailles placeholder (0xFFFFFFFF).
 * Sans correction, audio.duration = Infinity → séquencement cassé.
 * Réécrit RIFF size et data size avec les vraies longueurs.
 */
function fixWavHeader(buf: Buffer): void {
  if (buf.byteLength < 44) return;
  if (buf.toString('ascii', 0, 4) !== 'RIFF') return;
  if (buf.toString('ascii', 8, 12) !== 'WAVE') return;

  // RIFF chunk size = taille totale - 8 (les 4 octets "RIFF" + 4 octets de taille elle-même)
  buf.writeUInt32LE(buf.byteLength - 8, 4);

  // Parcourir les sous-chunks pour trouver "data"
  let offset = 12;
  while (offset + 8 <= buf.byteLength) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    if (chunkId === 'data') {
      buf.writeUInt32LE(buf.byteLength - offset - 8, offset + 4);
      return;
    }
    const chunkSize = buf.readUInt32LE(offset + 4);
    // Taille placeholder ou corrompue → impossible d'avancer
    if (chunkSize === 0xffffffff || chunkSize > buf.byteLength) return;
    offset += 8 + chunkSize + (chunkSize % 2); // word-aligned
  }
}
```

**Appliquer immédiatement après `Buffer.concat(chunks)`** :

```typescript
const audioBuffer = Buffer.concat(chunks);
if (audioBuffer.byteLength === 0) throw new Error('Gradium: buffer vide');
fixWavHeader(audioBuffer); // ← ne pas oublier cette ligne
```

> **Règle absolue** : toujours appliquer `fixWavHeader()` avant de servir ou de mettre en cache le buffer. Ne jamais servir le WAV brut de Gradium directement au navigateur.

---

### 4.3 Nom du header d'authentification

**Symptôme** : HTTP 401 ou 403 sur toutes les requêtes.

**ElevenLabs** utilise `xi-api-key`. **Gradium** utilise `x-api-key`. Si vous migrez depuis ElevenLabs, vous aurez probablement le mauvais header.

```typescript
// ✅ Gradium
headers: { 'x-api-key': process.env.GRADIUM_API_KEY! }

// ❌ ElevenLabs (ne pas utiliser avec Gradium)
headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! }
```

---

## 5. Pool de connexions persistantes (undici)

Pour un usage en production (plusieurs utilisateurs simultanés), réutilisez les connexions TCP avec undici. Sans pool, chaque requête TTS ouvre et ferme une connexion → latence inutile (~50-100ms par requête).

```typescript
// server/gradium-agent.ts
import { Agent, fetch as undiciFetch } from 'undici';

const gradiumAgent = new Agent({
  keepAliveTimeout: 35_000,      // ferme les connexions inactives après 35s
  keepAliveMaxTimeout: 300_000,  // durée de vie maximale : 5 min
});

// Fermeture propre
process.once('SIGTERM', () => gradiumAgent.close());
process.once('SIGINT', () => gradiumAgent.close());

export function gradiumFetch(
  url: string,
  options?: Parameters<typeof undiciFetch>[1]
): ReturnType<typeof undiciFetch> {
  return undiciFetch(url, { ...options, dispatcher: gradiumAgent });
}
```

Remplacez ensuite tous vos `fetch(...)` vers Gradium par `gradiumFetch(...)`.

---

## 6. Warming de connexion

Sans warming, la première requête après un idle ouvre une nouvelle connexion TCP → pic de latence visible. Le warming envoie une requête minimale toutes les 30 s pour maintenir la connexion vivante.

```typescript
// server/index.ts — dans votre fonction de démarrage
if (process.env.GRADIUM_API_KEY) {
  let consecutiveAuthFailures = 0;
  const MAX_AUTH_FAILURES = 5;

  const warmGradiumConnection = async () => {
    try {
      const response = await gradiumFetch('https://api.gradium.ai/api/post/speech/tts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.GRADIUM_API_KEY!,
        },
        body: JSON.stringify({
          text: ' ',
          voice_id: process.env.GRADIUM_VOICE_ID || '',
          output_format: 'wav',
          only_audio: true,
        }),
      });

      if (response.status === 422 || response.ok) {
        consecutiveAuthFailures = 0;
        console.log('[Gradium] Connection kept alive');
      } else if (response.status === 401 || response.status === 403) {
        consecutiveAuthFailures++;
        if (consecutiveAuthFailures >= MAX_AUTH_FAILURES) {
          clearInterval(warmingInterval!);
          console.error('[Gradium] Warming stopped — check GRADIUM_API_KEY');
        }
      }
    } catch (err) {
      console.warn('[Gradium] Warming error:', err);
    }
  };

  // Première connexion après 6s (laisse le temps au serveur de démarrer)
  setTimeout(warmGradiumConnection, 6000);
  const warmingInterval = setInterval(warmGradiumConnection, 30_000);
}
```

> **Note** : une requête avec `text: ' '` renvoie HTTP 422 (validation error — texte vide). C'est normal et intentionnel : cela établit la connexion TCP sans générer de l'audio, et 422 confirme que l'API est joignable et que la clé est valide.

---

## 7. File d'attente et contrôle de concurrence

Sans limite, des pics de charge peuvent saturer l'API Gradium ou votre bande passante. Utilisez une file bornée.

```typescript
// Utiliser BoundedPriorityQueue ou équivalent
const ttsQueue = new BoundedPriorityQueue({
  maxConcurrent: parseInt(process.env.GRADIUM_MAX_CONCURRENT || '5'),
  maxQueued: parseInt(process.env.GRADIUM_MAX_QUEUED || '100'),
});

// Wrapper d'appel
async function enqueueTts(text: string, priority: 'high' | 'normal' | 'background' = 'normal') {
  return ttsQueue.enqueue(() => generateTtsAudio(text), { priority });
}
```

Variables d'environnement de tuning (à documenter dans `.env.example`) :

| Variable | Défaut | Rôle |
|---|---|---|
| `GRADIUM_MAX_CONCURRENT` | `5` | Requêtes Gradium simultanées |
| `GRADIUM_MAX_QUEUED` | `100` | Taille max de la file d'attente |

---

## 8. Servir l'audio au navigateur

```typescript
// Express — endpoint de lecture audio
app.get('/api/audio/:token', async (req, res) => {
  const audioBuffer = getFromCache(req.params.token); // votre cache
  if (!audioBuffer) return res.status(404).end();

  res.set({
    'Content-Type': 'audio/wav',           // ← toujours wav
    'Content-Length': audioBuffer.byteLength,
    'Cache-Control': 'private, max-age=60',
    'Accept-Ranges': 'none',               // désactiver range requests (buffer complet)
  });
  res.send(audioBuffer);
});
```

**Côté client** :

```typescript
const response = await fetch('/api/audio/' + token);
if (!response.ok) throw new Error('Audio fetch failed');
const blob = await response.blob();
const url = URL.createObjectURL(blob);
const audio = new Audio(url);
await audio.play();
audio.addEventListener('ended', () => {
  URL.revokeObjectURL(url);
  playNext(); // votre file de lecture séquentielle
});
```

> Grâce à `fixWavHeader()`, `audio.duration` est maintenant une valeur finie (ex: `2.08`) → l'événement `ended` se déclenche de manière fiable → les phrases se jouent dans l'ordre.

---

## 9. Health check

```typescript
app.get('/api/health/ai', async (_req, res) => {
  let gradiumStatus = 'unknown';
  try {
    const resp = await gradiumFetch('https://api.gradium.ai/api/post/speech/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.GRADIUM_API_KEY || '' },
      body: JSON.stringify({ text: '', voice_id: process.env.GRADIUM_VOICE_ID || '', output_format: 'wav', only_audio: true }),
    });
    // 422 = API joignable, erreur de validation (texte vide) — c'est OK
    gradiumStatus = (resp.ok || resp.status === 422) ? 'ok' : `error_${resp.status}`;
  } catch (err) {
    gradiumStatus = 'unreachable';
  }
  res.json({ gradium: gradiumStatus });
});
```

---

## 10. Exemple complet de fonction `generateTtsAudio`

```typescript
import crypto from 'crypto';
import { gradiumFetch } from './gradium-agent';

// Cache simple en mémoire (remplacer par Redis en production multi-instances)
const audioCache = new Map<string, Buffer>();

function fixWavHeader(buf: Buffer): void {
  if (buf.byteLength < 44) return;
  if (buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') return;
  buf.writeUInt32LE(buf.byteLength - 8, 4);
  let offset = 12;
  while (offset + 8 <= buf.byteLength) {
    const chunkId = buf.toString('ascii', offset, offset + 4);
    if (chunkId === 'data') {
      buf.writeUInt32LE(buf.byteLength - offset - 8, offset + 4);
      return;
    }
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkSize === 0xffffffff || chunkSize > buf.byteLength) return;
    offset += 8 + chunkSize + (chunkSize % 2);
  }
}

export async function generateTtsAudio(text: string): Promise<Buffer> {
  const GRADIUM_API_KEY = process.env.GRADIUM_API_KEY;
  const GRADIUM_VOICE_ID = process.env.GRADIUM_VOICE_ID;

  if (!GRADIUM_API_KEY) throw new Error('GRADIUM_API_KEY non configurée');
  if (!GRADIUM_VOICE_ID) throw new Error('GRADIUM_VOICE_ID non configuré');

  // Cache par contenu
  const cacheKey = crypto.createHash('md5').update(`gradium:${text}`).digest('hex');
  const cached = audioCache.get(cacheKey);
  if (cached) return cached;

  const response = await gradiumFetch('https://api.gradium.ai/api/post/speech/tts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': GRADIUM_API_KEY,
    },
    body: JSON.stringify({
      text,
      voice_id: GRADIUM_VOICE_ID,
      model_name: 'default',
      output_format: 'wav',        // ← NE PAS utiliser 'mp3'
      only_audio: true,
      json_config: { language: 'fr' },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Gradium TTS HTTP ${response.status}: ${body.slice(0, 200)}`);
  }

  const chunks: Buffer[] = [];
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Gradium: pas de body lisible');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(Buffer.from(value));
  }

  const audioBuffer = Buffer.concat(chunks);
  if (audioBuffer.byteLength === 0) throw new Error('Gradium: buffer vide (format mp3 utilisé ?)');

  fixWavHeader(audioBuffer); // ← OBLIGATOIRE — corrige les tailles placeholder

  audioCache.set(cacheKey, audioBuffer);
  return audioBuffer;
}
```

---

## 11. Checklist d'intégration

Avant de pousser en production, vérifier chaque point :

- [ ] `GRADIUM_API_KEY` et `GRADIUM_VOICE_ID` configurés en secrets (jamais dans le code)
- [ ] `output_format: 'wav'` — jamais `'mp3'`
- [ ] `fixWavHeader()` appliqué sur chaque buffer avant mise en cache ou réponse HTTP
- [ ] Header HTTP `'x-api-key'` — pas `'xi-api-key'`
- [ ] `model_name: 'default'` — seule valeur supportée
- [ ] Endpoints audio servent `Content-Type: audio/wav`
- [ ] Pool undici configuré (ne pas utiliser `fetch` natif en prod)
- [ ] Warming de connexion actif (ou première requête admissible à être lente)
- [ ] File d'attente bornée (`GRADIUM_MAX_CONCURRENT`, `GRADIUM_MAX_QUEUED`)
- [ ] Health check `/api/health/ai` : HTTP 422 = OK (pas une erreur)
- [ ] Test manuel : `curl -o test.wav` + `ffprobe test.wav` → vérifier que `duration` est finie

---

## Résumé des pièges en une ligne

| Piège | Symptôme | Règle |
|---|---|---|
| `output_format: 'mp3'` | Silence (body vide, HTTP 200) | Toujours `'wav'` |
| Tailles WAV placeholder | Audio superposé, `duration = Infinity` | Toujours appliquer `fixWavHeader()` |
| `xi-api-key` au lieu de `x-api-key` | HTTP 401/403 | Header Gradium = `x-api-key` |
| `model_name` incorrect | HTTP 422 | Toujours `'default'` |
| Pas de pool undici | Latence élevée sous charge | Utiliser `gradiumFetch` + `Agent` |
| HTTP 422 interprété comme erreur | Faux négatif health check | 422 = API joignable (texte invalide) |
