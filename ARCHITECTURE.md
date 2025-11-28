# Architecture du Système de Conversation Vocale

## 🚀 Améliorations v1.3.0 - Persistance & Feedback

### Vue d'Ensemble Base de Données

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           ARCHITECTURE v1.3.0                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────────────────────┐   │
│  │   CLIENT    │────▶│   SERVER    │────▶│      PostgreSQL (Neon)      │   │
│  │   (React)   │     │  (Express)  │     │  ┌─────────────────────────┐ │   │
│  └─────────────┘     └──────┬──────┘     │  │  tutorial_sessions      │ │   │
│                             │            │  │  conversation_messages  │ │   │
│                             │            │  │  feedback_surveys       │ │   │
│                             ▼            │  └─────────────────────────┘ │   │
│                      ┌─────────────┐     └─────────────────────────────────┘ │
│                      │ Google      │                                         │
│                      │ Sheets API  │◀─── Sync automatique                   │
│                      └─────────────┘     (sessions + feedbacks)             │
│                                                                               │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Schéma de Base de Données

**Fichier**: `shared/schema.ts`

```typescript
// Table des sessions de tutoriel
tutorialSessions = {
  id: varchar (PK, UUID auto-généré),
  userName: text (NOT NULL),
  foundClues: jsonb (array de strings, défaut []),
  score: integer (défaut 0),
  audioMode: text ('voice' | 'text', défaut 'voice'),
  completed: integer (0 ou 1),
  threadId: text (ID thread OpenAI),
  finalSynthesis: text (synthèse générée par IA),
  messageCount: integer (défaut 0),
  upvotes: integer (défaut 0),
  completedAt: timestamp,
  createdAt: timestamp (auto)
}

// Table des messages de conversation
conversationMessages = {
  id: varchar (PK, UUID auto-généré),
  sessionId: varchar (FK vers tutorialSessions),
  role: text ('user' | 'assistant'),
  content: text (NOT NULL),
  detectedClue: text (nullable),
  createdAt: timestamp (auto)
}

// Table des feedbacks utilisateurs
feedbackSurveys = {
  id: varchar (PK, UUID auto-généré),
  sessionId: varchar (FK),
  userName: text,

  // Notes 1-6
  scenarioComprehension: integer,
  scenarioObjectives: integer,
  scenarioClueLink: integer,
  gameplayExplanation: integer,
  gameplaySimplicity: integer,
  gameplayBotResponses: integer,
  feelingOriginality: integer,
  feelingPleasant: integer,
  feelingInteresting: integer,
  motivationContinue: integer,
  motivationGameplay: integer,
  motivationEcology: integer,
  interfaceVisualBeauty: integer,
  interfaceVisualClarity: integer,
  interfaceVoiceChat: integer,
  overallRating: integer,

  // Champs supplémentaires
  improvements: text,
  wantsUpdates: boolean,
  updateEmail: text,
  wouldRecommend: boolean,
  wantsInSchool: boolean,

  createdAt: timestamp (auto)
}
```

### Google Sheets Sync

**Fichier**: `server/google-sheets-sync.ts`

```
┌──────────────────────────────────────────────────────────────────────┐
│                     GOOGLE SHEETS SYNC FLOW                           │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  1. AUTHENTIFICATION (via Replit Connectors)                         │
│     ├─ Récupère access_token depuis REPLIT_CONNECTORS_HOSTNAME       │
│     ├─ Token auto-renouvelé via OAuth2                               │
│     └─ Cache local pour éviter appels répétés                        │
│                                                                        │
│  2. DÉTECTION DYNAMIQUE                                               │
│     ├─ getSpreadsheetId() - Récupère ID depuis connecteur            │
│     ├─ getFirstSheetName() - Détecte nom de la première feuille      │
│     └─ Quotes autour du nom (gère espaces/caractères spéciaux)       │
│                                                                        │
│  3. SYNC SESSIONS                                                      │
│     ├─ appendSession(session) - Nouvelle ligne                       │
│     └─ updateSession(session) - Mise à jour ligne existante          │
│                                                                        │
│  4. SYNC FEEDBACKS                                                     │
│     └─ appendFeedback(feedback) - Nouvelle ligne                     │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

**Colonnes Google Sheets (Sessions):**
| Colonne | Champ |
|---------|-------|
| A | Session ID |
| B | User Name |
| C | Score |
| D | Found Clues |
| E | Completed |
| F | Audio Mode |
| G | Message Count |
| H | Created At |
| I | Final Synthesis |

**Colonnes Google Sheets (Feedbacks):**
| Colonne | Champ |
|---------|-------|
| A | Feedback ID |
| B | Session ID |
| C-H | Scenario (3) + Gameplay (3) |
| I-N | Feeling (3) + Motivation (3) |
| O-Q | Interface (3) |
| R | Overall Rating |
| S | Improvements |
| T-W | Booleans (updates, recommend, school) |

### Endpoints API v1.3.0

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/feedback` | POST | Créer un feedback |
| `/api/feedback/:sessionId` | GET | Récupérer feedback |
| `/api/syntheses` | GET | Liste synthèses publiques |
| `/api/syntheses/:id/upvote` | PATCH | Voter pour synthèse |
| `/api/health/sheets/test` | GET | Tester connexion Google Sheets |

