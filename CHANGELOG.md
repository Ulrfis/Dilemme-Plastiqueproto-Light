# Changelog

Historique des modifications du projet Dilemme Plastique - Prototype Light.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [1.6.0] - 2026-01-02

### Ajouté - Tracking PostHog Enrichi et Identification Utilisateur

- **Identification Utilisateur** (commit b792c57)
  - Appel à `posthog.identify()` dès que l'utilisateur entre son nom.
  - Ajout de propriétés personnalisées (`name`, `signup_date`).
  - Fichier: `client/src/App.tsx`

- **Tracking d'Événements Avancé** (commit 3d8b862)
  - Nouveaux événements : `session_started`, `session_ended`, `app_backgrounded`, `demo_abandoned`, `demo_completed`.
  - Enrichissement des événements existants avec le nom de l'utilisateur et des métadonnées contextuelles.
  - Système de détection d'abandon automatique sur les pages protégées.
  - Fichier: `client/src/App.tsx`

---

## [1.5.0] - 2026-01-02

### Ajouté - Navigation Multi-Routes avec Persistance Session

- **SessionFlowContext** (commit 6a6e745)
  - Nouveau contexte React centralisé pour l'état de session
  - Gestion unifiée : messages, indices trouvés, score, placements drag-drop, synthèse
  - Persistance automatique via sessionStorage (survit à la navigation)
  - Sauvegarde synchrone pour sessionId/userName (évite les race conditions)
  - Fichier: `client/src/contexts/SessionFlowContext.tsx`

- **Navigation Wouter Multi-Routes** (commit 6a6e745)
  - Refactorisation de la navigation useState vers wouter routes
  - Routes individuelles : `/`, `/video`, `/welcome`, `/tutorial`, `/game`, `/synthesis`, `/feedback`, `/complete`
  - Support complet des boutons back/forward du navigateur
  - Historique de navigation fonctionnel
  - Fichier: `client/src/App.tsx`

- **Validation Hybride des Sessions** (commit 19b4722)
  - Protection des routes sensibles (tutorial, game, synthesis, feedback)
  - Double vérification : état React + sessionStorage direct
  - Résolution des race conditions lors de la création de session
  - Redirection vers `/` si pas de session valide
  - Fichier: `client/src/App.tsx`

### Modifié

- **TutorialScreen** : Lecture/écriture des messages via SessionFlowContext
- **DragDropGame** : Persistance des placements via SessionFlowContext  
- **SynthesisScreen** : Persistance de la synthèse via SessionFlowContext
- **replit.md** : Documentation mise à jour avec nouvelle architecture de routing

### Architecture

**Avant :**
```
App.tsx (useState navigation)
└── currentScreen: 'title' | 'video' | 'welcome' | ... (en mémoire)
```

**Après :**
```
App.tsx (wouter routes)
├── SessionFlowProvider (contexte + sessionStorage)
│   ├── Route "/" → TitlePage
│   ├── Route "/video" → VideoPage  
│   ├── Route "/welcome" → WelcomePage
│   ├── Route "/tutorial" → TutorialPage (protected)
│   ├── Route "/game" → GamePage (protected)
│   ├── Route "/synthesis" → SynthesisPage (protected)
│   ├── Route "/feedback" → FeedbackPage (protected)
│   └── Route "/complete" → CompletePage
```

### Tests

- Test E2E Playwright validé : navigation back/forward avec persistance session
- Conversation préservée lors du retour sur `/tutorial`
- Indices et placements maintenus entre les écrans

---

## [1.4.0] - 2025-12-10

### Ajouté - Jeu de Reconstruction de Phrase

- **DragDropGame Component** (commit 751b41e)
  - Nouveau jeu interactif après le tutoriel
  - Mode click-to-select/place pour meilleure UX mobile
  - Reconstruction de phrase sur le thème du plastique
  - Glisser-déposer ou clic pour placer les mots
  - Validation automatique de l'ordre correct
  - Feedback visuel immédiat (✓ ou ✗)
  - Bouton "Réessayer" si erreur
  - Transition fluide vers l'écran de synthèse
  - Fichier: `client/src/components/DragDropGame.tsx`

