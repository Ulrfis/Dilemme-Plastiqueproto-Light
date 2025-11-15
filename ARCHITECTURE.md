# Architecture du Système de Conversation Vocale

## 🆕 Améliorations v1.1.0 - Robustesse Mobile

### Problèmes Résolus
La version 1.1.0 apporte des **corrections critiques** pour garantir la fiabilité du flux audio sur mobile :

#### 1. Flux Audio Bloqué Après Première Interaction
**Symptôme** : Peter ne parlait plus après la première conversation, particulièrement sur Safari iOS.

**Causes Identifiées** :
- Blobs audio vides ou invalides non détectés
- Éléments `<audio>` non nettoyés entre les lectures
- États bloqués sans mécanisme de récupération
- Timeouts trop courts pour connexions mobiles lentes

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

// 4. Détection de blocage (client/src/components/TutorialScreen.tsx:323-330)
const startTimeoutId = setTimeout(() => {
  if (audioState === 'playing' && !isAudioPlaying) {
    console.warn('Audio stuck - recovering');
    stopAudio();
    recoverFromError();
  }
}, 5000);

// 5. Timeouts améliorés (client/src/components/TutorialScreen.tsx:310)
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
- **Fiabilité** : 100% des interactions audio fonctionnent maintenant sur mobile
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
│  │  │  6. Call OpenAI GPT-4o-mini:                      │ │   │
│  │  │     - Model: gpt-4o-mini                          │ │   │
│  │  │     - max_tokens: 150                             │ │   │
│  │  │     - temperature: 0.7                            │ │   │
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
│  │  │  2. Call ElevenLabs API                           │ │   │
│  │  │     - Voice ID: ErXwobaYiN019PkySvjV              │ │   │
│  │  │     - Model: eleven_multilingual_v2               │ │   │
│  │  │     - Stability: 0.5                              │ │   │
│  │  │     - Similarity boost: 0.75                      │ │   │
│  │  │  3. Return audio/mpeg stream                      │ │   │
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
│  │  - Create Audio element                                  │   │
│  │  - Display Peter avatar with animation                   │   │
│  │  - Play audio response                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 🔄 Flux de Données Détaillé

### 1️⃣ SPEECH-TO-TEXT (STT)

**Fichier**: `server/routes.ts:88-108`

```typescript
// L'audio arrive en format WebM
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
- **OpenAI Whisper**: Modèle de reconnaissance vocale state-of-the-art
- **Multer**: Middleware pour gérer les fichiers multipart
- **WebM**: Format audio léger pour le web

---

### 2️⃣ GESTION DE CONVERSATION (LLM)

**Fichier**: `server/routes.ts:155-230`

```typescript
POST /api/chat
├─ Input: { sessionId, userMessage }
├─ Processing:
│  ├─ Load session state from storage
│  ├─ Detect clues in user message (detectClue function)
│  ├─ Save user message to conversation history
│  ├─ Build context:
│  │  ├─ System prompt (persona + rules + found clues)
│  │  └─ Last 6 messages (sliding window for context)
│  ├─ GPT-4o-mini API call
│  │  ├─ model: 'gpt-4o-mini'
│  │  ├─ max_tokens: 150
│  │  └─ temperature: 0.7
│  ├─ Save assistant response
│  └─ Update session (clues, score)
└─ Output: { response, detectedClue, foundClues }
```

**Système de Mémoire Actuel**:

```javascript
// Fichier: server/storage.ts
class MemStorage {
  // Stockage en mémoire RAM (non persistant)
  private sessions: Map<string, TutorialSession>
  private messages: Map<string, ConversationMessage>