### Formulaire Feedback (Typeform-style)

**Fichier**: `client/src/components/FeedbackSurvey.tsx`

```
┌──────────────────────────────────────────────────────────────────────┐
│                     FEEDBACK SURVEY FLOW                              │
├──────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  Question 1/20  ───────────────────────────  [████████░░] 40%        │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                        Scénario                                 │  │
│  │                                                                  │  │
│  │  L'histoire est facile à comprendre.                           │  │
│  │                                                                  │  │
│  │  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐                          │  │
│  │  │ 1 │ │ 2 │ │ 3 │ │ 4 │ │ 5 │ │ 6 │                          │  │
│  │  └───┘ └───┘ └───┘ └───┘ └───┘ └───┘                          │  │
│  │  Pas                            Tout                            │  │
│  │  du tout                        à fait                          │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ◀ Précédent                                    Suivant ▶            │
│                                                                        │
└──────────────────────────────────────────────────────────────────────┘
```

**Catégories de questions:**
1. **Scénario** (3 questions) - Compréhension, Objectifs, Lien indices
2. **Gameplay** (3 questions) - Explication, Simplicité, Réponses bot
3. **Feeling** (3 questions) - Originalité, Plaisant, Intéressant
4. **Motivation** (3 questions) - Envie continuer, Motivant, Thème éco
5. **Interface** (3 questions) - Visuel joli, Visuel clair, Voix agréable
6. **Note globale** (1 question) - Note du tutoriel
7. **Améliorations** (texte libre)
8. **Oui/Non** (3 questions) - Contact, Recommandation, École

---

## 🚀 Améliorations v1.2.0 - Optimisations Latence Majeure

### Overview des Optimisations
La version 1.2.0 apporte des **améliorations architecturales majeures** qui réduisent la latence conversationnelle de **6-11 secondes**!

**Phase 1 - Quick Wins (2-4s):**
- TTS Response Caching (MD5 + LRU)
- API Connection Warming (OpenAI keepalive 30s)
- DNS Prefetch/Preconnect (api.openai.com, api.elevenlabs.io)
- Smart Audio Keepalive (2s → 5s, -60% overhead)

**Phase 2 - Streaming Architecture (4-7s):**
- LLM Sentence Streaming (SSE progressive)
- ElevenLabs Streaming TTS (audio chunks)
- Audio Queue Manager (lecture séquentielle)
- Progressive UI (ChatGPT-style display)

📖 **Documentation complète:**
- [PHASE1_OPTIMIZATIONS.md](./PHASE1_OPTIMIZATIONS.md) - Guide détaillé Phase 1
- [PHASE2_OPTIMIZATIONS.md](./PHASE2_OPTIMIZATIONS.md) - Guide détaillé Phase 2

### Architecture Streaming (Phase 2)

**Flux Avant (Séquentiel):**
```
User → STT (2-7s) → [WAIT] → LLM (3-8s) → [WAIT] → TTS (1-3s) → Play
Total: 7-20 secondes
```

**Flux Après (Parallèle):**
```
User → STT (2-7s) → LLM Sentence 1 (1s) ┬→ TTS 1 (0.3s) → Play (IMMEDIATE!)
                                        ├→ TTS 2 (0.3s) → Queue
                                        └→ TTS 3 (0.3s) → Queue

User entend la réponse à ~3.3s (vs 7s avant)
```

**Key Features:**
- **Server-Sent Events (SSE):** Streaming LLM responses sentence-by-sentence
- **Parallel Processing:** TTS starts while LLM still generating
- **Audio Queue:** Sequential playback of sentence chunks
- **Cache Integration:** Phase 1 cache still active for repeated phrases