- **SynthesisScreen Component** (commit 751b41e)
  - Nouvel écran de synthèse finale
  - Affichage de la synthèse personnalisée générée par Peter
  - Visualisation des synthèses publiques d'autres utilisateurs
  - Système de vote (upvote) pour les synthèses
  - Bouton vers le questionnaire de feedback
  - Fichier: `client/src/components/SynthesisScreen.tsx`

- **Flux applicatif enrichi** (commit 4a7913e)
  - Nouveau parcours : Titre → Vidéo → Setup → Tutoriel → **Jeu → Synthèse** → Score
  - Transition automatique entre les écrans
  - Meilleure expérience pédagogique avec phase de réflexion (jeu)
  - Fichier: `client/src/pages/Home.tsx`

### Modifié - Conversation avec Peter

- **Amélioration qualité vocale française** (commit b59e3ef)
  - Passage au modèle `eleven_multilingual_v2` (ElevenLabs)
  - Augmentation de la stabilité vocale : 0.5 → 0.65
  - Ajout du `speaker_boost` pour plus de clarté
  - Réduction de `optimize_streaming_latency` : 4 → 2
  - Diction française plus naturelle et fluide
  - Fichier: `server/routes.ts`

- **Correction ordre de lecture audio** (commit b59e3ef)
  - Fix de l'ordre de lecture des phrases streamées
  - Tri par index pour garantir la séquence correcte
  - Fonction `reset()` pour nettoyer la queue entre les tours
  - Attente de la phrase attendue avant lecture
  - Fichier: `client/src/hooks/useAudioQueue.ts`

- **Contexte de conversation enrichi** (commit b59e3ef)
  - Ajout du contexte pour le 7ème échange (dernière chance)
  - Ajout du contexte pour le 8ème échange (au revoir personnalisé)
  - Peter adapte son discours selon le nombre d'échanges
  - Meilleure gestion de fin de conversation
  - Fichier: `server/routes.ts`

- **Refactorisation TutorialScreen** (commit 751b41e)
  - Gestion plus robuste du flux conversationnel
  - Meilleur suivi des indices trouvés
  - Détection des mots-clés améliorée
  - Fichier: `client/src/components/TutorialScreen.tsx`

### Modifié - Questionnaire de Feedback

- **Regroupement par chapitre** (commit e845fae)
  - Questions groupées par catégorie au lieu de question par question
  - Affichage du titre du chapitre en grand (3xl/4xl)
  - 3 questions par page (Scénario, Gameplay, Feeling, etc.)
  - Validation par chapitre complet
  - Barre de progression mise à jour par chapitre
  - Meilleure expérience utilisateur (moins de clics)
  - Fichier: `client/src/components/FeedbackSurvey.tsx`

### Corrigé

- **Encodage de texte** (commit e9bd7b3)
  - Correction des erreurs d'encodage sur plusieurs composants d'interface
  - Caractères spéciaux français correctement affichés
  - Accents et ponctuation corrigés

### Dépendances

- **Ajout de @dnd-kit** (commit 751b41e)
  - `@dnd-kit/core` : Gestion du drag-and-drop
  - `@dnd-kit/utilities` : Utilitaires CSS pour animations
  - Support tactile et souris pour le jeu

---

## [1.3.1] - 2025-11-29

### Modifié - Organisation du Repository

- **Restructuration de la documentation** (commit [WIP])
  - Déplacement de tous les fichiers de documentation vers le dossier `Documentation/`
  - Fichiers déplacés :
    - `ARCHITECTURE.md` → `Documentation/ARCHITECTURE.md`
    - `PHASE1_OPTIMIZATIONS.md` → `Documentation/PHASE1_OPTIMIZATIONS.md`
    - `PHASE2_OPTIMIZATIONS.md` → `Documentation/PHASE2_OPTIMIZATIONS.md`
    - `TESTING.md` → `Documentation/TESTING.md`
    - `SETUP.md` → `Documentation/SETUP.md`
    - `design_guidelines.md` → `Documentation/design_guidelines.md`
    - `replit.md` → `Documentation/replit.md`
    - `attached_assets/Prototype-Dilemme-Light_PRD_1762430698665.md` → `Documentation/Prototype-Dilemme-Light_PRD_1762430698665.md`
  - Mise à jour de tous les liens dans le README
  - Structure du projet plus claire et organisée

