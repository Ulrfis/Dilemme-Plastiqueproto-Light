# Dilemme Plastique - Prototype Light 🌍

> Application éducative interactive avec IA vocale pour découvrir les enjeux environnementaux à travers l'analyse d'images guidée par un assistant virtuel.

![Version](https://img.shields.io/badge/version-1.6.2-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Node](https://img.shields.io/badge/node-20.x-brightgreen.svg)
![Mobile](https://img.shields.io/badge/mobile-optimized-success.svg)
![Latency](https://img.shields.io/badge/latency-⚡_3--10s-success.svg)
![Database](https://img.shields.io/badge/database-PostgreSQL-blue.svg)
![Google Sheets](https://img.shields.io/badge/sync-Google_Sheets-green.svg)

---

## 🆕 Version Actuelle (v1.6.2 - February 16)

### 🛡️ Robustesse Sans Changer la Mécanique
- **Lecture session sécurisée** : ajout d'un helper unique pour lire `sessionStorage` sans crash si payload corrompu, avec nettoyage automatique des données invalides.
- **Routes protégées durcies** : suppression des `JSON.parse` répétés dans le routing et fallback cohérent React state + storage.
- **Effets globaux stabilisés** : écouteurs `beforeunload` / `visibilitychange` et timer d'init analytics déplacés dans des `useEffect` avec cleanup.

### 📱 Desktop + Smartphone: Stabilité UI
- **Viewport modernisé** : `viewport-fit=cover` pour mieux gérer les safe areas sur iOS/Android.
- **Hauteur mobile fiable** : usage de `100dvh` pour limiter les sauts de layout avec la barre navigateur mobile.
- **Vidéo intro fiabilisée** : correction du nettoyage des listeners `play/pause`, `onloadedmetadata` natif, playlist mémorisée.

### ⚡ Latence Perçue & UX
- **Démarrage protégé contre double tap/click** : état `Démarrage...` sur l'écran prénom pour éviter doubles créations de session.
- **Rendu conversation optimisé** : avatars en `loading="lazy"` + `decoding="async"`.
- **Analytics allégé hors dev** : `posthog.debug(true)` activé seulement en local (`localhost` / `127.0.0.1`).

---

## 🚀 Améliorations Précédentes (v1.6.1 - February 4)

### 🟢 Démarrage Immédiat & Sessions Propres
- **Plus d'écran « Prêt à commencer »** : l'audio est déverrouillé et le message de bienvenue joue automatiquement en arrivant sur le tutoriel.
- **Reset fiable** : bouton « Nouvelle session » (desktop + mobile), purge complète de l'état + `posthog.reset()` et paramètre `?fresh=1` pour forcer une session neuve.

### 📱 Conversation Plus Stable
- **Messages à ID stables** : évite les sauts de scroll et les collisions de clés.
- **Auto-scroll intelligent** : ne recolle au bas que si l'utilisateur est proche du pied de conversation, bulles avec `min-height` pour limiter les jumps.
- **Vue mobile respirable** : image réduite à ~26vh, zone de chat plus grande.

### 🎉 Écran Final Enrichi
- **Partager l'expérience** : bouton de partage natif (fallback copie lien) vers l'URL publique.
- **Rejouer proprement** : bouton « Recommencer l'expérience » qui fait un refresh complet pour repartir à zéro.

---

## 🚀 Améliorations Précédentes (v1.6.0 - January 2)

### 📊 Tracking PostHog Enrichi
- **Identification Utilisateur** : Identification automatique des élèves par leur nom via `posthog.identify()`.
- **Tracking Complet** : Suivi des événements d'initialisation, d'utilisation des fonctionnalités, et de complétion/abandon.
- **Analyse d'Engagement** : Mesure précise de la progression et des points de friction dans le parcours utilisateur.

---

## 🚀 Améliorations Précédentes (v1.5.0 - January 2)

### 🔀 Navigation Multi-Routes avec Persistance Session

- **Routes individuelles** : Chaque écran a maintenant sa propre URL (`/tutorial`, `/game`, `/synthesis`, etc.)
- **Boutons back/forward** : Navigation avec l'historique du navigateur entièrement fonctionnelle
- **Persistance de session** : Conversation, indices trouvés et progression sauvegardés automatiquement
- **Retour intelligent** : Les utilisateurs retrouvent leur conversation en cours s'ils reviennent en arrière

### Architecture Technique

- **SessionFlowContext** : Contexte React centralisé avec sauvegarde sessionStorage
- **Validation hybride** : Protection des routes via React state + sessionStorage direct
- **Zéro perte de données** : Les race conditions de navigation sont gérées

---

## 🚀 Améliorations Précédentes (v1.4.0 - December 10)

### 🎮 Jeu de Reconstruction de Phrase

- **Jeu interactif post-tutoriel** : Après avoir trouvé les 4 indices, les élèves reconstituent une phrase clé sur le plastique
- **Mode click-to-select/place** : Optimisé pour mobile, glisser-déposer ou simple clic
- **Feedback immédiat** : Validation automatique avec indicateurs visuels (✓ ou ✗)
- **Phase de réflexion** : Renforce l'apprentissage avant la synthèse finale

### 📊 Écran de Synthèse Enrichi

- **Synthèse personnalisée** : Peter génère une synthèse unique basée sur la conversation
- **Synthèses publiques** : Visualisation des synthèses d'autres utilisateurs
- **Système de vote** : Les élèves peuvent voter pour leurs synthèses préférées
- **Parcours complet** : Titre → Vidéo → Setup → Tutoriel → **Jeu → Synthèse** → Feedback

### 🎙️ Amélioration Vocale de Peter

- **Diction française optimisée** : Passage au modèle `eleven_multilingual_v2` avec stabilité accrue (0.65)
- **Clarté améliorée** : Ajout du `speaker_boost` pour une meilleure intelligibilité
- **Ordre audio corrigé** : Les phrases streamées sont maintenant lues dans le bon ordre
- **Contexte conversationnel** : Peter adapte son discours selon le nombre d'échanges (7ème et 8ème échanges personnalisés)

### 📝 Questionnaire par Chapitre

- **Questions regroupées** : 3 questions par page au lieu d'une par une
- **Navigation simplifiée** : Progression par chapitre (Scénario, Gameplay, Feeling, etc.)
- **Meilleure UX** : Moins de clics, validation par groupe de questions

---

## 🚀 Améliorations Précédentes (v1.3.1 - November 29)

### 📁 Organisation du Repository

- **Restructuration de la documentation** : Tous les fichiers de documentation ont été déplacés dans le dossier `Documentation/`
- **Structure claire** : Séparation entre documentation et code source
- **Liens mis à jour** : README et structure de projet reflètent la nouvelle organisation

---

## 🚀 Améliorations Précédentes (v1.3.0 - November 28)

### 💾 Persistance Base de Données PostgreSQL

- **Tables de base de données** : Sessions, Messages, Feedbacks
- **ORM Drizzle** avec PostgreSQL (Neon sur Replit)
- **Google Sheets Sync** : Synchronisation automatique des données

### 📝 Formulaire de Feedback Typeform-Style

- **20 questions** réparties en 6 catégories (note 1-6)
- **Navigation écran par écran** avec barre de progression
- **Champs conditionnels** : email si veut être contacté, partage si recommande
- **Sync automatique** vers Google Sheets

### 🍾 Animation Bouteille Explosion

- Bouteille plastique plus grande (280x450px)
- Effet explosion confetti avec 120 particules
- Animation de minimisation rapide

---

## 🆕 Améliorations v1.2.0 - Optimisations Latence

### ⚡ Optimisations Latence Majeure - Phase 1 & 2

La version 1.2.0 apporte des **optimisations architecturales majeures** qui réduisent la latence conversationnelle de **6-11 secondes** !

#### 🎯 Phase 1: Quick Wins (2-4s de réduction)
- **TTS Response Caching** : Cache MD5 avec éviction LRU (100 entrées max)
- **API Connection Warming** : Keepalive OpenAI toutes les 30s
- **DNS Prefetch/Preconnect** : Pré-connexion aux APIs (OpenAI, ElevenLabs)
- **Smart Audio Keepalive** : Intervalle optimisé de 2s → 5s (60% moins d'overhead)

#### 🔥 Phase 2: Streaming Architecture (4-7s de réduction)
- **LLM Sentence Streaming** : SSE pour diffusion progressive sentence par sentence
- **ElevenLabs Streaming TTS** : Audio généré en parallèle du LLM
- **Audio Queue Manager** : Lecture séquentielle des chunks audio
- **Progressive UI** : Affichage ChatGPT-style du texte en temps réel

#### 📊 Impact Performance
```
Avant : 7-20 secondes d'attente
Après : 3-10 secondes d'attente (⚡ 4-11s plus rapide!)

Temps jusqu'au premier audio :
- Avant : ~7 secondes
- Après  : ~3.3 secondes (✨ -53% de latence!)
```

---

## 🆕 Améliorations Précédentes (v1.1.0 - November 21)

### ✅ Flux Audio Mobile Robuste
La version 1.1.0 apporte des **corrections critiques** pour le flux audio mobile :
- **Reprise automatique audio** : Détection du pause audio inattendu, tentative de reprise après 100ms
- **Différenciation intentionnalité** : Flag pour distinguer les pauses intentionnelles des pauses accidentelles
- **Problème résolu** : Peter parle maintenant de manière fiable après chaque interaction utilisateur
- **Détection de blocages** : Système automatique qui détecte et récupère les états audio bloqués
- **Validation robuste** : Vérification des données audio à chaque étape (client et serveur)
- **Timeouts améliorés** : Marges de sécurité augmentées pour les connexions mobiles lentes

### 🎬 Vidéo Intro Améliorée
- Message "Mode paysage fortement recommandé" masqué automatiquement quand la vidéo est en fullscreen
- Meilleure UX: affichage du message uniquement quand utilisateur n'est pas en fullscreen

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
4. **Tutoriel interactif** - Découverte des 4 indices avec Peter
5. **Jeu de reconstruction** - Reconstruction d'une phrase sur le plastique
6. **Synthèse finale** - Synthèse personnalisée + synthèses publiques
7. **Questionnaire** - Feedback sur l'expérience (optionnel)

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
│  │  - Audio Queue Manager (Phase 2)         │   │
│  └──────────────────────────────────────────┘   │
└────────────────┬────────────────────────────────┘
                 │
                 │ HTTP/REST API + SSE (Phase 2)
                 ▼
┌─────────────────────────────────────────────────┐
│         SERVER (Express + Node.js)              │
│  ┌──────────────────────────────────────────┐   │
│  │  POST /api/speech-to-text                │   │
│  │  ├─ OpenAI Whisper (STT)                 │   │
│  │                                           │   │
│  │  POST /api/chat/stream (Phase 2)         │   │
│  │  ├─ GPT-4o-mini (Streaming SSE)          │   │
│  │  ├─ MemStorage (Session + Messages)      │   │
│  │  ├─ Clue Detection Logic                 │   │
│  │  └─ Sentence-by-sentence delivery        │   │
│  │                                           │   │
│  │  POST /api/text-to-speech/stream         │   │
│  │  ├─ ElevenLabs Streaming API (Phase 2)   │   │
│  │  ├─ TTS Cache (Phase 1)                  │   │
│  │  └─ Connection Warming (Phase 1)         │   │
│  └──────────────────────────────────────────┘   │
└─────────────────────────────────────────────────┘
```

### Flux de Données Détaillé

**Architecture Streaming (Phase 2):**

```
User → STT → LLM Sentence 1 ┬→ TTS 1 → Queue → Play immediately
                            ├→ TTS 2 → Queue → Play next
                            └→ TTS 3 → Queue → Play last

Audio starts at ~3.3s (vs 7s before!)
```

**Architecture Legacy:**
**1. Enregistrement Audio** → **2. Transcription (Whisper)** → **3. Analyse IA (GPT)** → **4. Synthèse Vocale (ElevenLabs)** → **5. Lecture Audio**

📖 **Documentation complète** : [ARCHITECTURE.md](./Documentation/ARCHITECTURE.md)
📊 **Détails Phase 1** : [PHASE1_OPTIMIZATIONS.md](./Documentation/PHASE1_OPTIMIZATIONS.md)
🔥 **Détails Phase 2** : [PHASE2_OPTIMIZATIONS.md](./Documentation/PHASE2_OPTIMIZATIONS.md)

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

### Base de Données & Stockage

| Technologie | Version | Usage |
|------------|---------|-------|
| **PostgreSQL** | 15+ | Base de données principale |
| **Drizzle ORM** | 0.39.1 | ORM TypeScript |
| **Neon** | - | PostgreSQL serverless (Replit) |
| **Google Sheets API** | v4 | Synchronisation données |

### Schéma de Base de Données

```
┌──────────────────────────┐     ┌──────────────────────────┐
│    tutorial_sessions     │     │  conversation_messages   │
├──────────────────────────┤     ├──────────────────────────┤
│ id (PK)                  │     │ id (PK)                  │
│ userName                 │────▶│ sessionId (FK)           │
│ foundClues (JSONB)       │     │ role (user/assistant)    │
│ score                    │     │ content                  │
│ audioMode (voice/text)   │     │ detectedClue             │
│ completed                │     │ createdAt                │
│ threadId                 │     └──────────────────────────┘
│ finalSynthesis           │
│ messageCount             │     ┌──────────────────────────┐
│ upvotes                  │     │    feedback_surveys      │
│ completedAt              │     ├──────────────────────────┤
│ createdAt                │     │ id (PK)                  │
└──────────────────────────┘     │ sessionId (FK)           │
                                 │ userName                 │
                                 │ scenarioComprehension    │
                                 │ scenarioObjectives       │
                                 │ scenarioClueLink         │
                                 │ gameplayExplanation      │
                                 │ gameplaySimplicity       │
                                 │ gameplayBotResponses     │
                                 │ feelingOriginality       │
                                 │ feelingPleasant          │
                                 │ feelingInteresting       │
                                 │ motivationContinue       │
                                 │ motivationGameplay       │
                                 │ motivationEcology        │
                                 │ interfaceVisualBeauty    │
                                 │ interfaceVisualClarity   │
                                 │ interfaceVoiceChat       │
                                 │ overallRating            │
                                 │ improvements (text)      │
                                 │ wantsUpdates (bool)      │
                                 │ updateEmail              │
                                 │ wouldRecommend (bool)    │
                                 │ wantsInSchool (bool)     │
                                 │ createdAt                │
                                 └──────────────────────────┘
```

### Google Sheets Sync

La synchronisation Google Sheets permet d'exporter automatiquement :
- **Sessions** : Données de chaque session de tutoriel
- **Feedbacks** : Réponses au questionnaire de feedback

Configuration via Replit Connectors (OAuth2 automatique).

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
│   │   │   ├── DragDropGame.tsx        # Jeu de reconstruction
│   │   │   ├── SynthesisScreen.tsx     # Écran de synthèse
│   │   │   ├── ScoreScreen.tsx         # Écran score
│   │   │   ├── TitleScreen.tsx         # Écran titre
│   │   │   ├── VideoIntro.tsx          # Vidéo introduction
│   │   │   ├── WelcomeSetup.tsx        # Configuration initiale
│   │   │   ├── FeedbackSurvey.tsx      # Questionnaire de feedback
│   │   │   ├── ZoomableImage.tsx       # Image zoomable
│   │   │   ├── SuccessFeedback.tsx     # Animations succès
│   │   │   └── ui/                     # Composants shadcn/ui
│   │   ├── hooks/
│   │   │   ├── useVoiceInteraction.ts  # Hook gestion audio
│   │   │   ├── useAudioQueue.ts        # Hook queue audio streaming
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
│   └── generated_images/            # Images générées
│       ├── Peter_AI_mascot_character_ddfcb150.png
│       ├── Dilemme_app_logo_f1e850c1.png
│       └── ...
│
├── Documentation/                   # Documentation du projet
│   ├── ARCHITECTURE.md              # Documentation architecture détaillée
│   ├── PHASE1_OPTIMIZATIONS.md      # Optimisations Phase 1
│   ├── PHASE2_OPTIMIZATIONS.md      # Optimisations Phase 2
│   ├── TESTING.md                   # Guide de test
│   ├── SETUP.md                     # Guide d'installation
│   ├── design_guidelines.md         # Guidelines design
│   ├── replit.md                    # Documentation Replit
│   ├── Prototype-Dilemme-Light_PRD_1762430698665.md  # PRD
│   ├── FIX_QUESTIONNAIRE_STORAGE.md
│   ├── PLAN_DATABASE_GOOGLE_SHEETS.md
│   ├── DEBUG_PETER_CONVERSATION.md
│   └── UNIFIED_SESSION_STRUCTURE.md
│
├── CHANGELOG.md                     # Historique des modifications
├── README.md                        # Ce fichier
├── package.json                     # Dépendances & scripts
├── tsconfig.json                    # Config TypeScript
├── vite.config.ts                   # Config Vite
├── tailwind.config.ts               # Config Tailwind
└── drizzle.config.ts                # Config Drizzle ORM
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

### POST `/api/feedback`

Crée un nouveau feedback utilisateur.

**Request:**
```json
{
  "sessionId": "uuid-v4",
  "userName": "Sophie",
  "scenarioComprehension": 5,
  "scenarioObjectives": 6,
  "overallRating": 5,
  "improvements": "Plus de niveaux !",
  "wantsUpdates": true,
  "updateEmail": "sophie@email.com",
  "wouldRecommend": true,
  "wantsInSchool": true
}
```

**Response:**
```json
{
  "id": "uuid-v4",
  "sessionId": "uuid-v4",
  "createdAt": "2025-11-28T10:30:00Z",
  ...
}
```

### GET `/api/feedback/:sessionId`

Récupère le feedback d'une session.

### GET `/api/syntheses`

Liste les synthèses publiques (sessions complétées).

### PATCH `/api/syntheses/:id/upvote`

Vote pour une synthèse.

### GET `/api/health/sheets/test`

Teste la connexion Google Sheets et retourne les informations du spreadsheet.

**Response:**
```json
{
  "success": true,
  "message": "Connection successful",
  "details": {
    "spreadsheetId": "...",
    "spreadsheetTitle": "Mon Google Sheet",
    "sheetName": "Data From Replit",
    "allSheets": ["Data From Replit", "Feedbacks"]
  }
}
```

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

- **Stockage PostgreSQL** : Sessions et feedbacks persistés en base de données
- **Google Sheets Sync** : Export optionnel vers Google Sheets (configuré via Replit Connectors)
- **Prénom optionnel** : Utilisé uniquement pour personnaliser l'expérience
- **Audio non stocké** : Transcription immédiate puis suppression
- **Conformité RGPD** : Consentement explicite pour email de contact

### APIs Tierces

- **Clés API sécurisées** : Variables d'environnement serveur uniquement
- **Jamais exposées côté client** : Appels proxy via backend
- **Google Sheets OAuth2** : Via Replit Connectors (tokens auto-renouvelés)
- **Rate limiting** : Protection contre les abus (à implémenter)

### Permissions Navigateur

- **Microphone** : Demande explicite avec message clair
- **Fallback automatique** : Si refusé → mode texte
- **Feedback utilisateur** : Indicateurs visuels d'état micro

---

## 🚧 Limitations Connues (V1.4)

- **1 seul niveau** : Tutoriel uniquement (pas de progression multi-niveaux)
- **Pas de RAG étendu** : Base de connaissances limitée aux 4 indices
- **Coût API accru (Phase 2)** : 3-5× plus d'appels TTS par message (streaming)
- **Google Sheets Replit only** : Sync fonctionne uniquement sur Replit avec connecteur
- **1 seul jeu** : Un seul jeu de reconstruction de phrase (pas de variantes)

### ✅ Problèmes Résolus dans v1.4.0
- ~~**Pas de phase de réflexion**~~ : CORRIGÉ - Jeu de reconstruction de phrase ajouté
- ~~**Ordre audio incorrect**~~ : CORRIGÉ - Tri et synchronisation des phrases streamées
- ~~**Diction française perfectible**~~ : CORRIGÉ - Modèle eleven_multilingual_v2 avec speaker_boost
- ~~**Questionnaire long et fastidieux**~~ : CORRIGÉ - Questions regroupées par chapitre

### ✅ Problèmes Résolus dans v1.3.0
- ~~**Stockage temporaire**~~ : CORRIGÉ - PostgreSQL avec Drizzle ORM
- ~~**Pas de feedback utilisateur**~~ : CORRIGÉ - Formulaire Typeform-style complet
- ~~**Pas d'export données**~~ : CORRIGÉ - Sync automatique Google Sheets

### ✅ Problèmes Résolus dans v1.2.0
- ~~**Latence conversationnelle élevée**~~ : CORRIGÉ - Réduction de 6-11 secondes via streaming (Phase 1 + 2)
- ~~**Attente bloquante pendant génération TTS**~~ : CORRIGÉ - TTS parallèle au LLM
- ~~**Pas de cache TTS**~~ : CORRIGÉ - Cache MD5 avec 100 entrées max
- ~~**Connexions API froides**~~ : CORRIGÉ - Connection warming toutes les 30s

### ✅ Problèmes Résolus dans v1.1.0
- ~~**Flux audio mobile instable**~~ : CORRIGÉ - Peter parle maintenant fiablement après chaque interaction avec reprise automatique
- ~~**Audio pause sur mobile (2ème message+)**~~ : CORRIGÉ - Détection et reprise automatique du pause audio inattendu
- ~~**Message fullscreen visible**~~ : CORRIGÉ - Message "Mode paysage" masqué en fullscreen
- ~~**Bouton Rejouer incorrect**~~ : CORRIGÉ - Retourne maintenant correctement à l'écran de titre

---

## 🔮 Évolutions Futures

### Court Terme (V2)

- [x] ~~Persistance des sessions (PostgreSQL via Drizzle)~~ ✅ v1.3.0
- [x] ~~Export données Google Sheets~~ ✅ v1.3.0
- [x] ~~Formulaire feedback utilisateur~~ ✅ v1.3.0
- [x] ~~Jeu de réflexion post-tutoriel~~ ✅ v1.4.0
- [x] ~~Écran de synthèse avec partage~~ ✅ v1.4.0
- [ ] Authentification simple (code classe)
- [ ] Dashboard enseignant (statistiques, scores)
- [ ] Multi-niveaux (pollution marine, changement climatique)
- [ ] Jeux variés (quiz, timeline, matching)
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

- **Documentation complète** : [ARCHITECTURE.md](./Documentation/ARCHITECTURE.md)
- **Historique des changements** : [CHANGELOG.md](./CHANGELOG.md)
- **Product Requirements** : [Prototype-Dilemme-Light_PRD.md](./Documentation/Prototype-Dilemme-Light_PRD_1762430698665.md)
- **Issues** : [GitHub Issues](https://github.com/Ulrfis/Dilemme-Plastiqueproto-Light/issues)

---

## 📊 Statistiques du Projet

| Métrique | Valeur |
|----------|--------|
| Lignes de code | ~7,500 |
| Composants React | 20+ |
| Routes API | 12 |
| Tables DB | 3 |
| Dépendances | 90+ |
| Temps dev | V1.4 Prototype |
| Technologies | 13+ |

---

<div align="center">

**Fait avec ❤️ pour l'éducation et l'environnement**

[⬆ Retour en haut](#dilemme-plastique---prototype-light-)

</div>