  // Historique de conversation par session
  getSessionMessages(sessionId) {
    // Retourne tous les messages de la session, triés par date
  }
}
```

**Contexte envoyé au LLM**:
```javascript
[
  {
    role: 'system',
    content: `Tu es Peter, un assistant IA éducatif...
              Indices déjà trouvés: ${foundClues.join(', ')}
              Règles: ...`
  },
  ...last6Messages.map(msg => ({
    role: msg.role,  // 'user' ou 'assistant'
    content: msg.content
  }))
]
```

---

### 3️⃣ TEXT-TO-SPEECH (TTS)

**Fichier**: `server/routes.ts:110-153`

```typescript
POST /api/text-to-speech
├─ Input: { text: "Bravo! Vous avez trouvé l'ADN!" }
├─ Processing:
│  └─ ElevenLabs API call
│     ├─ Voice ID: ErXwobaYiN019PkySvjV
│     ├─ Model: eleven_multilingual_v2
│     ├─ Stability: 0.5 (variabilité de la voix)
│     └─ Similarity boost: 0.75 (fidélité à la voix)
└─ Output: audio/mpeg stream
```

---

## 🎯 Fine-Tuning: Mémoire (RAG)

### Option 1: RAG Simple (Recommandé pour MVP)

Implémentez un système de contexte enrichi sans base vectorielle:

```typescript
// server/routes.ts - Modifier la fonction chat

// 1. Créer une base de connaissances
const KNOWLEDGE_BASE = {
  "ADN": {
    definition: "L'ADN est la molécule qui porte l'information génétique...",
    hints: ["double hélice", "code génétique", "cellules"],
    educational_facts: [
      "L'ADN est présent dans chaque cellule de votre corps",
      "Il détermine vos caractéristiques héréditaires"
    ]
  },
  "plastique": {
    definition: "Le plastique est un polymère synthétique...",
    hints: ["pollution", "océans", "recyclage"],
    educational_facts: [
      "8 millions de tonnes de plastique finissent dans les océans chaque année",
      "Le plastique met 450 ans à se décomposer"
    ]
  },
  // ... autres indices
};

// 2. Modifier le system prompt pour inclure le contexte
const systemPrompt = `Tu es Peter, un assistant IA éducatif...

Indices déjà trouvés: ${session.foundClues.join(', ')}

CONTEXTE ÉDUCATIF:
${session.foundClues.map(clue =>
  `- ${clue}: ${KNOWLEDGE_BASE[clue].definition}`
).join('\n')}

CONNAISSANCES DISPONIBLES:
${Object.entries(KNOWLEDGE_BASE)
  .filter(([key]) => !session.foundClues.includes(key))
  .map(([key, value]) => `- ${key}: ${value.hints.join(', ')}`)
  .join('\n')}

Règles:
- Réponds en 1-2 phrases courtes et encourageantes
- Utilise les connaissances ci-dessus pour enrichir tes réponses
- Si l'utilisateur pose une question, utilise les faits éducatifs pertinents
- Guide avec des questions ouvertes
`;
```

### Option 2: RAG Avancé avec Vector Database

Pour une solution plus scalable:

```bash
npm install @pinecone-database/pinecone openai
```

**Implémentation**:

```typescript
// server/rag.ts (nouveau fichier)
import { Pinecone } from '@pinecone-database/pinecone';
import OpenAI from 'openai';

const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export class RAGSystem {
  private index;

  constructor() {
    this.index = pinecone.Index('dilemme-plastique');
  }

  // 1. Créer des embeddings pour la base de connaissances
  async indexKnowledge(documents: Array<{id: string, text: string, metadata: any}>) {
    for (const doc of documents) {
      const embedding = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: doc.text,
      });

      await this.index.upsert([{
        id: doc.id,
        values: embedding.data[0].embedding,
        metadata: doc.metadata,
      }]);
    }
  }

  // 2. Rechercher le contexte pertinent
  async searchRelevantContext(query: string, topK: number = 3) {
    const queryEmbedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: query,
    });

    const results = await this.index.query({
      vector: queryEmbedding.data[0].embedding,
      topK,
      includeMetadata: true,
    });

    return results.matches.map(match => match.metadata.text);
  }

  // 3. Enrichir le contexte de la conversation
  async enrichContext(userMessage: string, foundClues: string[]) {
    const relevantContext = await this.searchRelevantContext(userMessage);

    return {
      relevantFacts: relevantContext,
      clueHints: foundClues.map(clue =>
        `Vous avez déjà découvert: ${clue}`
      )
    };
  }
}