---

## [1.3.0] - 2025-11-28

### Ajouté - Persistance Base de Données PostgreSQL

- **Tables de base de données** (commit [WIP])
  - `tutorial_sessions` : Sessions utilisateurs avec indices trouvés, score, synthèse finale
  - `conversation_messages` : Historique des conversations avec Peter
  - `feedback_surveys` : Formulaire de feedback utilisateur complet
  - ORM Drizzle avec PostgreSQL (Neon sur Replit)
  - Fichier: `shared/schema.ts`

- **Google Sheets Sync** (commit [WIP])
  - Synchronisation automatique des sessions vers Google Sheets
  - Synchronisation automatique des feedbacks vers Google Sheets
  - Détection dynamique du nom de la feuille (plus de "Sheet1" hardcodé)
  - ID du spreadsheet récupéré depuis le connecteur Replit
  - Endpoint de diagnostic `/api/health/sheets/test`
  - Logs détaillés à chaque étape pour debug
  - Fichier: `server/google-sheets-sync.ts`

### Ajouté - Formulaire de Feedback Typeform-Style

- **FeedbackSurvey Component** (commit [WIP])
  - Navigation écran par écran (style Typeform)
  - Barre de progression en haut
  - Animations fluides entre questions
  - Fichier: `client/src/components/FeedbackSurvey.tsx`

- **Questions de feedback** (16 questions rating 1-6)
  - **Scénario** : Compréhension, Objectifs clairs, Lien indices
  - **Gameplay** : Explication, Simplicité, Réponses bot
  - **Feeling** : Originalité, Plaisant, Intéressant
  - **Motivation** : Envie continuer, Motivant, Thème éco
  - **Interface** : Visuel joli, Visuel clair, Voix agréable
  - **Note globale** : Note du tutoriel

- **Champs supplémentaires**
  - Texte libre : "Quelles améliorations verrais-tu ?"
  - Oui/Non : Veux-tu être au courant ? → Email si oui
  - Oui/Non : Recommanderais-tu ? → Bouton Partager si oui
  - Oui/Non : Utilisation à l'école ?

- **Bouton plastique sur Syntheses** (commit [WIP])
  - Style plastique bleu avec dégradé
  - Texte: "Donner votre avis sur l'expérience !"
  - Fichier: `client/src/pages/Syntheses.tsx`

- **API Feedback** (commit [WIP])
  - `POST /api/feedback` : Créer un feedback
  - `GET /api/feedback/:sessionId` : Récupérer un feedback
  - Fichier: `server/routes.ts`

### Ajouté - Animation Bouteille Explosion

- **Bouteille plastique plus grande** (commit [WIP])
  - Taille augmentée : 200x320px → 280x450px
  - Textes sur étiquette plus grands
  - Fichier: `client/src/components/SuccessFeedback.tsx`

- **Effet explosion confetti** (commit [WIP])
  - Bouteille qui se minimise rapidement (scale 0)
  - 120 particules confetti explosant depuis le centre
  - Animation `bottle-explode` : grossit légèrement puis rétrécit
  - Tremblement intense avant explosion (0.5s)
  - Fichier: `client/src/components/SuccessFeedback.tsx`

### Ajouté - Nouvelles Routes API

| Route | Méthode | Description |
|-------|---------|-------------|
| `/api/feedback` | POST | Créer un feedback |
| `/api/feedback/:sessionId` | GET | Récupérer feedback par session |
| `/api/health/sheets/test` | GET | Tester connexion Google Sheets |
| `/api/syntheses` | GET | Liste des synthèses publiques |
| `/api/syntheses/:id/upvote` | PATCH | Voter pour une synthèse |

