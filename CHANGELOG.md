# Changelog

Historique des modifications du projet Dilemme Plastique - Prototype Light.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [2.0.0] - 2026-05-02

### Corrigé — Peter suit les indices à chaque échange et propose "Poursuivre" à 6/6

- **Mémoire continue des indices** : avant, le contexte des indices trouvés n'était injecté que dans le *premier* message du thread OpenAI. Désormais, chaque message envoyé à Peter contient un bloc `[Suivi des indices: N/6 trouvés (X, Y) — manquants: A, B, C]` mis à jour en temps réel. Peter ne peut plus redemander un indice déjà trouvé lors d'un échange précédent.
- **Instructions adaptatives selon l'état des indices** :
  - 0 manquant (tous trouvés avant ou pendant cet échange) → Peter félicite par le prénom, récapitule les 6 indices, invite à cliquer sur « Poursuivre ».
  - 1 manquant → Peter guide vers cet indice précis ; s'il le valide dans sa réponse, il invite immédiatement à « Poursuivre ».
  - 7e échange → rappel de l'avant-dernier tour avec liste des manquants.
  - 8e échange → récap complet trouvés/manquants + invitation « Poursuivre ».
- **Fin de conversation dès 6/6** : côté client, lorsque `newFoundClues.length >= TOTAL_CLUES` dans le callback `onComplete` (streaming) ou après réception de la réponse (non-streaming), `conversationEnded` passe à `true` — le bouton « Poursuivre » (déjà vert et clignotant à 6/6) devient la seule action disponible.
- **Fix migration legacy sessions** : `SessionFlowContext` détecte au démarrage les sessions avec `sessionId` mais sans `accessToken` (créées avant l'introduction de l'auth par token) et les reset proprement pour éviter des 403 en cours de session.
- Fichiers : `server/routes.ts` (routes `/api/chat/stream` et `/api/chat`), `client/src/components/TutorialScreen.tsx`, `client/src/contexts/SessionFlowContext.tsx`.

### Ajouté — Bulle "Peter réfléchit" pendant la génération (réduction latence perçue)

- Dès l'envoi d'un message utilisateur, une bulle Peter "vivante" apparaît immédiatement dans la conversation, avant l'arrivée du premier mot de la vraie réponse — inspiré du pattern Claude d'Anthropic.
- Visuellement distincte des vraies réponses : fond semi-transparent (`bg-card/40`), bordure dashed, texte italique muted, avatar avec animation `bounce-subtle`, 3 points qui rebondissent en séquence (`animate-thinking-dot` avec délais 0/150/300ms).
- Phrases rotatives toutes les 2.8s (12 phrases mélangées : "Peter réfléchit", "Peter observe l'image", "Peter cherche au fond du sac plastique", "Peter trie les microplastiques", "Peter remonte la chaîne du plastique", etc.) avec transition `thinking-fade` entre chaque phrase.
- Disparaît dès que la première phrase de la vraie réponse arrive (streaming) ou dès l'arrivée de la réponse complète (non-streaming). Garde-fous sur tous les chemins terminaux : `onSentence` (premier appel), `onComplete`, `onError`, `catch` global, tous generation-scoped pour éviter les races avec d'anciens streams.
- Accessibilité : `role="status" aria-live="polite"`, support `prefers-reduced-motion` (`motion-reduce:animate-none` sur toutes les animations).
- Fichiers : `client/src/components/ConversationPanel.tsx` (nouveau composant `ThinkingBubble`), `client/src/components/TutorialScreen.tsx` (état `isThinking` + ref `firstSentenceReceivedRef`), `tailwind.config.ts` (keyframes `thinking-dot` et `thinking-fade`).

### Ajouté — Transcription Live Deepgram pendant l'enregistrement