### Endpoints Phase 2

**Nouveaux endpoints streaming:**
```
POST /api/chat/stream          # SSE streaming LLM (sentence-by-sentence)
POST /api/text-to-speech/stream # ElevenLabs streaming TTS
```

**Endpoints legacy (fallback):**
```
POST /api/chat                 # Non-streaming LLM (toujours disponible)
POST /api/text-to-speech       # Non-streaming TTS (avec cache Phase 1)
```

---

## 🆕 Améliorations v1.1.0 - Robustesse Mobile

### Problèmes Résolus
La version 1.1.0 apporte des corrections critiques pour garantir la fiabilité du flux audio sur mobile.

#### 1. Flux Audio Bloqué Après Première Interaction
**Symptôme** : Peter ne parlait plus après la première conversation, particulièrement sur Safari iOS.

**Causes Identifiées** :
- Blobs audio vides ou invalides non détectés
- Éléments `<audio>` non nettoyés entre les lectures
- États bloqués sans mécanisme de récupération
- Timeouts trop courts pour connexions mobiles lentes
- Audio play() appelé sans attendre le chargement

**Solutions Implémentées** :

```typescript
// 1. Validation des blobs audio (client/src/lib/api.ts:74-78)
const blob = await response.blob();
if (!blob || blob.size === 0) {
  throw new Error('Received empty or invalid audio blob from server');
}

// 2. Validation côté serveur (server/routes.ts:161-165)
const audioBuffer = await response.arrayBuffer();
if (audioBuffer.byteLength === 0) {
  throw new Error('Received empty audio from ElevenLabs');
}

// 3. Nettoyage de l'Audio element (client/src/hooks/useVoiceInteraction.ts:199-210)
if (audioElementRef.current) {
  audioElementRef.current.pause();
  audioElementRef.current.src = '';
  audioElementRef.current.load();  // Force cleanup
  audioElementRef.current = null;
}

// 4. Pré-chargement et attente readyState (client/src/hooks/useVoiceInteraction.ts:215-221)
const audio = new Audio();
audio.preload = 'auto';
audio.volume = 1.0;
audio.src = audioUrl;
audio.load();

// 5. Attente de l'événement canplay (client/src/hooks/useVoiceInteraction.ts:356-375)
if (audio.readyState >= 2) {
  attemptPlay();
} else {
  audio.addEventListener('canplay', () => {
    attemptPlay();
  }, { once: true });
}

// 6. Détection de blocage (client/src/components/TutorialScreen.tsx:323-330)
const startTimeoutId = setTimeout(() => {
  if (audioState === 'playing' && !isAudioPlaying) {
    console.warn('Audio stuck - recovering');
    stopAudio();
    recoverFromError();
  }
}, 5000);

// 7. Timeouts améliorés (client/src/components/TutorialScreen.tsx:310)
const safetyTimeout = estimatedDuration + 10000; // +10s au lieu de +5s
```

#### 2. Bouton "Rejouer le Tutoriel"
**Problème** : Le bouton retournait à l'écran tutoriel au lieu de l'écran de titre.

**Solution** :
```typescript
// client/src/pages/Home.tsx:52-63
const handleReplay = async () => {
  // Réinitialisation complète
  setUserName('');
  setSessionId('');
  setScore(0);
  setFoundClues([]);

  // Retour à l'écran de titre (au lieu de 'tutorial')
  setCurrentScreen('title');
};
```

### Impact
- **Fiabilité** : Flux audio fonctionne de manière cohérente sur mobile
- **Robustesse** : Récupération automatique en cas de blocage
- **UX** : Expérience utilisateur cohérente sur tous les appareils

---