---

## [1.2.0] - 2025-11-28

### Ajouté - Phase 2: Streaming Architecture (⚡ 4-7s latency reduction)

- **LLM Sentence Streaming** (commit 38bb365)
  - Nouveau endpoint `/api/chat/stream` avec Server-Sent Events (SSE)
  - Détection de frontières de phrases avec regex `/[.!?]\s+$/`
  - Diffusion progressive sentence par sentence au client
  - Permet démarrage TTS pendant que le LLM génère encore
  - Fichier: `server/routes.ts` (lignes 195-368)

- **ElevenLabs Streaming TTS** (commit 38bb365)
  - Nouveau endpoint `/api/text-to-speech/stream`
  - Utilise l'API ElevenLabs `/stream` avec `optimize_streaming_latency: 3`
  - Streaming de chunks audio au client pendant génération
  - Cache toujours la réponse complète (intégration Phase 1)
  - Fichier: `server/routes.ts` (lignes 118-242)

- **Audio Queue Manager** (commit 38bb365)
  - Nouveau hook `useAudioQueue` pour lecture séquentielle
  - Gestion FIFO des blobs audio (sentence par sentence)
  - Lecture automatique pendant que nouvelles sentences arrivent
  - Support interruptions utilisateur (clear queue)
  - Fichier: `client/src/hooks/useAudioQueue.ts` (nouveau fichier)

- **Streaming API Client** (commit 38bb365)
  - Fonction `sendChatMessageStreaming()` avec callbacks SSE
  - Fonction `textToSpeechStreaming()` pour streaming TTS
  - Architecture callback-based pour mises à jour temps réel
  - Fichier: `client/src/lib/api.ts` (lignes 84-172)

- **TutorialScreen Streaming Integration** (commit 38bb365)
  - Flag `useStreaming` (défaut: `true`) pour activer/désactiver
  - Fonction `processMessageStreaming()` pour pipeline parallèle
  - Affichage progressif UI (style ChatGPT)
  - Fallback automatique vers non-streaming en cas d'erreur
  - Préservation de tous les correctifs mobiles existants
  - Fichier: `client/src/components/TutorialScreen.tsx`

- **Documentation Phase 2**
  - `PHASE2_OPTIMIZATIONS.md` créé avec documentation complète
  - Diagrammes d'architecture avant/après
  - Guide de test et monitoring
  - Instructions de rollback

### Ajouté - Phase 1: Quick Wins (⚡ 2-4s latency reduction)

- **TTS Response Caching** (commit d936b6d)
  - Cache basé sur hash MD5 du texte
  - Stockage en mémoire avec éviction LRU
  - Limite de 100 entrées pour éviter memory leaks
  - Headers `X-Cache: HIT/MISS` pour debugging
  - Gain: 1-3s pour phrases répétées (instantané!)
  - Fichier: `server/routes.ts` (lignes 12-15, 125-139, 187-196)

- **API Connection Warming** (commit d936b6d)
  - Keepalive OpenAI toutes les 30 secondes
  - Appel léger `openai.models.list()` pour maintenir connexion
  - Élimine latence TCP/TLS handshake
  - Warmup initial après 5 secondes de démarrage serveur
  - Gain: 300-800ms par requête
  - Fichier: `server/index.ts` (lignes 81-108)

- **DNS Prefetch & Preconnect** (commit d936b6d)
  - Tags `<link rel="dns-prefetch">` pour api.openai.com et api.elevenlabs.io
  - Tags `<link rel="preconnect">` pour établir connexions TCP/TLS tôt
  - Résolution DNS pendant le chargement de la page
  - Gain: 200-500ms sur première requête
  - Fichier: `client/index.html` (lignes 13-18)