- **Relais WebSocket serveur** (`server/deepgramRelay.ts`) : un `WebSocketServer({noServer:true})` est attaché au `http.Server` via l'événement `upgrade` sur le chemin `/ws/deepgram`. Pour chaque client il ouvre une connexion upstream vers `wss://api.deepgram.com/v1/listen` (nova-2, fr, `interim_results`, `smart_format`, `endpointing 300ms`). Les chunks audio binaires du client sont transférés vers Deepgram ; les messages `Results` JSON de Deepgram sont parsés et renvoyés au client sous la forme `{type:'transcript', transcript, isFinal}`.
- **Hook client** (`client/src/hooks/useDeepgramTranscription.ts`) : ouvre le WebSocket vers `/ws/deepgram`, démarre un second `MediaRecorder` (timeslice 250ms) sur le même `MediaStream`, envoie chaque chunk en `ArrayBuffer`. Cleanup automatique au démontage (`useEffect`).
- **Intégration** (`useVoiceInteraction`) : option `onLiveTranscript(text, isFinal)`. `deepgram.start()` lancé en parallèle au `MediaRecorder` Whisper dans `startRecording` ; `deepgram.stop()` appelé dans `stopRecording()` ET dans `reset()`.
- **Affichage** (`ConversationPanel`) : pendant `state==='recording'`, la zone de saisie affiche le texte Deepgram en temps réel avec un curseur clignotant (ou "À l'écoute…" avant le premier mot). En `state==='processing'`, le texte reste visible jusqu'à ce que Whisper retourne son résultat. Whisper reste la source de vérité pour le message envoyé à Peter — Deepgram est uniquement du feedback visuel.

### Amélioré — Waveform d'enregistrement bien plus visible

- 9 barres au lieu de 5, conteneur rehaussé `h-16 sm:h-20` (était `h-6 sm:h-8`)
- Gain perceptuel `sqrt(audioLevel) × 2.2` + plancher ambiant `0.12` pour que les barres soient toujours animées pendant l'enregistrement
- Opacité des barres proportionnelle au niveau, transition `75ms`

### Sécurité & Robustesse — Deepgram WebSocket

- **Auth obligatoire** : le handler `upgrade` valide `sessionId` + `token` (query params) contre `storage.getSession()` avant `handleUpgrade`. Rejets 401/403 avec destruction de socket.
- **Limite anti-abus par IP** : max 3 connexions simultanées par `req.socket.remoteAddress` (pas `x-forwarded-for` qui est client-contrôlable). Compteur incrémenté après l'attachement du hook `socket.once('close')` pour garantir un décrément même si l'upgrade échoue silencieusement.
- **Buffer audio plafonné** : `MAX_BUFFERED_CHUNKS=40` / `MAX_BUFFERED_BYTES=4MB` — les chunks les plus anciens sont supprimés en cas de dépassement (Deepgram lent ou indisponible).
- **Timeouts** : `UPSTREAM_OPEN_TIMEOUT_MS=8s` (ferme si Deepgram ne répond pas), `MAX_SESSION_DURATION_MS=5min` (hard kill anti-zombie).
- **Cleanup idempotent** : `cleanup()` câblé sur tous les chemins `close/error` client et upstream.

### Ajouté — Dashboard PostHog "Pipeline Latency Comparison"

- Dashboard créé via l'API PostHog (id=656626) : <https://eu.posthog.com/project/107669/dashboard/656626>
- 6 insights attachés : `Audio Playback Started p50/p95`, `TTS Phase 1 Ready p50/p95`, `TTS Phase 2 Ready p50/p95` — chacun avec breakdown par propriété `pipeline`
- Documentation dans `docs/POSTHOG_DASHBOARDS.md` (URL, IDs insights, flux de données, instructions de recréation)

### Corrigé — Nettoyage code

- Cast `(session as any).welcomeAudioToken` retiré dans `App.tsx` : le type de retour de `createSession()` inclut déjà `welcomeAudioToken?: string`
- Helper `preGenerateTts()` inutilisé supprimé de `server/routes.ts`

---

## [1.9.0] - 2026-05-02

### Amélioré - Latence TTS : Phase 2 Rolling Dispatch + Pré-génération Bienvenue

