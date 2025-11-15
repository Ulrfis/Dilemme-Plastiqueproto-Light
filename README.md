# Dilemme Plastique - Prototype Light 🌍

> Application éducative interactive avec IA vocale pour découvrir les enjeux environnementaux à travers l'analyse d'images guidée par un assistant virtuel.

![Version](https://img.shields.io/badge/version-1.1.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-20.x-brightgreen.svg)
![Mobile](https://img.shields.io/badge/mobile-optimized-success.svg)

---

## 🆕 Dernières Améliorations (v1.1.0)

### ✅ Flux Audio Mobile Robuste
La version 1.1.0 apporte des **corrections critiques** pour le flux audio mobile :
- **Problème résolu** : Peter parle maintenant de manière fiable après chaque interaction utilisateur
- **Détection de blocages** : Système automatique qui détecte et récupère les états audio bloqués
- **Validation robuste** : Vérification des données audio à chaque étape (client et serveur)
- **Timeouts améliorés** : Marges de sécurité augmentées pour les connexions mobiles lentes

### 🔄 Bouton "Rejouer" Amélioré
- Le bouton "Rejouer le tutoriel" retourne maintenant correctement à l'écran de titre initial
- Réinitialisation complète de tous les états pour une nouvelle session propre

📋 **Voir le [CHANGELOG.md](./CHANGELOG.md) pour l'historique complet des modifications**

---

## 📖 Description du Projet

**Dilemme Plastique** est une application web éducative innovante qui utilise l'intelligence artificielle conversationnelle pour guider les utilisateurs (principalement des élèves) dans l'analyse d'images contenant des indices sur des thématiques environnementales et scientifiques.

### Concept Principal

L'utilisateur interagit **vocalement** avec **Peter**, un assistant IA éducatif, pour découvrir **4 indices cachés** dans une image fixe :
- 🧬 **ADN** (double hélice génétique)
- 👶 **Bébé** (représentation de l'avenir)
- 🗿 **Le Penseur de Rodin** (réflexion philosophique)
- ♻️ **Plastique/Pollution** (enjeux environnementaux)

### Objectifs Pédagogiques

- **Apprentissage actif** : L'élève explore et découvre par lui-même
- **Pensée critique** : Analyse d'image et connexion de concepts
- **Interaction naturelle** : Conversation vocale fluide avec l'IA
- **Feedback immédiat** : Validation et encouragements en temps réel
- **Gamification** : Système de score et progression motivante

### Public Cible

- Élèves de collège/lycée (12-18 ans)
- Sessions courtes (≤ 5 minutes)
- Utilisation en classe (24+ sessions simultanées)
- Mobile-first (smartphones, tablettes)

---

## ✨ Fonctionnalités Principales

### 🎤 Interaction Vocale (Voice-First)

- **Speech-to-Text** : Reconnaissance vocale en français via OpenAI Whisper
- **Text-to-Speech** : Synthèse vocale naturelle via ElevenLabs (voix multilingue)
- **Conversation IA** : Assistant conversationnel GPT-4o-mini avec personnalité "Peter"
- **Fallback automatique** : Passage en mode texte si problème micro/audio

### 🖼️ Analyse d'Image Interactive

- Image fixe avec zoom désactivé (focus sur l'analyse)
- Détection intelligente des mots-clés et variantes (synonymes, pluriels)
- Validation progressive (2/4, 3/4, 4/4 indices)
- Feedbacks visuels et vocaux à chaque découverte

### 📱 Expérience Utilisateur

1. **Écran titre** - Introduction au concept
2. **Vidéo intro** (20-40s) - Présentation de Peter
3. **Configuration** - Nom de l'utilisateur + test micro
4. **Tutoriel interactif** - Découverte des 4 indices
5. **Score final** - Récapitulatif avec feedback personnalisé

### 🎨 Interface Mobile-First

- Design responsive optimisé pour mobile
- Animations fluides (vumètre, stickers de succès)
- Indicateurs d'état clairs (recording, processing, playing)
- Boutons ergonomiques et accessibles
- UI moderne avec Tailwind CSS + shadcn/ui

---

## 🏗️ Architecture Technique

### Vue d'Ensemble

```
┌─────────────────────────────────────────────────┐
│          CLIENT (React + TypeScript)            │
│  ┌──────────────────────────────────────────┐   │
│  │  - VoiceInteraction Component            │   │
│  │  - MediaRecorder API (WebM)              │   │
│  │  - Audio State Management                │   │
│  └──────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────┘
                 │
                 │ HTTP/REST API
                 ▼
┌─────────────────────────────────────────────────┐
│         SERVER (Express + Node.js)              │
│  ┌──────────────────────────────────────────┐   │
│  │  POST /api/speech-to-text                │   │
│  │  ├─ OpenAI Whisper (STT)                 │   │
│  │                                           │   │
│  │  POST /api/chat                          │   │
│  │  ├─ GPT-4o-mini (Conversation)           │   │
│  │  ├─ MemStorage (Session + Messages)      │   │
│  │  ├─ Clue Detection Logic                 │   │
│  │                                           │   │
│  │  POST /api/text-to-speech                │   │
│  │  ├─ ElevenLabs API (TTS)                 │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Flux de Données Détaillé

**1. Enregistrement Audio** → **2. Transcription (Whisper)** → **3. Analyse IA (GPT)** → **4. Synthèse Vocale (ElevenLabs)** → **5. Lecture Audio**

Pour plus de détails, consultez **[ARCHITECTURE.md](./ARCHITECTURE.md)**

---

## 🛠️ Stack Technique

### Frontend

| Technologie | Version | Usage |
|------------|---------|-------|
| **React** | 18.3.1 | Framework UI |
| **TypeScript** | 5.6.3 | Typage statique |
| **Vite** | 5.4.20 | Build tool & dev server |
| **Wouter** | 3.3.5 | Routing léger |
| **TanStack Query** | 5.60.5 | State management serveur |
| **Tailwind CSS** | 3.4.17 | Styling utility-first |
| **shadcn/ui** | Latest | Composants UI (Radix) |
| **Framer Motion** | 11.13.1 | Animations |

### Backend

| Technologie | Version | Usage |
|------------|---------|-------|
| **Node.js** | 20.16.11 | Runtime JavaScript |
| **Express** | 4.21.2 | Framework web |
| **TypeScript** | 5.6.3 | Typage statique |
| **Multer** | 2.0.2 | Upload fichiers audio |
| **Drizzle ORM** | 0.39.1 | ORM (préparé pour DB) |

### APIs & Services IA

| Service | Usage | Documentation |
|---------|-------|---------------|
| **OpenAI Whisper** | Speech-to-Text (français) | [Docs](https://platform.openai.com/docs/guides/speech-to-text) |
| **OpenAI GPT-4o-mini** | Conversation IA | [Docs](https://platform.openai.com/docs/models/gpt-4o-mini) |
| **ElevenLabs** | Text-to-Speech (voix custom) | [Docs](https://elevenlabs.io/docs) |

### Stockage

- **MemStorage** : Stockage en mémoire (sessions, messages)
- **Schema Drizzle** : Préparé pour PostgreSQL/Neon (non activé en V1)

---

## 🚀 Installation & Démarrage

### Prérequis

- **Node.js** >= 20.x
- **npm** >= 10.x
- **Clés API** :
  - `OPENAI_API_KEY` (OpenAI)
  - `ELEVENLABS_API_KEY` (ElevenLabs)

### Installation

```bash
# Cloner le repository
git clone https://github.com/Ulrfis/Dilemme-Plastiqueproto-Light.git
cd Dilemme-Plastiqueproto-Light

# Installer les dépendances
npm install
```

### Configuration

Créer un fichier `.env` à la racine :

```env
# OpenAI API (Whisper + Assistant API)
OPENAI_API_KEY=sk-...

# ElevenLabs API (Text-to-Speech)
ELEVENLABS_API_KEY=...

# Port serveur (optionnel, défaut: 5000)
PORT=5000
```

**⚠️ Configuration Spécifique OpenAI:**
- **Organisation**: `org-z0AK8zYLTeapGaiDZFQ5co2N`
- **Assistant ID**: `asst_P9b5PxMd1k9HjBgbyXI1Cvm9`
- **Voice ID (ElevenLabs)**: `CBP9p4KAWPqrMHTDtWPR` (Peter mai 2025 FR)

Ces IDs sont configurés dans `server/routes.ts` et doivent correspondre à votre workspace OpenAI.

### Lancement

```bash
# Mode développement (hot reload)
npm run dev

# Build production
npm run build

# Démarrer en production
npm start

# Vérification TypeScript
npm run check
```

L'application sera accessible sur **http://localhost:5000**

---

## 📂 Structure du Projet

```
Dilemme-Plastiqueproto-Light/
├── client/                          # Frontend React
│   ├── src/
│   │   ├── components/
│   │   │   ├── VoiceInteraction.tsx    # Composant interaction vocale
│   │   │   ├── TutorialScreen.tsx      # Écran tutoriel
│   │   │   ├── ScoreScreen.tsx         # Écran score
│   │   │   ├── TitleScreen.tsx         # Écran titre
│   │   │   ├── VideoIntro.tsx          # Vidéo introduction
│   │   │   ├── WelcomeSetup.tsx        # Configuration initiale
│   │   │   ├── ZoomableImage.tsx       # Image zoomable
│   │   │   ├── SuccessFeedback.tsx     # Animations succès
│   │   │   └── ui/                     # Composants shadcn/ui
│   │   ├── hooks/
│   │   │   ├── useVoiceInteraction.ts  # Hook gestion audio
│   │   │   └── use-toast.ts            # Hook notifications
│   │   ├── pages/
│   │   │   ├── Home.tsx                # Page principale
│   │   │   └── not-found.tsx           # Page 404
│   │   ├── lib/
│   │   │   ├── api.ts                  # Client API
│   │   │   ├── queryClient.ts          # Config TanStack Query
│   │   │   └── utils.ts                # Utilitaires
│   │   ├── App.tsx                     # Composant racine
│   │   ├── main.tsx                    # Point d'entrée
│   │   └── index.css                   # Styles globaux
│   ├── public/
│   │   └── favicon.png
│   └── index.html
│
├── server/                          # Backend Express
│   ├── index.ts                     # Serveur principal
│   ├── routes.ts                    # Routes API
│   │                                # - POST /api/speech-to-text
│   │                                # - POST /api/chat
│   │                                # - POST /api/text-to-speech
│   │                                # - POST /api/sessions
│   │                                # - GET/PATCH /api/sessions/:id
│   ├── storage.ts                   # Stockage en mémoire (MemStorage)
│   └── vite.ts                      # Config Vite middleware
│
├── shared/                          # Code partagé
│   └── schema.ts                    # Schémas Drizzle + Zod
│
├── attached_assets/                 # Assets du projet
│   ├── Prototype-Dilemme-Light_PRD_1762430698665.md  # PRD
│   └── generated_images/            # Images générées
│       ├── Peter_AI_mascot_character_ddfcb150.png
│       ├── Dilemme_app_logo_f1e850c1.png
│       └── ...
│
├── ARCHITECTURE.md                  # Documentation architecture détaillée
├── CHANGELOG.md                     # Historique des modifications
├── README.md                        # Ce fichier
├── package.json                     # Dépendances & scripts
├── tsconfig.json                    # Config TypeScript
├── vite.config.ts                   # Config Vite
├── tailwind.config.ts               # Config Tailwind
├── drizzle.config.ts                # Config Drizzle ORM
└── design_guidelines.md             # Guidelines design
```

---

## 🔑 Points Clés de l'Implémentation

### Gestion des États Audio

Le hook `useVoiceInteraction` gère 5 états :

```typescript
type AudioState = 'idle' | 'recording' | 'processing' | 'playing' | 'error';
```

- **idle** : En attente (bouton micro visible)
- **recording** : Enregistrement en cours (vumètre animé)
- **processing** : Traitement STT + LLM en cours (loader)
- **playing** : Lecture de la réponse audio (avatar Peter)
- **error** : Erreur (proposition fallback texte)

### Détection des Indices

```typescript
// server/routes.ts:15-36
const TARGET_CLUES = [
  { keyword: "ADN", variants: ["adn", "acide désoxyribonucléique", "génétique", "double hélice"] },
  { keyword: "bébé", variants: ["bébé", "bebe", "nourrisson", "enfant", "nouveau-né"] },
  { keyword: "penseur de Rodin", variants: ["penseur", "rodin", "sculpture", "statue penseur"] },
  { keyword: "plastique", variants: ["plastique", "pollution plastique", "déchets plastiques", "pollution"] }
];
```

Chaque message utilisateur est analysé pour détecter les mots-clés et variantes.

### Système de Mémoire Conversationnelle

```typescript
// server/routes.ts:192
const chatMessages = [
  { role: 'system', content: systemPrompt },
  ...messages.slice(-6)  // Fenêtre glissante de 6 messages
];
```

Le contexte conversationnel conserve les **6 derniers messages** pour fluidité.

### Personnalité de Peter (System Prompt)

```typescript
// server/routes.ts:179-188
const systemPrompt = `Tu es Peter, un assistant IA éducatif amical qui aide les étudiants
à analyser une image contenant 4 indices cachés: ADN, bébé, penseur de Rodin, et plastique/pollution.

Indices déjà trouvés: ${session.foundClues.join(', ') || 'aucun'}

Règles:
- Réponds en 1-2 phrases courtes et encourageantes en français
- Si l'utilisateur mentionne un indice non trouvé, félicite-le avec enthousiasme
- Guide l'utilisateur avec des questions ouvertes sans donner directement les réponses
- Sois chaleureux et positif
- Ne mentionne jamais les indices non trouvés directement`;
```

### Configuration Audio Frontend

```typescript
// client/src/hooks/useVoiceInteraction.ts:39-45
const stream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: true,     // Réduit l'écho
    noiseSuppression: true,     // Supprime le bruit de fond
    sampleRate: 44100,          // Qualité CD
  }
});
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
  "response": "Bravo! Une double hélice, c'est très bien vu! De quoi pourrait-il s'agir selon toi?",
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
  "createdAt": "2025-01-15T10:30:00Z"
}
```

### GET `/api/sessions/:id`

Récupère une session existante.

### PATCH `/api/sessions/:id`

Met à jour une session (score, indices trouvés, etc.).

---

## 🎓 Cas d'Usage Pédagogiques

### Scénario Type en Classe

1. **Préparation** (5 min)
   - L'enseignant projette l'image au tableau
   - Les élèves se connectent sur leurs smartphones
   - Test rapide du micro de chaque élève

2. **Découverte Individuelle** (3-4 min)
   - Chaque élève analyse l'image et dialogue avec Peter
   - Validation progressive des indices
   - Score final obtenu

3. **Débriefing Collectif** (5-10 min)
   - Discussion sur les indices trouvés
   - Connexion avec le cours (génétique, environnement, philosophie)
   - Prolongements possibles

### Adaptations Possibles

- **Mode Silent** : Texte uniquement pour salles bruyantes
- **Prolongation** : Ajout de niveaux supplémentaires
- **Multi-langues** : Support anglais/espagnol via Whisper
- **Accessibilité** : Sous-titres automatiques

---

## 🔐 Sécurité & Confidentialité

### Données Utilisateur

- **Pas de stockage persistant** : Sessions en mémoire uniquement (RAM)
- **Prénom non conservé** : Effacé à la fin de session
- **Audio non stocké** : Transcription immédiate puis suppression
- **Conformité RGPD** : Aucune donnée personnelle collectée

### APIs Tierces

- **Clés API sécurisées** : Variables d'environnement serveur uniquement
- **Jamais exposées côté client** : Appels proxy via backend
- **Rate limiting** : Protection contre les abus (à implémenter)

### Permissions Navigateur

- **Microphone** : Demande explicite avec message clair
- **Fallback automatique** : Si refusé → mode texte
- **Feedback utilisateur** : Indicateurs visuels d'état micro

---

## 🚧 Limitations Connues (V1.1)

- **Stockage temporaire** : Sessions perdues au redémarrage serveur
- **Pas de comptes utilisateurs** : Pas d'historique persistant
- **24 sessions max recommandé** : Limitation mémoire RAM
- **1 seul niveau** : Tutoriel uniquement (pas de progression multi-niveaux)
- **Pas de RAG étendu** : Base de connaissances limitée aux 4 indices
- **Latence réseau** : Dépend de la connexion (STT + LLM + TTS ≈ 2-4s)

### ✅ Problèmes Résolus dans v1.1.0
- ~~**Flux audio mobile instable**~~ : CORRIGÉ - Peter parle maintenant fiablement après chaque interaction
- ~~**Bouton Rejouer incorrect**~~ : CORRIGÉ - Retourne maintenant correctement à l'écran de titre

---

## 🔮 Évolutions Futures

### Court Terme (V2)

- [ ] Persistance des sessions (PostgreSQL via Drizzle)
- [ ] Authentification simple (code classe)
- [ ] Dashboard enseignant (statistiques, scores)
- [ ] Multi-niveaux (pollution marine, changement climatique)
- [ ] Mode hors-ligne (cache audio)

### Moyen Terme (V3)

- [ ] RAG avancé avec Pinecone (base de connaissances étendue)
- [ ] Voice cloning custom pour Peter
- [ ] Analytics avancées (temps de réponse, patterns)
- [ ] Mode collaboratif (travail en équipe)
- [ ] Multilingue (EN, ES, DE)

### Long Terme

- [ ] Fine-tuning GPT personnalisé
- [ ] Génération d'images dynamiques (DALL-E)
- [ ] Gamification avancée (badges, classements)
- [ ] Intégration LMS (Moodle, Canvas)
- [ ] Application mobile native (React Native)

---

## 🤝 Contribution

Les contributions sont les bienvenues ! Pour contribuer :

1. Fork le projet
2. Créer une branche (`git checkout -b feature/AmazingFeature`)
3. Commit les changements (`git commit -m 'Add AmazingFeature'`)
4. Push vers la branche (`git push origin feature/AmazingFeature`)
5. Ouvrir une Pull Request

### Guidelines

- Respecter l'architecture existante
- Ajouter des tests si possible
- Documenter les nouvelles fonctionnalités
- Suivre les conventions TypeScript/React

---

## 📄 License

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.

---

## 👥 Auteurs & Remerciements

- **Équipe Projet** : Développement initial et concept pédagogique
- **OpenAI** : APIs Whisper et GPT-4o-mini
- **ElevenLabs** : API Text-to-Speech
- **Communauté Open Source** : shadcn/ui, Radix, Tailwind, et tous les packages utilisés

---

## 📞 Contact & Support

- **Documentation complète** : [ARCHITECTURE.md](./ARCHITECTURE.md)
- **Historique des changements** : [CHANGELOG.md](./CHANGELOG.md)
- **Product Requirements** : [attached_assets/Prototype-Dilemme-Light_PRD_1762430698665.md](./attached_assets/Prototype-Dilemme-Light_PRD_1762430698665.md)
- **Issues** : [GitHub Issues](https://github.com/Ulrfis/Dilemme-Plastiqueproto-Light/issues)

---

## 📊 Statistiques du Projet

| Métrique | Valeur |
|----------|--------|
| Lignes de code | ~5,000 |
| Composants React | 15+ |
| Routes API | 6 |
| Dépendances | 80+ |
| Temps dev | V1 Prototype |
| Technologies | 10+ |

---

<div align="center">

**Fait avec ❤️ pour l'éducation et l'environnement**

[⬆ Retour en haut](#dilemme-plastique---prototype-light-)

</div>