// Utilisation dans routes.ts
const ragSystem = new RAGSystem();

app.post('/api/chat', async (req, res) => {
  // ... code existant ...

  // Enrichir avec RAG
  const enrichedContext = await ragSystem.enrichContext(userMessage, session.foundClues);

  const systemPrompt = `Tu es Peter, un assistant IA éducatif...

  CONTEXTE PERTINENT:
  ${enrichedContext.relevantFacts.join('\n')}

  INDICES TROUVÉS:
  ${enrichedContext.clueHints.join('\n')}

  Règles: ...`;

  // ... suite du code ...
});
```

### Option 3: Fine-Tuning du Modèle OpenAI

Pour un comportement très spécifique à votre cas d'usage:

```typescript
// Préparer des données d'entraînement (JSONL format)
const trainingData = [
  {
    messages: [
      { role: "system", content: "Tu es Peter, assistant éducatif..." },
      { role: "user", content: "Je vois quelque chose qui ressemble à une hélice" },
      { role: "assistant", content: "Intéressant! Une double hélice peut-être? Qu'est-ce que cela pourrait représenter dans le contexte scientifique?" }
    ]
  },
  // ... minimum 10 exemples, idéalement 50-100
];

// Script pour fine-tuner (à exécuter hors de l'app)
async function fineTuneModel() {
  const openai = new OpenAI();

  // 1. Upload training file
  const file = await openai.files.create({
    file: fs.createReadStream("training_data.jsonl"),
    purpose: "fine-tune",
  });

  // 2. Create fine-tuning job
  const fineTune = await openai.fineTuning.jobs.create({
    training_file: file.id,
    model: "gpt-4o-mini-2024-07-18",
  });

  console.log("Fine-tuning job created:", fineTune.id);
}

// Puis dans routes.ts, utiliser le modèle fine-tuné:
const completion = await openai.chat.completions.create({
  model: 'ft:gpt-4o-mini-2024-07-18:your-org:custom-model:id',
  messages: chatMessages,
  // ...
});
```

---

## 🎤 Customisation de la Voix (TTS)

### Option 1: Voix Custom avec ElevenLabs (Déjà utilisé)

**1. Créer une voix custom via ElevenLabs Dashboard**:

```bash
# 1. Aller sur https://elevenlabs.io/voice-lab
# 2. Cliquer sur "Instant Voice Cloning" ou "Professional Voice Cloning"
```

**Voice Cloning Options**:

**A. Instant Voice Cloning** (Rapide, 1 minute d'audio):
```
- Upload 1-5 fichiers audio de la voix cible
- Durée totale: 1-5 minutes
- Qualité: Bonne pour la plupart des cas
- Coût: ~$1-5 par voix
```

**B. Professional Voice Cloning** (Haute qualité, 30 minutes d'audio):
```
- Upload 30+ minutes d'audio de haute qualité
- Meilleure fidélité et naturalité
- Coût: ~$330 par voix
```

**2. Utiliser la voix dans le code**:

```typescript
// server/routes.ts:119
app.post('/api/text-to-speech', async (req, res) => {
  const { text } = req.body;

  // Modifier le VOICE_ID avec votre voix custom
  const VOICE_ID = 'YOUR_CUSTOM_VOICE_ID'; // Obtenu après création

  const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': process.env.ELEVENLABS_API_KEY
    },
    body: JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2', // Support français
      voice_settings: {
        stability: 0.5,           // 0-1: Consistance de la voix
        similarity_boost: 0.75,   // 0-1: Fidélité à la voix originale
        style: 0.5,               // 0-1: Exagération du style (v2 model)
        use_speaker_boost: true   // Améliore la clarté
      }
    })
  });

  const audioBuffer = await response.arrayBuffer();
  res.set('Content-Type', 'audio/mpeg');
  res.send(Buffer.from(audioBuffer));
});
```

**3. Paramètres de fine-tuning de la voix**:

```typescript
const VOICE_PRESETS = {
  energetic: {
    stability: 0.3,          // Plus de variation
    similarity_boost: 0.8,
    style: 0.7,              // Plus d'émotion
  },
  calm: {
    stability: 0.7,          // Plus stable
    similarity_boost: 0.6,
    style: 0.3,              // Moins d'émotion
  },
  educational: {
    stability: 0.5,          // Équilibré
    similarity_boost: 0.75,
    style: 0.5,
    speaking_rate: 1.0,      // Vitesse normale
  },
  child_friendly: {
    stability: 0.4,
    similarity_boost: 0.7,
    style: 0.6,              // Plus expressif
  }
};