## 📐 Schéma d'Architecture Globale

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React/TypeScript)                │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌────────────────┐     ┌──────────────────────────────────┐   │
│  │ VoiceInteraction│────▶│ useVoiceInteraction Hook         │   │
│  │   Component     │     │  - MediaRecorder API             │   │
│  │                 │     │  - Audio State Management        │   │
│  └────────────────┘     └──────────────────────────────────┘   │
│         │                          │                             │
│         │                          │                             │
│         ▼                          ▼                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │           Audio Recording (WebM format)                   │   │
│  │   • echoCancellation: true                               │   │
│  │   • noiseSuppression: true                               │   │
│  │   • sampleRate: 44100                                    │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           │ FormData (audio.webm)
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVER (Express/Node.js)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 1: SPEECH-TO-TEXT (STT)                           │   │
│  │  Route: POST /api/speech-to-text                        │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │                                                     │ │   │
│  │  │  1. Receive audio.webm via multer                 │ │   │
│  │  │  2. Convert to File object                        │ │   │
│  │  │  3. Send to OpenAI Whisper API                    │ │   │
│  │  │     - Model: whisper-1                            │ │   │
│  │  │     - Language: fr (français)                     │ │   │
│  │  │  4. Return transcribed text                       │ │   │
│  │  │                                                     │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          │ text: "l'utilisateur a dit..."       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 2: GESTION DE CONVERSATION (LLM)                  │   │
│  │  Route: POST /api/chat                                  │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │                                                     │ │   │
│  │  │  1. Receive { sessionId, userMessage }            │ │   │
│  │  │  2. Load session from storage (MemStorage)        │ │   │
│  │  │  3. Detect clues in user message                  │ │   │
│  │  │  4. Save user message to conversation history     │ │   │
│  │  │                                                     │ │   │
│  │  │  5. Prepare context for LLM:                      │ │   │
│  │  │     ┌─────────────────────────────────────────┐   │ │   │
│  │  │     │  SYSTEM PROMPT                          │   │ │   │
│  │  │     │  ├─ Persona: "Peter" AI éducatif       │   │ │   │
│  │  │     │  ├─ Context: indices trouvés            │   │ │   │
│  │  │     │  ├─ Rules: réponses courtes 1-2 phrases│   │ │   │
│  │  │     │  └─ Behavior: encourageant, positif    │   │ │   │
│  │  │     └─────────────────────────────────────────┘   │ │   │
│  │  │     ┌─────────────────────────────────────────┐   │ │   │
│  │  │     │  CONVERSATION HISTORY                   │   │ │   │
│  │  │     │  └─ Last 6 messages (sliding window)   │   │ │   │
│  │  │     └─────────────────────────────────────────┘   │ │   │
│  │  │                                                     │ │   │
│  │  │  6. Call OpenAI Assistant API:                    │ │   │
│  │  │     - Assistant ID: asst_P9b5PxMd1k9HjBgbyXI1Cvm9 │ │   │
│  │  │     - Model: gpt-4o-mini                          │ │   │
│  │  │     - Maintains thread for context               │ │   │
│  │  │                                                     │ │   │
│  │  │  7. Save assistant response to history            │ │   │
│  │  │  8. Update session (found clues, score)           │ │   │
│  │  │  9. Return response                                │ │   │
│  │  │                                                     │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
│                          │ response: "Bravo! ADN trouvé!"       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  STEP 3: TEXT-TO-SPEECH (TTS)                          │   │
│  │  Route: POST /api/text-to-speech                       │   │
│  │  ┌────────────────────────────────────────────────────┐ │   │
│  │  │                                                     │ │   │
│  │  │  1. Receive { text }                              │ │   │
│  │  │  2. Validate text not empty                       │ │   │
│  │  │  3. Call ElevenLabs API                           │ │   │
│  │  │     - Voice ID: CBP9p4KAWPqrMHTDtWPR              │ │   │
│  │  │     - Model: eleven_multilingual_v2               │ │   │
│  │  │     - Stability: 0.5                              │ │   │
│  │  │     - Similarity boost: 0.75                      │ │   │
│  │  │  4. Validate audio not empty                      │ │   │
│  │  │  5. Return audio/mpeg stream                      │ │   │
│  │  │                                                     │ │   │
│  │  └────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────┘   │
│                          │                                       │
└──────────────────────────┼───────────────────────────────────────┘
                           │
                           │ audio/mpeg Blob
                           ▼
┌─────────────────────────────────────────────────────────────────┐
│                         CLIENT (React/TypeScript)                │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Audio Playback                                          │   │
│  │  1. Validate blob                                        │   │
│  │  2. Cleanup previous audio element                       │   │
│  │  3. Create new Audio element                             │   │
│  │  4. Configure (preload, volume)                          │   │
│  │  5. Set src and load()                                   │   │
│  │  6. Wait for readyState or canplay event                 │   │
│  │  7. Call play()                                           │   │
│  │  8. Display Peter avatar with animation                  │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔄 Flux de Données Détaillé

### 1️⃣ SPEECH-TO-TEXT (STT)

**Fichier**: `server/routes.ts:88-108`