- **MIN_SENTENCE_CHARS abaissé 80 → 55** : Phase 1 se déclenche plus tôt sur les phrases courtes, réduisant le délai avant le premier audio de ~200-400ms.
- **Phase 2 rolling early dispatch** : au lieu d'attendre la fin complète du LLM, `dispatchPhase2aTts()` se déclenche dès que 120 caractères ou 3 phrases sont accumulés en cours de streaming (mid-stream). Les phrases résiduelles sont gérées par `dispatchPhase2bTts()` à `thread.run.completed`, avec `previous_text = phase1Text + phase2aText` pour chaîner la continuité prosodique sur la totalité de la réponse.
- **Pré-génération du message de bienvenue** : `POST /api/sessions` lance immédiatement un appel ElevenLabs en arrière-plan pour le message de bienvenue personnalisé. Un `welcomeAudioToken` est retourné dans la réponse, stocké en sessionStorage par l'app cliente. TutorialScreen consomme le token via `/api/tts/play/{token}` au montage — fallback automatique vers la génération à la demande si le token est expiré ou absent.
- Fichiers: `server/routes.ts`, `client/src/lib/api.ts`, `client/src/App.tsx`, `client/src/components/TutorialScreen.tsx`

---

## [1.8.0] - 2026-03-15

### Amélioré - Latence Conversation Peter (Per-Sentence TTS Streaming)
- Implémentation complète du pipeline per-sentence : chaque phrase génère son propre appel TTS avec contexte prosodique (`previous_text`)
- Server `/api/chat/stream` émit des événements `sentence` (text) et `sentence_audio` (token audio) séquentiellement
- Amélioration détection de frontières de phrases : regex `[\s\S]*?[.!?]` capture multiples phrases dans un delta chunk
- Envoi immédiat de l'événement `complete` (sans attendre tous les TTS) pour UX plus réactive
- Client `useAudioQueue` : nouveau système pause/resume pour synchroniser animation avant audio playback
- Résultat : première audio démarre ~2-3s après soumission utilisateur (au lieu de 5-9s)
- Fichiers: `server/routes.ts`, `client/src/lib/api.ts`, `client/src/components/TutorialScreen.tsx`, `client/src/hooks/useAudioQueue.ts`

### Corrigé - Synchronisation Animation Bouteille Célébration
- Animation bouteille apparaît maintenant AVANT que Peter commence à parler (synchronisation exacte du démarrage audio)
- `audioQueue.pause()` appelé au démarrage du stream, `resume()` appelé après `setShowSuccess(true)` dans `onComplete`
- Augmentation du timeout animation de 3000ms → 4500ms pour s'aligner sur la durée interne complète (3.5s apparition + 0.5s secousses + 0.5s explosion)
- Fichiers: `client/src/components/TutorialScreen.tsx`, `client/src/hooks/useAudioQueue.ts`

### Corrigé - Débordement Texte Étiquette Bouteille SVG
- Ajout de `<clipPath>` SVG correspondant aux dimensions exactes de l'étiquette (x=45, y=140, width=110, height=110)
- Application de la clipPath à tous les éléments texte de l'étiquette (BRAVO, message, noms d'indices)
- Réduction des tailles de police (BRAVO: 24→22, message: 13→12, noms: 12→11) pour meilleur ajustement
- Augmentation des indices visibles de 2 à 3 grâce à la meilleure utilisation d'espace
- Noms d'indices longs maintenant toujours lisibles sans débordement
- Fichier: `client/src/components/SuccessFeedback.tsx`

---

## [1.7.0] - 2026-03-07

### Corrigé - Continuité vocale ElevenLabs (Phase 3)
- Correction du changement de registre vocal entre les phrases de Peter : le texte est désormais envoyé **en une seule fois** à ElevenLabs au lieu de phrase par phrase.
- Suppression de l'architecture d'audio queue multi-phrases (`useAudioQueue`) devenue inutile.
- Résultat : voix continue et naturelle avec une prosodie cohérente sur l'ensemble de la réponse.
- Fichiers: `client/src/components/TutorialScreen.tsx`, `client/src/hooks/useAudioQueue.ts`

### Amélioré - Optimisation latence et qualité TTS
- Augmentation de `optimize_streaming_latency` de 2 à 3 pour une réponse plus rapide d'ElevenLabs (le texte complet est envoyé en un seul appel).
- Augmentation de la stabilité vocale de 0.65 à 0.70 pour un registre plus constant sur les textes longs.
- Le texte s'affiche toujours progressivement (streaming SSE) pour l'UX, seul le TTS attend le texte complet.
- Fichiers: `server/routes.ts`

