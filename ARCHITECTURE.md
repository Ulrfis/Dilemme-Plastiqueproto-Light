# Architecture du Système de Conversation Vocale

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

### POST `/api/chat`
Envoie un message à l'assistant IA et reçoit une réponse.

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

### POST `/api/text-to-speech`
Génère un fichier audio à partir de texte.

**Request:**
```json
{
  "text": "Bravo! Tu as trouvé l'ADN!"
}
```

**Response:**
```
Content-Type: audio/mpeg
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
```

**Configuration OpenAI:**
- Organisation : `org-z0AK8zYLTeapGaiDZFQ5co2N`
- Assistant ID : `asst_P9b5PxMd1k9HjBgbyXI1Cvm9`

**Configuration ElevenLabs:**
- Voice ID : `CBP9p4KAWPqrMHTDtWPR` (Peter mai 2025 FR)
- Model : `eleven_multilingual_v2`

---

## 📝 Fichiers Principaux

| Fonctionnalité | Fichier | Description |
|----------------|---------|-------------|
| STT Config | `server/routes.ts:88-108` | Configuration Whisper |
| LLM Chat | `server/routes.ts:172-342` | OpenAI Assistant API |
| TTS Config | `server/routes.ts:116-170` | Configuration ElevenLabs |
| TTS Validation | `server/routes.ts:161-165` | Validation audio côté serveur |
| Storage | `server/storage.ts:17-82` | MemStorage (sessions, messages) |
| Audio Playback | `client/src/hooks/useVoiceInteraction.ts:184-407` | Lecture audio avec pré-chargement |
| Audio Cleanup | `client/src/hooks/useVoiceInteraction.ts:199-210` | Nettoyage Audio element |
| Blob Validation | `client/src/lib/api.ts:74-78` | Validation blob côté client |
| Audio Timeouts | `client/src/components/TutorialScreen.tsx:310, 323-330` | Timeouts de sécurité |
| Replay Button | `client/src/pages/Home.tsx:52-63` | Bouton rejouer le tutoriel |

---

## 📚 Ressources

### Documentation du Projet
- [README.md](./README.md) - Documentation principale
- [CHANGELOG.md](./CHANGELOG.md) - Historique des modifications

### APIs
- [OpenAI Whisper](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI Assistant API](https://platform.openai.com/docs/assistants/overview)
- [ElevenLabs TTS](https://elevenlabs.io/docs)