```typescript
POST /api/speech-to-text
├─ Input: FormData with audio.webm file
├─ Processing:
│  ├─ Multer receives file in memory buffer
│  ├─ Convert buffer to File object
│  └─ OpenAI Whisper API call
│     ├─ model: 'whisper-1'
│     ├─ language: 'fr'
│     └─ file: audio.webm
└─ Output: { text: "transcription française" }
```

**Technologies utilisées**:
- OpenAI Whisper : Reconnaissance vocale
- Multer : Gestion fichiers multipart
- WebM : Format audio pour le web

---

### 2️⃣ GESTION DE CONVERSATION (LLM)

**Fichier**: `server/routes.ts:172-342`

```typescript
POST /api/chat
├─ Input: { sessionId, userMessage }
├─ Processing:
│  ├─ Load session state from MemStorage
│  ├─ Detect clues in user message
│  ├─ Save user message to conversation history
│  ├─ OpenAI Assistant API call
│  │  ├─ First message: Create thread
│  │  ├─ Subsequent: Reuse thread
│  │  ├─ Assistant ID: asst_P9b5PxMd1k9HjBgbyXI1Cvm9
│  │  └─ Model: gpt-4o-mini
│  ├─ Save assistant response
│  └─ Update session (clues, score)
└─ Output: { response, detectedClue, foundClues }
```

**Système de Mémoire**:
- MemStorage : Stockage en mémoire RAM (non persistant)
- Thread OpenAI : Maintient contexte conversationnel
- Sliding window : Derniers messages disponibles

**Détection des Indices**:
```typescript
const TARGET_CLUES = [
  { keyword: "ADN", variants: ["adn", "acide désoxyribonucléique", "génétique", "double hélice"] },
  { keyword: "bébé", variants: ["bébé", "bebe", "nourrisson", "enfant", "nouveau-né"] },
  { keyword: "penseur de Rodin", variants: ["penseur", "rodin", "sculpture", "statue penseur"] },
  { keyword: "plastique", variants: ["plastique", "pollution plastique", "déchets plastiques", "pollution"] }
];
```

---

### 3️⃣ TEXT-TO-SPEECH (TTS)

**Fichier**: `server/routes.ts:116-170`

```typescript
POST /api/text-to-speech
├─ Input: { text: "Bravo! Vous avez trouvé l'ADN!" }
├─ Processing:
│  ├─ Validate text not empty
│  └─ ElevenLabs API call
│     ├─ Voice ID: CBP9p4KAWPqrMHTDtWPR (Peter mai 2025 FR)
│     ├─ Model: eleven_multilingual_v2
│     ├─ Stability: 0.5
│     └─ Similarity boost: 0.75
├─ Validate: audio not empty
└─ Output: audio/mpeg stream
```

---

## 🎯 Endpoints API

### POST `/api/speech-to-text`
Transcrit un fichier audio en texte.

**Request:**
```http
POST /api/speech-to-text
Content-Type: multipart/form-data

audio: <file.webm>
```

**Response:**
```json
{
  "text": "Je vois une double hélice dans l'image"
}
```

---

### POST `/api/chat/stream` ⚡ NEW (Phase 2)
Envoie un message à l'assistant IA et reçoit une réponse streaming via SSE.

**Request:**
```json
{
  "sessionId": "uuid-v4",
  "userMessage": "Je vois une double hélice"
}
```

**Response (Server-Sent Events):**
```
Content-Type: text/event-stream

data: {"type":"sentence","text":"Bravo!","index":1}

data: {"type":"sentence","text":"C'est l'ADN!","index":2}

data: {"type":"complete","fullResponse":"Bravo! C'est l'ADN!","foundClues":["ADN"],"detectedClue":"ADN"}
```

**Event Types:**
- `sentence`: Sentence complète envoyée progressivement
- `complete`: Fin du stream avec métadonnées (clues, etc.)
- `error`: Erreur pendant le streaming

---

### POST `/api/chat` (Legacy - Fallback)
Version non-streaming (toujours disponible pour compatibilité).

**Request:**
```json
{
  "sessionId": "uuid-v4",
  "userMessage": "Je vois une double hélice"
}
```

**Response:**
```json
{
  "response": "Bravo! Une double hélice, c'est très bien vu!",
  "detectedClue": "ADN",
  "foundClues": ["ADN"]
}
```

---

### POST `/api/text-to-speech/stream` ⚡ NEW (Phase 2)
Génère un fichier audio à partir de texte avec streaming.