### Ajouté - Pré-génération TTS côté serveur (Phase 3 Latence)
- Le serveur lance la génération TTS **immédiatement** dès que le LLM finit, avant même que le client la demande.
- Nouveau store temporaire côté serveur (`ttsRequestStore`) avec tokens auto-expirables (60s TTL).
- Nouvel endpoint `GET /api/tts/play/:token` pour récupérer l'audio pré-généré.
- L'événement SSE `complete` inclut maintenant un `ttsToken` pour accès direct.
- Nouvelle méthode `playFromUrl()` dans `useVoiceInteraction` : le navigateur joue l'audio via URL native (streaming natif du navigateur).
- Fallback automatique vers le TTS client-side si le token n'est pas disponible.
- Gain estimé : ~2-3s sur le délai entre affichage texte et début de la voix.
- Fichiers: `server/routes.ts`, `client/src/hooks/useVoiceInteraction.ts`, `client/src/components/TutorialScreen.tsx`, `client/src/lib/api.ts`

---

## [1.6.2] - 2026-02-16

### Modifié - Résilience Session et Navigation
- Ajout d'un helper `readStoredSessionFlow()` pour centraliser la lecture de `sessionStorage` et éviter les crashs liés à un `JSON.parse` invalide.
- Nettoyage automatique du payload corrompu dans le storage pour repartir sur un état sain.
- Routes protégées (`tutorial`, `game`, `synthesis`, `feedback`) refactorisées pour réutiliser la lecture sûre du storage au lieu de parses répétés.
- Fichiers: `client/src/lib/sessionFlowStorage.ts`, `client/src/App.tsx`, `client/src/contexts/SessionFlowContext.tsx`

### Corrigé - Stabilité Vidéo Intro
- Correction du cleanup des listeners vidéo `play/pause` (handlers stables) pour éviter l'empilement d'écouteurs.
- Passage de l'écoute `loadedmetadata` native HLS vers `video.onloadedmetadata` pour éviter les listeners orphelins.
- Playlist mémorisée via `useMemo` pour limiter les rechargements involontaires.
- Fichier: `client/src/components/VideoIntro.tsx`

### Amélioré - UX Mobile/Desktop et Latence Perçue
- Meta viewport modernisée (`viewport-fit=cover`) pour meilleure gestion des safe areas mobiles.
- Ajout de `100dvh` pour réduire les sauts de layout sur mobile (barres navigateur dynamiques).
- Protection anti double-soumission au démarrage (`isSubmitting`) + feedback visuel "Démarrage...".
- Avatars de conversation en chargement/décodage asynchrones (`loading="lazy"`, `decoding="async"`).
- Fichiers: `client/index.html`, `client/src/index.css`, `client/src/components/DragDropGame.tsx`, `client/src/components/WelcomeSetup.tsx`, `client/src/components/ConversationPanel.tsx`

### Modifié - Analytics
- `posthog.debug(true)` activé uniquement en local (`localhost`, `127.0.0.1`) pour réduire le bruit et l'overhead en environnement distant.
- Initialisation analytics et listeners globaux déplacés dans des `useEffect` avec cleanup pour éviter les duplications en HMR/navigation.
- Fichiers: `client/index.html`, `client/src/App.tsx`

---

## [1.6.1] - 2026-02-04

### Modifié - Démarrage et Sessions
- Suppression de l'écran « Prêt à commencer » : l'audio se déverrouille automatiquement et le message de bienvenue joue dès l'arrivée sur le tutoriel (commit 6793585).
- `resetSession` étendu avec purge complète de l'état + `posthog.reset()` et flag `?fresh=1` pour forcer une session neuve côté QA (commit 4c15386).
- Bouton « Nouvelle session » ajouté (desktop + mobile) pour repartir proprement (commit 4c15386).

### Amélioré - Stabilité de la Conversation
- Messages désormais keyés par ID unique pour éviter les sauts de scroll et collisions (commit 4c15386).
- Auto-scroll intelligent : ne recolle au bas que si l'utilisateur est proche du pied de conversation, bulles avec `min-height` pour limiter les jumps (commit 4c15386).
- Zone image réduite (~26vh) pour offrir plus d'espace de chat sur mobile (commit 4c15386).

### Ajouté - Écran de Fin
- Bouton « Partager l'expérience » (Web Share API + fallback copie lien) et bouton « Recommencer l'expérience » avec refresh complet pour état propre (commit 0461556).

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