- **Smart Audio Keepalive** (commit d936b6d)
  - Intervalle optimisé de 2s → 5s
  - Réduit overhead mobile de 60%
  - Toujours suffisant pour prévenir suspension AudioContext
  - Gain: 1-2s sur mobile (moins d'overhead)
  - Fichier: `client/src/hooks/useVoiceInteraction.ts` (lignes 134-140)

- **Documentation Phase 1**
  - `PHASE1_OPTIMIZATIONS.md` créé avec guide complet
  - Métriques de performance détaillées
  - Instructions de monitoring
  - Checklist de test

### Performance

**Impact Global Phase 1 + 2:**
- Temps total avant : 7-20 secondes
- Temps total après : 3-10 secondes
- **Réduction : 6-11 secondes (-40 à -55%)**

**Temps jusqu'au premier audio:**
- Avant : ~7 secondes
- Après : ~3.3 secondes
- **Réduction : -53%**

**Architecture:**
- Avant : Pipeline séquentiel (STT → LLM → TTS → Play)
- Après : Pipeline parallèle (STT → LLM S1 + TTS S1 + Play simultané)

---

## [1.1.0] - 2025-11-21

### Corrigé
- **TTS sur mobile - Reprise automatique de l'audio** (commit [WIP])
  - Détection automatique du pause audio inattendu sur mobile
  - Tentative de reprise (resume) après 100ms quand l'audio est pausé accidentellement
  - Flag `audioExplicitlyStoppedRef` pour différencier pause intentionnelle vs accidentelle
  - Gestion des cas d'erreur lors de la reprise
  - Fichier: `client/src/hooks/useVoiceInteraction.ts`

- **Message plein écran sur vidéo intro** (commit [WIP])
  - Message "Mode paysage fortement recommandé" masqué quand vidéo est en fullscreen
  - Tracking d'état fullscreen via `fullscreenchange` event listener
  - Amélioration UX: moins d'informations parasites en fullscreen
  - Fichier: `client/src/components/VideoIntro.tsx`

---

## [2025-11-15]

### Corrigé
- **Lecture audio critique sur mobile** (commit 444d662, 15:30:37)
  - Pré-chargement explicite de l'audio avant play()
  - Vérification du readyState de l'audio
  - Timeout de détection si play() ne démarre pas (5s)
  - Logs détaillés à chaque étape du flux audio
  - Événements audio supplémentaires (loadeddata, canplay, waiting, stalled)
  - Fichier: `client/src/hooks/useVoiceInteraction.ts`

- **Flux audio mobile et bouton rejouer** (commit 76b5429, 15:00:50)
  - Validation des blobs audio côté client et serveur
  - Nettoyage complet des éléments Audio entre les lectures
  - Détection automatique d'états bloqués avec récupération
  - Timeouts de sécurité améliorés (10s de marge pour mobile)
  - Bouton "Rejouer le tutoriel" retourne maintenant à l'écran de titre
  - Fichiers: `useVoiceInteraction.ts`, `TutorialScreen.tsx`, `api.ts`, `routes.ts`, `Home.tsx`

### Ajouté
- **Documentation projet** (commit c0befea, 15:17:59)
  - CHANGELOG.md créé
  - README.md mis à jour avec section "Dernières Améliorations"
  - ARCHITECTURE.md mis à jour avec détails des corrections v1.1.0

- **Avatar Peter** (commits 192cd51, 6f941de, 16b5bee, 14:44-14:48)
  - Nouvelle image d'avatar pour l'agent IA Peter

- **Lecteur vidéo et activation vocale** (commit 24b4a6e, 14:45:05)
  - Corrections du lecteur vidéo
  - Corrections du bouton d'activation vocale

- **Message de bienvenue audio** (commit 7d8fb0b, 14:27:52)
  - Lecture automatique du message de bienvenue de Peter

- **Écran de titre** (commit e749c83, 14:26:20)
  - Agrandissement de l'image principale
  - Suppression des liens légaux

- **Corrections mobile** (commits c3ea03f, d009f57, a10e41b, 13:38-14:06)
  - Désactivation autoplay vidéo
  - Corrections voix de Peter sur mobile
  - Redesign layout desktop
  - Fiabilité interaction vocale mobile

---

## Notes

- Tous les commits "Published your App" sont des déploiements automatiques
- Les dates sont au format UTC (temps universel)
- Version actuelle : 1.5.0