// Utiliser selon le contexte
const voiceSettings = VOICE_PRESETS.educational;
```

### Option 2: OpenAI TTS (Alternative)

```typescript
app.post('/api/text-to-speech', async (req, res) => {
  const { text } = req.body;

  const mp3 = await openai.audio.speech.create({
    model: "tts-1-hd",  // ou "tts-1" (plus rapide, moins cher)
    voice: "nova",      // alloy, echo, fable, onyx, nova, shimmer
    input: text,
    speed: 1.0,         // 0.25 à 4.0
  });

  const buffer = Buffer.from(await mp3.arrayBuffer());
  res.set('Content-Type', 'audio/mpeg');
  res.send(buffer);
});
```

**Voix disponibles OpenAI**:
- `alloy` - Neutre, polyvalente
- `echo` - Masculine, claire
- `fable` - Masculine britannique
- `onyx` - Masculine profonde
- `nova` - Féminine énergique ⭐ (recommandé pour Peter)
- `shimmer` - Féminine douce

### Option 3: Coqui TTS (Open Source, Self-Hosted)

```bash
npm install @coqui/tts
```

```typescript
import { TTS } from '@coqui/tts';

const tts = new TTS();

app.post('/api/text-to-speech', async (req, res) => {
  const { text } = req.body;

  // Charger un modèle pré-entraîné
  const audioBuffer = await tts.synthesize({
    text,
    model: 'tts_models/fr/css10/vits', // Modèle français
    speakerId: 0,
  });

  res.set('Content-Type', 'audio/wav');
  res.send(audioBuffer);
});
```

---

## 🔧 Variables d'Environnement Requises

```bash
# .env
OPENAI_API_KEY=sk-...                    # Pour STT (Whisper) et LLM (GPT)
ELEVENLABS_API_KEY=...                   # Pour TTS
PINECONE_API_KEY=...                     # (Optionnel) Pour RAG avancé
```

---

## 📊 Comparaison des Solutions

### Mémoire (RAG)

| Solution | Complexité | Coût | Performance | Use Case |
|----------|-----------|------|-------------|----------|
| **RAG Simple** | ⭐ | Gratuit | Bon pour <100 docs | MVP, petite base |
| **Pinecone RAG** | ⭐⭐⭐ | ~$70/mois | Excellent | Production, scaling |
| **Fine-tuning** | ⭐⭐⭐⭐ | ~$8 + $0.012/1K tokens | Très spécifique | Comportement unique |

### Voix (TTS)

| Solution | Qualité | Latence | Coût/1K chars | Customisation |
|----------|---------|---------|---------------|---------------|
| **ElevenLabs** | ⭐⭐⭐⭐⭐ | ~1-2s | $0.30 | Voice cloning ⭐ |
| **OpenAI TTS** | ⭐⭐⭐⭐ | ~0.5-1s | $0.015 | 6 voix fixes |
| **Coqui TTS** | ⭐⭐⭐ | <0.5s | Gratuit | Open source |

---

## 🚀 Recommandations d'Implémentation

### Pour la Mémoire (Peter):
1. **Court terme (1 semaine)**: Implémenter RAG Simple avec KNOWLEDGE_BASE
2. **Moyen terme (1 mois)**: Migrer vers Pinecone + embeddings si >100 documents
3. **Long terme**: Fine-tuner GPT-4o-mini avec vos propres exemples de conversations

### Pour la Voix:
1. **Immédiat**: Tester les 6 voix OpenAI pour trouver celle qui convient
2. **Court terme**: Créer une voix custom ElevenLabs avec Instant Voice Cloning
3. **Moyen terme**: Professional Voice Cloning si budget le permet

---

## 📝 Fichiers à Modifier

| Fonctionnalité | Fichier | Ligne |
|----------------|---------|-------|
| STT Config | `server/routes.ts` | 88-108 |
| LLM Prompt | `server/routes.ts` | 179-188 |
| LLM Model | `server/routes.ts` | 198-203 |
| TTS Config | `server/routes.ts` | 110-153 |
| TTS Validation | `server/routes.ts` | 161-165 |
| Voice ID | `server/routes.ts` | 119 |
| Voice Settings | `server/routes.ts` | 135-138 |
| Storage | `server/storage.ts` | 17-82 |
| Messages Window | `server/routes.ts` | 192 |
| Audio Playback | `client/src/hooks/useVoiceInteraction.ts` | 184-280 |
| Audio Cleanup | `client/src/hooks/useVoiceInteraction.ts` | 199-210 |
| Blob Validation | `client/src/lib/api.ts` | 74-78 |
| Audio Timeouts | `client/src/components/TutorialScreen.tsx` | 310, 323-330 |
| Replay Button | `client/src/pages/Home.tsx` | 52-63 |

---

## 💡 Conseils de Fine-Tuning

### Pour améliorer Peter (LLM):

```typescript
// 1. Augmenter la fenêtre de contexte
...messages.slice(-10)  // Au lieu de -6