**Request:**
```json
{
  "text": "Bravo! Tu as trouvé l'ADN!"
}
```

**Response:**
```
Content-Type: audio/mpeg
Transfer-Encoding: chunked
X-Cache: MISS (or HIT if cached)

<streaming audio chunks>
```

**Features:**
- Streaming audio chunks pendant génération
- Cache Phase 1 toujours actif (`X-Cache: HIT` si en cache)
- `optimize_streaming_latency: 3` pour ElevenLabs

---

### POST `/api/text-to-speech` (Legacy - avec cache)
Version non-streaming avec cache Phase 1.

**Request:**
```json
{
  "text": "Bravo! Tu as trouvé l'ADN!"
}
```

**Response:**
```
Content-Type: audio/mpeg
X-Cache: HIT (or MISS)

<binary audio data>
```

### POST `/api/sessions`
Crée une nouvelle session utilisateur.

**Request:**
```json
{
  "userName": "Sophie",
  "audioMode": "voice"
}
```

**Response:**
```json
{
  "id": "uuid-v4",
  "userName": "Sophie",
  "foundClues": [],
  "score": 0,
  "audioMode": "voice",
  "completed": 0,
  "createdAt": "2025-11-15T10:30:00Z"
}
```

### GET `/api/sessions/:id`
Récupère une session existante.

### PATCH `/api/sessions/:id`
Met à jour une session (score, indices trouvés, etc.).

---

## 🔧 Variables d'Environnement

```bash
# .env
OPENAI_API_KEY=sk-...          # Pour STT (Whisper) et LLM (Assistant API)
ELEVENLABS_API_KEY=...         # Pour TTS
DATABASE_URL=postgresql://...   # PostgreSQL connection string (Neon)

# Variables Replit (automatiques)
REPLIT_CONNECTORS_HOSTNAME=... # Pour Google Sheets OAuth
REPL_IDENTITY=...              # Token Replit
```

**Configuration OpenAI:**
- Organisation : `org-z0AK8zYLTeapGaiDZFQ5co2N`
- Assistant ID : `asst_P9b5PxMd1k9HjBgbyXI1Cvm9`

**Configuration ElevenLabs:**
- Voice ID : `CBP9p4KAWPqrMHTDtWPR` (Peter mai 2025 FR)
- Model : `eleven_multilingual_v2`

**Configuration Google Sheets:**
- Connecteur Replit : `google-sheet`
- OAuth2 automatique via Replit Connectors

---

## 📝 Fichiers Principaux

| Fonctionnalité | Fichier | Description |
|----------------|---------|-------------|
| **Base de données** | | |
| Schema DB | `shared/schema.ts` | Définition tables Drizzle |
| Storage | `server/storage.ts` | CRUD sessions, messages, feedbacks |
| DB Config | `drizzle.config.ts` | Configuration Drizzle ORM |
| | | |
| **Google Sheets** | | |
| Sync | `server/google-sheets-sync.ts` | Synchronisation Google Sheets |
| | | |
| **API Routes** | | |
| Routes | `server/routes.ts` | Tous les endpoints API |
| | | |
| **Frontend** | | |
| Feedback Form | `client/src/components/FeedbackSurvey.tsx` | Formulaire Typeform |
| Syntheses | `client/src/pages/Syntheses.tsx` | Page synthèses + bouton feedback |
| Success | `client/src/components/SuccessFeedback.tsx` | Animation bouteille explosion |
| | | |
| **Audio** | | |
| Voice Hook | `client/src/hooks/useVoiceInteraction.ts` | Gestion audio |
| Audio Queue | `client/src/hooks/useAudioQueue.ts` | Queue streaming audio |

---

## 📚 Ressources

### Documentation du Projet
- [README.md](./README.md) - Documentation principale
- [CHANGELOG.md](./CHANGELOG.md) - Historique des modifications
- [PHASE1_OPTIMIZATIONS.md](./PHASE1_OPTIMIZATIONS.md) - Optimisations Phase 1
- [PHASE2_OPTIMIZATIONS.md](./PHASE2_OPTIMIZATIONS.md) - Optimisations Phase 2

### APIs
- [OpenAI Whisper](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI Assistant API](https://platform.openai.com/docs/assistants/overview)
- [ElevenLabs TTS](https://elevenlabs.io/docs)
- [Google Sheets API v4](https://developers.google.com/sheets/api)
- [Drizzle ORM](https://orm.drizzle.team/docs/overview)