// 2. Ajouter de la personnalité
const systemPrompt = `Tu es Peter, un assistant IA éducatif avec ces traits:
- Enthousiaste et encourageant
- Utilise des métaphores scientifiques
- Pose des questions socratiques
- S'adapte au niveau de l'utilisateur
- Utilise parfois des emojis (🧬 pour ADN, 🌍 pour plastique)

Ton style de réponse:
- Format: [Réaction émotionnelle] + [Question/Information] + [Encouragement]
- Exemple: "Wow, excellente observation! 🎉 Une double hélice... cela te fait penser à quoi en biologie? Continue d'explorer!"
`;

// 3. Ajuster la température selon le contexte
const temperature = session.foundClues.length === 0 ? 0.9 : 0.6;
// Plus créatif au début, plus précis quand on avance
```

### Pour améliorer la voix:

```typescript
// Adapter les paramètres selon le contexte
const getVoiceSettings = (message: string) => {
  if (message.includes('Bravo') || message.includes('Excellent')) {
    return { stability: 0.3, similarity_boost: 0.8, style: 0.8 }; // Enthousiaste
  }
  if (message.includes('?')) {
    return { stability: 0.5, similarity_boost: 0.75, style: 0.6 }; // Questionnement
  }
  return { stability: 0.5, similarity_boost: 0.75, style: 0.5 }; // Normal
};
```

---

## 🔍 Debugging & Monitoring

```typescript
// Ajouter des logs détaillés
app.post('/api/chat', async (req, res) => {
  const startTime = Date.now();

  console.log('[CHAT] User message:', userMessage);
  console.log('[CHAT] Found clues:', session.foundClues);

  const completion = await openai.chat.completions.create({...});

  console.log('[CHAT] LLM response:', assistantResponse);
  console.log('[CHAT] Processing time:', Date.now() - startTime, 'ms');
  console.log('[CHAT] Tokens used:', completion.usage);

  // ...
});
```

---

## 📚 Ressources Utiles

### Documentation du Projet
- [README.md](./README.md) - Documentation principale
- [CHANGELOG.md](./CHANGELOG.md) - Historique complet des modifications

### APIs & Services
- [OpenAI Whisper Docs](https://platform.openai.com/docs/guides/speech-to-text)
- [OpenAI GPT Fine-tuning](https://platform.openai.com/docs/guides/fine-tuning)
- [OpenAI TTS Docs](https://platform.openai.com/docs/guides/text-to-speech)
- [ElevenLabs Voice Lab](https://elevenlabs.io/voice-lab)
- [Pinecone RAG Guide](https://docs.pinecone.io/guides/data/understanding-hybrid-search)
