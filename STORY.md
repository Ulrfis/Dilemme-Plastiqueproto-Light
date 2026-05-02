# Dilemme Plastique — Development Story

> **Status**: 🟡 In Progress  
> **Creator**: Ulrich Fischer  
> **Started**: 2024-11-12  
> **Last Updated**: 2026-05-02 (message de reprise contextuel pour utilisateur qui revient)  

---

## Genesis Block

*Fill this section BEFORE starting development. This is your "before" snapshot.*

### The Friction

*What personal pain, frustration, or observation sparked this project? Be specific and honest.*

```
Educational institutions need engaging tools for teaching environmental awareness. Traditional classroom teaching can feel static and impersonal, especially for younger students. There's a need for voice-based, interactive learning experiences that feel like genuine conversations rather than drills.
```

### The Conviction

*Why does this matter? Why you? Why now?*

```
Education is undergoing a transformation powered by AI. Voice-based interaction mirrors natural human communication. By combining image analysis, conversational AI, and game-like engagement, we can make environmental education feel like exploration rather than instruction.
```

### Initial Vision

*What did you imagine building? Paste your original PRD, brief, or first prompt here.*

```
Build "Dilemme Plastique - Prototype simplifié," a mobile-first educational application where students analyze an image of Place des Nations (Geneva) to discover 6 hidden clues through voice-guided conversations with Peter (AI assistant). Features: maximum 8 conversation exchanges, zoomable image navigation, drag-and-drop fill-in-the-blank game, OpenAI Whisper for speech-to-text, GPT-4 conversational guidance, ElevenLabs text-to-speech, video introduction, PostgreSQL database with unified session structure, Google Sheets analytics integration, community synthesis page with upvoting, voice dictation for synthesis input, and PostHog analytics tracking.
```

### Target Human

*Who is this for? One specific person archetype.*

```
Marie, a 14-year-old student in a Geneva classroom. She's skeptical about traditional environmental lessons, prefers mobile devices to textbooks, learns best through exploration and conversation, and loves when technology feels like a game. Her success: discovering hidden clues, feeling heard by the AI, and synthesizing her learnings into words.
```

### Tools Arsenal

*What vibe-coding tools are you using?*

| Tool | Role |
|------|------|
| Replit Agent | Full-stack development, backend/frontend integration |
| React + TypeScript | Frontend UI & interactions |
| Express.js | Backend API & session management |
| PostgreSQL | Persistent data storage |
| OpenAI API | Speech-to-Text (Whisper) & Conversational AI (GPT Assistant) |
| ElevenLabs API | Text-to-Speech voice synthesis |
| PostHog | Analytics & session recording |
| Google Sheets | Real-time analytics sync |

---

## Feature Chronicle

*Each feature gets an entry. Major features (🔷) get full treatment. Minor features (🔹) get brief notes.*

### [2026-05-02] — Peter reprend la conversation au retour sur /tutorial 🔷

**Intent**: Quand un utilisateur revient sur l'écran tutoriel après une navigation, Peter était muet. Il fallait qu'il accueille à nouveau, mais de façon contextuelle — pas la phrase de bienvenue générique, plutôt un mot qui repart de là où on en était.

**Prompt(s)**:
```
Dans le contexte d'une session déjà ouverte, avec des indices trouvés, et que
la personne revient dans la conversation, il faut faire dire à Peter une autre
phrase que la phrase initiale. Il faut faire une phrase qui idéalement repart
de la conversation existante — si elle existe en mémoire — et si elle n'existe
pas, alors il faut simplement que Peter regarde les indices trouvés et guide
vers le ou les dernier(s) indice(s) qui doivent encore être trouvés.
```

**Tool**: Replit Agent

**Outcome**:
- Nouveau endpoint serveur `POST /api/sessions/:id/resume` : auth → calcul indices manquants → réutilisation thread OpenAI existant → injection prompt de reprise → run assistant → pré-génération TTS → `{ text, audioToken }`
- Prompt de reprise injecté dans le thread : "[REPRISE DE SESSION — NE PAS COMPTER COMME ÉCHANGE] … accueille en 1-2 phrases MAX, fais référence à la conversation si elle a eu lieu, oriente vers les indices manquants, pas la phrase de bienvenue initiale"
- Client : `handleUnlockAudio` branche `isReturningUser` → `setIsThinking(true)` → appel resume → guard `text?.trim()` → append message → fetch audio → `playAudio`
- Zéro impact compteurs : `exchangeCount` client et `messageCount` DB non touchés
- Fallback texte statique si assistant retourne vide
- Erreurs silencieuses partout (warn + log, jamais bloquant)
- Fix code review : accumulation delta robuste (itération tous les blocs `content`, pas seulement `[0]`)

**Architecture**:
```
Avant : isReturningUser → silence (hasPlayedWelcome.current = true, rien d'autre)
Après : isReturningUser → isThinking → POST /resume → thread OpenAI → TTS → playAudio
```

**Surprise**: Le thread OpenAI conserve tout l'historique de la session — Peter peut donc faire une vraie référence contextuelle ("Tu avais bien observé la statue…") sans que le client ait besoin de renvoyer les messages. La mémoire est déjà là, côté serveur.

**Friction**: Erreur de syntaxe JS après ajout du guard `text?.trim()` — l'accolade fermante du `if` n'était pas alignée avec le `try` englobant. Fix en relisant la structure complète.

**Insight**: Un endpoint "hors-échange" qui utilise le même thread mais n'incrémente aucun compteur est une primitive utile : il permet des interactions Peter sans "consumer" les 8 échanges disponibles.

**Time**: ~20 minutes (plan + implémentation + fix syntaxe + code review)

---

### [2026-05-02] — Redesign UI Tutoriel : Mobile Collapsible, Tablette, Desktop 🔷

**Intent**: Refaire entièrement les layouts mobile, tablette et desktop de l'interface tutoriel pour éliminer l'espace gaspillé, corriger l'absence de breakpoint tablette, et donner à la colonne de conversation plus de place tout en gardant l'image dominante.

**Prompt(s)**:
```
Full UI redesign of the conversational tutorial interface. Mobile: collapsible
image, clue overlay on image (remove separate strip), virtualViewport keyboard
detection. Tablet: new 768-1023px layout, conversation on left 1/3, image
on right 2/3. Desktop: wider image, 3-zone info bar. ConversationPanel: hex
avatar, HUD exchange counter, colored status zone, gaming mic button, wave bars.
ZoomableImage hint: subtle pill bottom-right.
```

**Tool**: Replit Agent

**Outcome**:
- **Mobile** : image collapsible 22vh avec overlay gradient + badges indices ; toggle Masquer/Voir avec ChevronUp/Down ; détection clavier virtuel via `visualViewport` (collapse automatique quand keyboard > 120px, restauration si l'utilisateur n'avait pas collapsé manuellement) ; header compact badge + barre de progression + icône Info.
- **Tablette (nouveau)** : layout côte-à-côte `hidden md:flex lg:hidden` — conversation gauche 34%, image droite 66% avec overlay indices.
- **Desktop** : colonne conversation rétrécie 34% → 30% (xl: 32% → 28%) pour que l'image occupe ~70% ; barre d'info 3 zones (progression | indices | actions).
- **ConversationPanel** : avatar hexagonal clip-path, bulles rounded-xl, HUD compteur bas-droite, statut coloré par état (rouge/primary/orange/muted), bouton micro gaming rounded-full 56-64px, animation barres-ondes "Peter parle".
- **ZoomableImage** : hint centré géant → pastille discrète 11px bas-droite.
- Fichiers : `TutorialScreen.tsx`, `ConversationPanel.tsx`, `ZoomableImage.tsx`, `tailwind.config.ts`

**Architecture**:
```
Avant (breakpoints) : mobile = lg:hidden (< 1024px), desktop = lg:flex
Après : mobile = md:hidden (< 768px) | tablette = md:flex lg:hidden (768-1023px) | desktop = lg:flex
```

**Surprise**: La détection `visualViewport` pour le clavier virtuel mobile est beaucoup plus fiable que les approches `window.resize` — elle donne directement la hauteur visuelle disponible, indépendante des safe areas.

**Friction**: Les ajustements de largeur desktop ont nécessité deux passes (d'abord 34%, puis retour à 30%) suite au retour utilisateur sur la proportion image/conversation.

**Time**: ~2 sessions

---

### [2026-05-02] — Voix Peter Uniforme : Même Modèle TTS pour Toutes les Phrases 🔹

**Intent**: Éliminer la différence audible entre la première phrase de Peter (trop forte, saturée sur "!") et les suivantes — causée par l'utilisation de deux modèles ElevenLabs différents selon la phase.

**Prompt(s)**:
```
il faut corriger un problème audio: lorsque Peter fait une première phrase qui
termine par un !, il exagère et c'est trop fort et saturé. Il faut garder le
même style sur toutes les réponses, y compris les réponses avec un point
d'exclamation !
```

**Tool**: Replit Agent

**Outcome**:
- Diagnostic : Phase 1 utilisait `eleven_flash_v2_5` (latency opt 3) ; Phase 2 utilisait `eleven_multilingual_v2` (latency opt 2). Même `voice_settings` (stability 0.75, style 0.0, speaker_boost false) mais profils acoustiques différents — le flash amplifie les pics sur les exclamatives.
- Fix : `dispatchPhase1Tts()` passe `'quality'` à `generateTtsAudio()` → même modèle `eleven_multilingual_v2` sur toutes les phrases. Cohérence vocale totale.
- Trade-off accepté : légère hausse latence première phrase (~200-400ms) contre voix uniforme.
- Fichier : `server/routes.ts`

**Architecture**:
```
Avant : Phase 1 → eleven_flash_v2_5 | Phase 2 → eleven_multilingual_v2
Après : Phase 1 → eleven_multilingual_v2 | Phase 2 → eleven_multilingual_v2
```

**Surprise**: Le problème n'était pas dans `voice_settings` (déjà optimisés) mais dans le modèle lui-même — deux modèles avec les mêmes paramètres sonnent différemment.

**Insight**: Homogénéité > vitesse quand l'utilisateur perçoit l'incohérence comme un bug.

**Time**: ~5 minutes (diagnostic + one-line fix)

---

### [2026-03-15] — Per-Sentence TTS Streaming & Latency Reduction 🔷

**Intent**: Reduce time-to-first-audio from 5-9s to ~2-3s by implementing server-side per-sentence TTS generation with context-aware prosody, allowing audio to start playing while the LLM is still generating text.

**Prompt(s)**:
```
Implement per-sentence TTS pipeline where each sentence gets its own ElevenLabs call with previous_text context for prosody continuity. Server streams sentence events to client, client fetches per-sentence audio tokens, and audio plays in sequence from index 1.
```

**Tool**: Replit Agent

**Outcome**:
- Complete per-sentence TTS architecture implemented: LLM streams sentences → server generates per-sentence TTS → client enqueues and plays in order
- Improved sentence boundary detection: regex `/[\s\S]*?[.!?]/` now captures multiple sentences within a single text delta chunk
- Server `/api/chat/stream` emits `sentence` (text) and `sentence_audio` (token) SSE events sequentially
- `useAudioQueue` enhanced with pause/resume mechanism: allows audio buffering during response generation, playback starts only when explicitly resumed
- Client-side stale fetch guard: stream generation ID prevents old audio callbacks from enqueueing after interruption/restart
- Typo fix: Map iteration changed from for-of to forEach (TS compatibility)
- Result: First audio now plays ~2-3s after user message (was 5-9s), full response audio still maintains natural prosody via `previous_text` context
- Fichiers: `server/routes.ts`, `client/src/lib/api.ts`, `client/src/components/TutorialScreen.tsx`, `client/src/hooks/useAudioQueue.ts`

**Architecture**:
```
Before (full-text TTS):
User message → LLM streams text → LLM completes → Server TTS entire response (5-9s) → Audio plays

After (per-sentence TTS):
User message → LLM streams S1 → Server TTS S1 parallel → Client audio plays S1 (~2-3s)
                LLM streams S2 → Server TTS S2 parallel → Client waits for S1 to finish, then S2 plays
                ...
```

**Surprise**: The pause/resume mechanism elegantly solved synchronization: buffers audio while detecting new clues, prevents premature playback

**Friction**: Sentence boundary detection with streaming required careful regex to handle multiple sentences in single chunk and avoid double-processing

**Time**: ~45 minutes (streaming architecture, pause/resume, stale fetch guard, regex optimization)

---

### [2026-03-15] — Bottle Animation Synchronization & SVG Text Clipping 🔷

**Intent**: Fix two celebration animation issues: (1) bottle appears AFTER Peter starts speaking instead of at the exact same moment, (2) long clue names overflow the SVG label area with no clipping.

**Prompt(s)**:
```
Task 1: Synchoniser le déclenchement de l'animation bouteille AVANT le début du playback audio.
Task 2: Ajouter un clipPath SVG pour l'étiquette de la bouteille et s'assurer que les noms longs ne dépassent pas les bords.
```

**Tool**: Replit Agent

**Outcome**:
- Audio playback synchronization fixed: Added `audioQueue.pause()` at start of message stream, `resume()` called in `onComplete` AFTER `setShowSuccess(true)` — ensures bottle animation triggers before any audio plays
- Animation timeout increased: 3000ms → 4500ms to match full internal animation duration (3.5s appear + 0.5s shake + 0.5s explode)
- SVG label text clipping: Added `<clipPath id="labelClip">` with exact label rect dimensions (x=45, y=140, w=110, h=110), applied to all label text via `<g clipPath="url(#labelClip)">`
- Font size optimization: BRAVO (24→22), message (13→12), clue names (12→11) for better fit within clipped area
- Clue count increased: 2 visible clues → 3 visible with adjusted spacing (16px → 14px between rows)
- Result: Bottle appears exactly when Peter's audio starts, no text overflow regardless of clue name length
- Fichiers: `client/src/components/TutorialScreen.tsx`, `client/src/hooks/useAudioQueue.ts`, `client/src/components/SuccessFeedback.tsx`

**Architecture**:
```
Before (late animation):
onSentenceAudio → enqueue audio → processQueue starts → audio plays (t=0)
...later...
onComplete → setShowSuccess(true) → animation appears (t=~500ms)
Result: Bottle appears after user hears Peter's voice

After (synchronized):
processMessageStreaming → audioQueue.pause() → block all playback
...audio accumulates in queue while paused...
onComplete → setShowSuccess(true) → animate bottle → audioQueue.resume() → audio plays
Result: Bottle appears exactly when first audio byte plays
```

**Surprise**: Pause/resume mechanism was simpler and more robust than trying to predict exact resume moment from audio timing

**Friction**: Initial approach (detect animation end) was event-dependent and fragile; pause/resume is state-based and deterministic

**Time**: ~30 minutes (pause/resume implementation, SVG clipPath setup, layout adjustments, testing)

---

### [2024-12-12] — PostHog Analytics Integration 🔷

**Intent**: Add comprehensive analytics tracking to monitor user engagement, tutorial completion rates, game performance, and synthesis submission patterns across the application.

**Prompt(s)**: 
```
Add PostHog analytics integration with web snippet for autocapture, session recording, and 8 custom events: app_loaded, page_view, title_screen_started, user_session_started, tutorial_completed, game_completed, synthesis_submitted, feedback_submitted
```

**Tool**: Replit Agent

**Outcome**: 
- PostHog web snippet added to client/index.html with API key and endpoint
- All 8 custom events implemented across components (App.tsx, TitleScreen, TutorialScreen, DragDropGame, SynthesisScreen, FeedbackSurvey)
- Confirmed working via browser console logs: "PostHog API Key available: true", "Initialized successfully"

**Surprise**: PostHog automatically loads and initializes before React even mounts—very lightweight implementation

**Friction**: Initially tried programmatic initialization in App.tsx (added extra file), but user requested simpler web snippet approach (less code, better for lightweight analytics)

**Resolution**: Removed programmatic init, kept only web snippet in index.html for cleaner codebase. Custom events still triggered via `posthog.capture()` in components.

**Time**: ~15 minutes

---

### [2024-12-12] — 6-Clue System Implementation 🔷

**Intent**: Implement the core game mechanic: detecting 6 hidden clues (Déchets plastiques, ADN, Traité plastique, Algues, Homme, Femme) during conversation exchanges to guide students toward environmental discoveries.

**Prompt(s)**:
```
Implement clue detection system that identifies target clues and variants from user input during conversation, tracks session clues, and stops conversation after 8 exchanges or when all 6 clues found.
```

**Tool**: Replit Agent

**Outcome**: 
- Clue detection logic implemented in `TutorialScreen.tsx` with variant matching (e.g., "génétique" matches "ADN")
- Session state tracks found clues with progress updates
- Conversation ends at 8 exchanges OR all 6 clues found
- Real-time UI feedback shows discovered clues

**Surprise**: Variant matching was more flexible than expected—allows students to express clues in their own language

**Friction**: Initial implementation was strict matching; had to add fuzzy/variant matching for pedagogical flexibility

**Resolution**: Added variant map in clue detection logic

**Time**: ~20 minutes

---

### [2024-12-12] — Drag-Drop Game with Accessibility Fallback 🔷

**Intent**: Create engaging drag-and-drop fill-in-the-blank game using @dnd-kit that's fully accessible via click-to-select mode for users with accessibility needs or on mobile devices.

**Prompt(s)**:
```
Build DragDropGame component with @dnd-kit for drag-and-drop plus click-to-place fallback. Correct answers: blank1="L'homme", blank2="La femme", blank3="les déchets plastiques", blank4="ADN". Both modes must work seamlessly.
```

**Tool**: Replit Agent

**Outcome**: 
- DragDropGame component supports both drag-drop and click-to-select modes
- Correct answers validated, visual feedback for success
- Responsive design works on mobile
- Accessibility-first approach with ARIA labels

**Surprise**: Click mode actually feels better on touchscreen than drag on some devices—dual mode is a genuine win

**Friction**: @dnd-kit drag events initially conflicted with click handlers on mobile

**Resolution**: Separated drag/click logic with explicit mode detection

**Time**: ~25 minutes

---

### [2024-12-12] — Text Encoding Fix (French Characters) 🔹

**Intent**: Fix all Unicode escape sequences across UI to display proper French characters (é, è, à, œ) instead of `\u00e9` sequences.

**Outcome**: All text encoding corrected. App now displays "Déchets plastiques" instead of "D\u00e9chets plastiques"

**Friction**: Spread across multiple components

**Resolution**: Global find-replace across all component files

**Time**: ~10 minutes

---

### [2024-12-12] — Full Application Flow 🔷

**Intent**: Connect all screens in sequence: Title → Video → Welcome → Tutorial → Drag-Drop Game → Synthesis → Feedback, with proper state management and navigation.

**Prompt(s)**:
```
Implement complete user flow with screen-based navigation, session management, conversation tracking, and proper state handoff between screens.
```

**Tool**: Replit Agent

**Outcome**:
- App.tsx manages flow with conditional rendering
- Session state persists across screens
- Conversation and game data flows properly
- User can proceed to synthesis after game completion

**Friction**: Complex state management across multiple components

**Resolution**: Used React hooks with proper context passing

**Time**: ~30 minutes

---

### [2026-01-02] — Enhanced PostHog Analytics & User Identification 🔷

**Intent**: Implement deep analytics tracking and user identification to better understand how students interact with the prototype and where they might get stuck.

**Outcome**:
- Integrated `posthog.identify()` on user name entry to link all session actions to a specific identity.
- Added comprehensive lifecycle tracking: session starts/ends, app backgrounding, and explicit completion/abandonment points.
- Enriched all "feature used" events with user names and relevant metadata.
- Implemented automatic "abandonment" detection when users reach protected pages without a valid session.

**Architecture**:
```
WelcomeSetup → onStart(name) → identifyUser(name) → posthog.identify(name, { properties })
                             → captureFeatureUsed('welcome_name_entered', { userName: name })
```

**Surprise**: Identifying users by name makes the PostHog dashboard much more readable and actionable for teachers/researchers.

**Time**: ~15 minutes

---

## Pivots & Breakages

*Major direction changes, things that broke badly, abandoned approaches. This is where story gold lives.*

### [2024-12-12] — PostHog Integration Approach

**What broke / What changed**: Initially implemented PostHog programmatically in App.tsx. User requested simpler web snippet approach instead.

**Why**: Web snippet is lighter, simpler, and PostHog recommends it for less technical overhead.

**What you learned**: Sometimes the simplest approach (web snippet) is better than the "proper" programmatic setup. Keep code minimal.

**Emotional state**: Slightly embarrassed to pivot, but relieved the simpler approach was actually better.

---

### [2024-12-12] — Welcome Message Update 🔹

**Intent**: Update Peter's initial greeting to include the constraint about maximum 8 exchanges within the welcome message itself for better user clarity.

**Outcome**: Added "Tu as maximum 8 échanges pour y parvenir !" to the welcome message

**Time**: ~2 minutes

---

### [2024-12-19] — Questionnaire Restructuring 🔷

**Intent**: Major overhaul of feedback questionnaire based on user requirements for streamlined UX and better data collection.

**Prompt(s)**: 
```
Remove Scénario page, start with Gameplay. Update text: "Il est simple de jouer.", "Peter répond intelligemment...". Add voice chat question to Gameplay. Remove Interface page. Change "tutoriel" to "prototype". Add voice dictation for improvements. Update share link. Make email field more visible with color. Disable Terminer if email required but not filled. Move navigation buttons below questions, not at screen bottom.
```

**Tool**: Replit Agent

**Outcome**:
- Removed "Scénario" page (3 questions)
- Removed "Interface" page (3 questions)
- Survey now: Gameplay → Feeling → Motivation → Bilan et perspectives
- Added "La discussion vocale est agréable." to Gameplay
- Changed "Il est simple de comprendre le principe." → "Il est simple de jouer."
- Changed "Peter_bot répond..." → "Peter répond..."
- Changed "tutoriel" → "prototype" in rating question
- Added voice dictation (microphone button) for "Quelles améliorations verrais-tu ?"
- Updated share link to https://proto-dilemme2.edugami.app/
- Email field now highlighted with primary color when visible
- "Terminer" button disabled if user said yes to email updates but hasn't entered email
- Navigation buttons now positioned directly below questions (not fixed at screen bottom)

**Surprise**: Voice dictation in the feedback form creates a nice symmetry with the voice-based tutorial interaction—feels cohesive

**Friction**: None significant—clean refactor

**Time**: ~20 minutes

---

### [2024-12-19] — Real-Time Feedback Sync to Google Sheets 🔷

**Intent**: Capture partial questionnaire responses immediately in Google Sheets, even if users don't complete the full survey. Critical for capturing feedback from users who drop off mid-questionnaire.

**Prompt(s)**: 
```
Send all questionnaire responses to Google Sheets immediately as they're answered, without waiting for final "Terminer" button click - need to capture partial responses.
```

**Tool**: Replit Agent

**Outcome**:
- New API endpoint: `PATCH /api/sessions/:id/feedback` for partial updates
- New storage method: `updatePartialFeedback()` that only updates provided fields
- FeedbackSurvey component now sends each response immediately when selected
- Text fields (improvements, email) use 1-second debounce to avoid excessive API calls
- Rating selections and yes/no buttons trigger immediate sync
- Added `gameplayVoiceChat` field to database schema and Google Sheets headers
- Google Sheets columns updated: now 34 columns (A:AH)

**Architecture**: 
```
User clicks rating → updateField() → sendPartialUpdate() → PATCH /api/sessions/:id/feedback
                                                          → storage.updatePartialFeedback()
                                                          → googleSheetsSync.upsertSessionRow()
```

**Surprise**: The unified session row approach (feedback stored in tutorialSessions table) makes partial updates seamless—no need for a separate feedback table sync

**Friction**: None—existing architecture supported this cleanly

**Time**: ~15 minutes

---

### [2026-01-02] — Video Playlist with Device-Adaptive Formats 🔷

**Intent**: Replace single video with a 2-video playlist that adapts to device type (desktop 16:9 vs mobile 9:16) for optimal viewing experience.

**Prompt(s)**: 
```
Replace current video with 3-video playlist (intro + device-specific second video). Video 1 is 16:9 intro for all users. Video 2A is 16:9 for desktop, Video 2B is 9:16 for mobile. Seamless transitions between videos, keep existing player mechanics.
```

**Tool**: Replit Agent

**Outcome**:
- Replaced Gumlet iframe with native HTML5 video player + HLS.js for cross-browser HLS support
- Device detection: checks user agent, touch capability, and screen width
- Video playlist: [intro 16:9] → [desktop 16:9 OR mobile 9:16]
- Seamless transition: HLS.js loads next video on 'ended' event without gap
- Video progress indicator (1/2, 2/2) in top-right corner
- Preserved all existing mechanics: click-to-play, fullscreen, mute toggle, skip button
- 16:9 intro centered on vertical mobile screens (objectFit: contain)
- Mobile 9:16 video fills screen height on mobile

**Video URLs**:
- Intro (16:9): `69577dbaf3928b38fc32c32b/main.m3u8`
- Desktop (16:9): `69577d67d73a53e69e607fbf/main.m3u8`
- Mobile (9:16): `69577d67f3928b38fc32bb95/main.m3u8`

**Architecture**:
```
isMobileDevice() → playlist = [intro, desktop/mobile]
loadVideo(url) → HLS.js or native HLS → video.play()
video.onended → currentVideoIndex++ → loadVideo(next) → seamless playback
```

**Surprise**: HLS.js transition is nearly seamless—only ~50ms pause between videos

**Friction**: None significant

**Time**: ~15 minutes

---

### [2026-01-02] — TTS Reliability Fix: Ensure All Sentences Are Spoken 🔷

**Intent**: Fix bug where Peter sometimes doesn't read all displayed text. Some sentences were being silently skipped due to TTS failures.

**Prompt(s)**: 
```
Il arrive que Peter ne dise pas toutes les phrases qui sont affichées en texte. Il faut assurer qu'Elevenlabs stream TOUTES les phrases écrites.
```

**Tool**: Replit Agent

**Outcome**:
- Root cause identified: When TTS generation failed for a sentence, the audio queue would wait forever for that sentence index
- Added retry logic with exponential backoff (3 attempts with 500ms, 1000ms, 1500ms delays)
- Added blob validation: reject audio blobs < 100 bytes
- Added `skipIndex()` function to audio queue to handle permanently failed sentences
- When all retries fail, skipIndex advances the expected index so subsequent sentences can play

**Architecture**:
```
TTS attempt 1 fails → wait 500ms → attempt 2 fails → wait 1000ms → attempt 3 fails
→ audioQueue.skipIndex(index) → nextExpectedIndex++ → queue continues processing
```

**Root Cause Analysis**:
```
Before: sentence #2 TTS fails → queue waits for #2 forever → #3, #4, #5 never play
After:  sentence #2 TTS fails (3x) → skipIndex(2) → queue plays #3, #4, #5
```

**Surprise**: The audio queue's strict ordering (to ensure correct playback sequence) became a liability when combined with network failures

**Friction**: None - clean fix with backward-compatible API

**Time**: ~10 minutes

---

### [2026-01-02] — Video Playlist Bug Fix: Second Video Plays to Completion 🔷

**Intent**: Fix bug where the second video stops after a few seconds and auto-advances to the next screen. Only the "Continuer" button should allow skipping.

**Prompt(s)**: 
```
Il y a un bug lors de la lecture de la deuxième vidéo: après quelques secondes, la vidéo s'arrête et on passe à l'écran d'après !
```

**Tool**: Replit Agent

**Outcome**:
- Root cause identified: A 120-second auto-skip timer was set on component mount and never reset when the second video started
- Timer fired mid-playback of second video, causing premature skip
- Solution: Removed the auto-skip timer entirely per user requirement
- Now only the "Continuer" button can skip videos

**Root Cause Analysis**:
```
Before:
mount → setTimeout(120s, onComplete) → video 1 plays (60s) → video 2 starts (0s) 
→ 60s more passes → timer fires at 120s → onComplete() mid-video-2!

After:
mount → video 1 plays → video 1 ends → video 2 plays → video 2 ends → onComplete()
Skip only via "Continuer" button at any time
```

**Surprise**: The safety timer was intended to prevent infinite hang but became the bug itself

**Friction**: None - simple deletion

**Time**: ~5 minutes

---

### [2026-01-02] — Multi-Route Navigation with Session Persistence 🔷

**Intent**: Implement proper multi-route navigation using wouter so users can use browser back/forward buttons while preserving their session state (conversation, clues, game progress).

**Prompt(s)**: 
```
Develop a multi-route navigation system with persistent session state for the "Dilemme Plastique" interactive experience. The application uses React and wouter for routing, with conversation exchanges, game state, and user progress preserved across browser navigation (back/forward buttons). Critical requirement: preserve existing STT/TTS mechanics without modification.
```

**Tool**: Replit Agent

**Outcome**:
- Created `SessionFlowContext` to centralize all shared state (messages, foundClues, exchangeCount, audioUnlocked, dragDropPlacements, synthesis)
- Implemented sessionStorage persistence with automatic save/restore
- Refactored App.tsx from single-page useState navigation to wouter multi-route system
- Routes: `/`, `/video`, `/welcome`, `/tutorial`, `/game`, `/synthesis`, `/feedback`, `/complete`
- Protected routes redirect to `/` if no valid session exists
- Hybrid session validation (React state + sessionStorage) to handle navigation race conditions

**Architecture**:
```
Before: App.tsx (useState navigation)
└── currentScreen: 'title' | 'video' | 'welcome' | ... (memory only)

After: App.tsx (wouter routes)
├── SessionFlowProvider (context + sessionStorage)
│   ├── Route "/" → TitlePage
│   ├── Route "/video" → VideoPage  
│   ├── Route "/welcome" → WelcomePage
│   ├── Route "/tutorial" → TutorialPage (protected)
│   ├── Route "/game" → GamePage (protected)
│   ├── Route "/synthesis" → SynthesisPage (protected)
│   ├── Route "/feedback" → FeedbackPage (protected)
│   └── Route "/complete" → CompletePage
```

**Critical Fix**: Session ID and userName are saved synchronously to sessionStorage (not debounced) to prevent race conditions when navigating immediately after session creation.

**Surprise**: The hybrid validation approach (checking both React state AND sessionStorage directly) elegantly solved the React state propagation delay issue

**Friction**: Initial implementation had a race condition where TutorialPage would redirect to `/` because React state hadn't propagated yet after `setSessionId` was called

**Resolution**: Protected routes now check sessionStorage directly in addition to React state, ensuring session validity even during state propagation delays

**Time**: ~45 minutes

---

### [2026-02-04] — Instant Start & Session Hygiene 🔷

**Intent**: Supprimer la friction d'entrée et garantir des sessions neuves et traçables.

**Outcome**:
- Écran « Prêt à commencer » retiré : audio auto-déverrouillé et message de bienvenue joué dès l'arrivée sur le tutoriel.
- Reset robuste : bouton « Nouvelle session » (desktop + mobile) qui purge tout l'état, appelle `posthog.reset()` et force un refresh propre.
- Paramètre `?fresh=1` pour QA afin d'ignorer tout état sessionStorage au premier rendu.
- Messages de conversation keyés par ID stable + auto-scroll “sticky bottom” qui évite les sauts si l'utilisateur scrolle l'historique.
- Mise en page mobile allégée : image réduite (~26vh) pour plus d'espace de chat.
- Écran final enrichi : partage natif (fallback copie lien) et “Recommencer” avec refresh complet.

**Surprise**: Ajouter des IDs stables a éliminé la majorité des sauts de scroll sans toucher aux animations.

**Friction**: Nécessité de re-keyer l'état stocké en sessionStorage pour éviter les collisions d'IDs existants.

**Time**: ~35 minutes

---

### [2026-02-16] — Cross-Device Reliability Pass (Desktop + Smartphone) 🔷

**Intent**: Renforcer la stabilité runtime et l'expérience perçue sur desktop/mobile sans toucher à la mécanique existante (conversation, scoring, routes, règles d'échanges).

**Prompt(s)**:
```
Il faut analyser en détail ce projet et vérifier qu'il fonctionnera bien autant sur desktop que sur smartphone; voir aussi pour améliorer latence et expérience utilisateur - sans rien casser à la mécanique et usage actuel !
```

**Tool**: Codex (GPT-5 coding agent)

**Outcome**:
- Ajout d'un accès sessionStorage sécurisé (`readStoredSessionFlow`) avec purge automatique des payloads invalides.
- Refactor des routes protégées pour supprimer les `JSON.parse` répétés et réduire les points de crash.
- Stabilisation du cycle de vie analytics: timers/listeners globaux déplacés dans des `useEffect` avec cleanup.
- Correction des listeners vidéo (`play/pause`) dans `VideoIntro` et nettoyage de `loadedmetadata` natif.
- Protection anti double-soumission sur l'écran prénom (`isSubmitting` + feedback "Démarrage...").
- Ajustements mobile de layout/viewport (`viewport-fit=cover`, `100dvh`) pour réduire les sauts visuels.
- Micro-optimisation conversation (`loading="lazy"`, `decoding="async"` sur avatars).
- `posthog.debug(true)` limité au local (`localhost`, `127.0.0.1`).

**Architecture Delta**:
```
Avant:
Routes -> sessionStorage.getItem(...) + JSON.parse(...) dans plusieurs pages

Après:
Routes -> readStoredSessionFlow() unique + fallback robuste + nettoyage payload corrompu
```

**Surprise**: Les principaux risques n'étaient pas des bugs métier, mais des détails de cycle de vie (listeners/timers/storage parsing) qui se révèlent surtout en usage mobile réel.

**Friction**: Validation outillée partielle dans l'environnement de travail (`tsc`/`vite` indisponibles), donc audit principalement statique + correctifs à faible risque.

**Time**: ~45 minutes

---

### [2026-03-07] — Voice Register Continuity Fix (Phase 3 TTS) 🔷

**Intent**: Corriger les changements de registre vocal entre les phrases de Peter. ElevenLabs changeait de tonalité/prosodie entre chaque phrase car le texte était envoyé phrase par phrase via des appels API séparés. Optimiser la réactivité du pipeline global.

**Prompt(s)**:
```
Il faut bien analyser la base de code, pour voir pourquoi lors de la lecture de la réponse de Peter, la mécanique Elevenlab change de registre entre deux phrases. C'est comme s'il y avait des coupures entre chaque phrases, avec un nouveau registre de jeu. C'est super important de garder une continuité pour avoir la même dynamique au sein d'une réponses, composée de plusieurs phrases. Il faut donc envoyer tout le texte en entier à Elevenlab, pour générer la réponse en une fois, et pas en plusieurs fois.
```

**Tool**: Claude Code (claude-opus-4-6)

**Outcome**:
- Diagnostic confirmé : l'architecture Phase 2 découpait la réponse en phrases via regex `/[.!?]\s+$/` et envoyait chaque phrase séparément à ElevenLabs. Chaque appel TTS indépendant produisait une prosodie différente.
- Refactoring du pipeline : `onSentence` ne déclenche plus le TTS, il met à jour uniquement l'UI. `onComplete` envoie le texte COMPLET en un seul appel TTS.
- Suppression de la dépendance `useAudioQueue` (multi-phrases) dans `TutorialScreen` — l'audio est joué en un seul bloc.
- Augmentation de la stabilité vocale (0.65 → 0.70) et de `optimize_streaming_latency` (2 → 3) côté serveur.
- Build vérifié OK.

**Architecture Delta**:
```
Avant (Phase 2):
LLM stream → Phrase 1 → TTS API → Audio 1 ▶️
           → Phrase 2 → TTS API → Audio 2 ▶️ (registre différent!)
           → Phrase 3 → TTS API → Audio 3 ▶️ (registre différent!)

Après (Phase 3):
LLM stream → Phrase 1 → UI ✏️
           → Phrase 2 → UI ✏️
           → Phrase 3 → UI ✏️
           → Texte complet → TTS API (1 seul appel) → Audio complet ▶️ (registre uniforme)
```

**Surprise**: Le streaming UI (texte progressif) est conservé, donc l'utilisateur voit la réponse s'écrire progressivement pendant que l'audio se génère — la latence perçue est atténuée.

**Friction**: Compromis latence vs continuité — l'audio commence ~1-2s plus tard qu'avant, mais sans aucune coupure ni changement de registre.

**Time**: ~30 minutes

---

### [2026-05-02] — Suivi continu des indices + fin de conversation à 6/6 🔷

**Intent**: Peter "oubliait" les indices déjà trouvés lors des échanges suivants, car le contexte n'était injecté qu'au premier message du thread. Il fallait aussi terminer automatiquement la conversation dès que tous les 6 indices étaient trouvés, sans attendre le 8e échange.

**Prompt(s)**:
```
Il faut que Peter prenne en compte à tous les tours de conversations les indices trouvés.
il faut garder en mémoire les indices, et ne pas redemander les indices trouvés, et
seulement se concentrer sur les indices manquants.
Une fois que tous les 6 indices ont été trouvés, il faut proposer à l'utilisateur de
cliquer sur le bouton "Poursuivre" pour continuer l'expérience.
```

**Tool**: Replit Agent

**Outcome**:
- Serveur (`/api/chat/stream` et `/api/chat`) : à chaque échange, un bloc de contexte est désormais injecté dans **chaque** message OpenAI (pas seulement le premier) :
  `[Suivi des indices: N/6 trouvés (X, Y) — manquants: A, B, C]`
  Calculé à partir de `session.foundClues` (DB) + `detectedClues` (message courant), dédupliqué.
- Instructions adaptatives en cascade :
  - `missingClues.length === 0` → félicitations + récap + "Poursuivre"
  - `missingClues.length === 1` → guide vers le dernier indice + "Poursuivre" si validé dans cette réponse
  - `exchangeCount === 7` → avant-dernier échange avec liste des manquants
  - `exchangeCount >= 8` → récap complet + "Poursuivre"
- Client (`TutorialScreen.tsx`) : `setConversationEnded(true)` déclenché dès `newFoundClues.length >= TOTAL_CLUES` dans `onComplete` (streaming) et dans `processMessageNonStreaming`.
- Bonus : migration legacy dans `SessionFlowContext` — reset automatique des sessions sans `accessToken` pour éviter les 403 silencieux.

**Architecture**:
```
Avant:
Tour 1 → "[Indices trouvés: aucun] + message"  ← contexte injecté
Tour 2 → "message" seulement                   ← Peter oublie
Tour N → "message" seulement                   ← Peter peut redemander ADN

Après:
Tour 1 → "[Suivi 0/6 — manquants: ADN, Plastique, ...] + message"
Tour 2 → "[Suivi 1/6 (ADN) — manquants: Plastique, ...] + message"
Tour N → "[Suivi 5/6 (ADN,Plastique,...) — manquants: Femme]
          [INSTRUCTION: guide vers Femme, Poursuivre si validé] + message"
```

**Surprise**: Le calcul `allFoundSoFar` combine `session.foundClues` (DB) + `detectedClues` (message courant) **avant** d'envoyer à OpenAI — ce qui couvre le cas où l'utilisateur mentionne un indice dans son message et que le serveur le détecte immédiatement, sans attendre la réponse de Peter.

**Friction**: Le spread `[...new Set([...])]` ne compile pas avec la config TS du projet (`--downlevelIteration` absent). Solution : `.filter((v, i) => arr.indexOf(v) === i)` pour dédupliquer sans Set spread.

**Time**: ~20 minutes

---

### [2026-05-02] — Bulle "Peter réfléchit" inspirée Claude (latence subjective) 🔷

**Intent**: Réduire l'impression de latence pendant la génération de la réponse de Peter en affichant immédiatement une bulle de réponse "vivante" (animations + phrases rotatives, dont des allusions au plastique), visuellement distincte de la vraie réponse pour éviter qu'elles se parasitent. S'inspirer de Claude d'Anthropic.

**Prompt(s)**:
```
Durant le moment où la réponse de Peter est générée, il faut tout de suite ajouter
une bulle de réponse de Peter, avec une indication "vivante" (animations diverses ?)
qui fait des variations de "Peter pense", "Peter réfléchit" etc, dans le format,
le style du projet, tout en y ajoutant de temps en temps de allusions au thème du
plastique. […] Réduire subjectivement l'impression de latence et d'attente.
S'inspirer de la manière que fonctionne Claude d'Anthropic.
```

**Tool**: Replit Agent

**Outcome**:
- Nouveau composant `ThinkingBubble` dans `ConversationPanel.tsx` : bulle visuellement distincte des vraies réponses (fond `bg-card/40`, bordure dashed, italique muted, avatar avec `bounce-subtle`, 3 points animés en séquence).
- 12 phrases rotatives toutes les 2.8s, mélangées au mount, alternant générique + allusions plastique : "Peter réfléchit", "Peter observe l'image", "Peter cherche au fond du sac plastique", "Peter trie les microplastiques", "Peter remonte la chaîne du plastique", "Peter écoute ce que disent les déchets", etc. Transition fluide `thinking-fade` (0.35s) à chaque changement de phrase via `key={phrase}`.
- État `isThinking` + ref `firstSentenceReceivedRef` dans `TutorialScreen.tsx` : activation dès l'envoi du message user, désactivation au premier `onSentence` (streaming) ou avant `setMessages` (non-streaming).
- Suite revue architect : garde-fous ajoutés sur `onComplete` (cas stream complète sans phrase) et `onError`, tous generation-scoped (`streamGenerationRef.current === currentGeneration`) pour éviter qu'un callback en retard d'un ancien stream ne touche l'état du nouveau.
- Accessibilité : `role="status" aria-live="polite" aria-label="{phrase}…"`, support `prefers-reduced-motion` via `motion-reduce:animate-none` sur toutes les animations (avatar bounce, dots, fade).
- Nouvelles keyframes Tailwind `thinking-dot` (1.2s ease-in-out infinite) et `thinking-fade` (0.35s ease-out).

**Architecture**:
```
Avant:
User envoie → setMessages(user) → API call (3-10s silence visuel) → setMessages(assistant)

Après:
User envoie → setMessages(user) + setIsThinking(true)
            ↓
        ThinkingBubble (bulle distincte, phrases rotatives, dots animés)
            ↓
Stream onSentence #1 → setIsThinking(false) + setMessages(assistant streaming)
            ↓
Stream onComplete → setIsThinking(false) [garde-fou] + setMessages(final)
```

**Surprise**: Le pattern `key={phrase}` sur le `<span>` permet à React de remonter le node à chaque changement de phrase, ce qui réinitialise automatiquement l'animation `thinking-fade` sans avoir besoin de gestion de state additionnelle.

**Friction**: Le shuffle initial des phrases doit être fait dans un `useMemo` (et non un `useState`) pour rester stable mais sans warnings React, et la première phrase ("Peter réfléchit") est gardée en position 0 pour assurer un démarrage cohérent.

**Time**: ~30 minutes (composant + state machine + revue architect + corrections accessibilité/race conditions)

---

### [2026-05-02] — Peter suit les indices à chaque échange + fin auto à 6/6 🔷

**Intent**: Corriger deux bugs pédagogiques liés : (1) Peter "oubliait" les indices déjà trouvés aux échanges suivants car le contexte n'était injecté qu'une seule fois dans le thread, (2) la conversation ne se terminait pas automatiquement quand tous les 6 indices étaient trouvés — obligeant les élèves à attendre la fin du quota d'échanges.

**Prompt(s)**:
```
Peter oublie les indices déjà trouvés lors d'un échange précédent.
Aussi : quand tous les 6 indices sont trouvés, la conversation devrait
se terminer et proposer "Poursuivre" immédiatement, même avant le 8e échange.
```

**Tool**: Replit Agent

**Outcome**:
- **Suivi continu (serveur)** : `server/routes.ts` injecte désormais sur *chaque* message un bloc de contexte `[Suivi des indices: N/6 trouvés (X, Y) — manquants: A, B, C]`, calculé à partir de `session.foundClues` (DB) fusionné avec les indices détectés dans le message courant. Peter dispose ainsi d'une vue complète à chaque tour.
- **Instructions adaptatives** selon le nombre de manquants :
  - 0 manquant → félicitations personnalisées + récap des 6 + invitation « Poursuivre »
  - 1 manquant → guidage ciblé vers l'indice précis + « Poursuivre » si validé dans la réponse
  - Échanges 7 et 8 → comportement existant enrichi avec les listes trouvés/manquants
- **Fin de conversation côté client** : `TutorialScreen.tsx` — dans les callbacks `onComplete` (streaming) et le chemin non-streaming — déclenche `setConversationEnded(true)` dès que `newFoundClues.length >= TOTAL_CLUES`. Le bouton « Poursuivre » (déjà vert + flash quand 6/6) devient la seule action disponible immédiatement.
- **Fix legacy sessions** : `SessionFlowContext.tsx` détecte les sessions avec `sessionId` sans `accessToken` (créées avant l'auth par token) et les reset proprement pour éviter des 403.
- Déduplication sans Set spread : `.filter((v, i) => arr.indexOf(v) === i)` pour éviter une erreur TS `--downlevelIteration`.

**Architecture**:
```
Avant:
Message #1 → [contexte indices injecté une fois] → Peter mémorise (peut-être)
Message #2 → [aucun contexte] → Peter peut "oublier" ou redemander un indice trouvé

Après:
Message #N → [Suivi: 3/6 trouvés (ADN, Végétation, Homme) — manquants: X, Y, Z]
           → Peter sait exactement où on en est, à chaque échange

Fin de conversation:
Avant: attendre le 8e échange ou que l'élève clique manuellement
Après: onComplete détecte 6/6 → conversationEnded=true → bouton "Poursuivre" s'illumine
```

**Surprise**: Le calcul `allFoundSoFar = [...session.foundClues, ...detectedInMessage]` (dédupliqué) couvre le cas où l'élève mentionne un indice dans son message courant et que le serveur le détecte *avant* que Peter réponde — Peter peut donc féliciter pour cet indice dès cette même réponse.

**Friction**: Le spread `[...new Set([...])]` ne compile pas avec la config TS du projet (`--downlevelIteration` absent). Solution propre : `.filter((v, i) => arr.indexOf(v) === i)`.

**Time**: ~25 minutes

---

### [2026-05-02] — Deepgram Live Transcription + Waveform Amplification 🔷

**Intent**: Rendre visible que le micro capte bien quelque chose pendant l'enregistrement (waveform trop discrète), et afficher la transcription en temps réel dans la zone de saisie pendant que l'utilisateur parle — pour réduire la perception d'attente et rassurer sur la captation.

**Prompt(s)**:
```
(1) Rendre le waveform d'enregistrement beaucoup plus visible
(2) Ajouter la transcription Deepgram en direct dans la barre de texte pendant
    que l'utilisateur parle, avec Whisper en passe de correction pour le message
    final envoyé à Peter
```

**Tool**: Replit Agent

**Outcome**:
- Waveform : 9 barres (était 5), conteneur `h-16/h-20` (était `h-6/h-8`), gain perceptuel `sqrt(level)×2.2` + plancher ambiant `0.12`, opacité proportionnelle au niveau, transition 75ms.
- Relais WebSocket serveur `server/deepgramRelay.ts` : `WebSocketServer({noServer:true})` sur `/ws/deepgram` via l'événement `upgrade` http. Ouvre une connexion upstream vers Deepgram nova-2 FR avec `interim_results`, `smart_format`, `endpointing 300ms`. Transfère les chunks binaires du client vers Deepgram, parse les `Results` et les renvoie comme `{type:'transcript', transcript, isFinal}`.
- Hook client `useDeepgramTranscription` : ouvre le WS authentifié, lance un second `MediaRecorder` (timeslice 250ms) sur le même `MediaStream`, envoie chaque chunk. Cleanup au démontage.
- `TutorialScreen` accumule committed+interim dans `liveTranscript`, passe le prop aux deux instances de `ConversationPanel` (mobile + desktop).
- Pendant l'enregistrement la zone de saisie affiche le texte live avec curseur clignotant. Whisper reste la source de vérité pour l'envoi à Peter.
- Suite revue architect : auth session obligatoire sur `/ws/deepgram` (sessionId+token), limite anti-abus 3 connexions/IP via `socket.remoteAddress`, buffer audio plafonné (40 chunks/4MB), timeout upstream 8s, hard kill 5min, cleanup idempotent, `deepgram.stop()` dans `reset()` et unmount, max-height sur l'affichage transcript.

**Architecture**:
```
Enregistrement utilisateur:
  MicRecorder (Whisper) → audio blob → POST /api/speech-to-text → correction finale → Peter
  MicRecorder (Deepgram) → chunks 250ms → WS /ws/deepgram → upstream Deepgram
                                                           ← {transcript, isFinal}
                                                           → liveTranscript state
                                                           → ConversationPanel (curseur)

Sécurité WS:
  upgrade → auth(sessionId, token) → IP rate-limit → handleUpgrade
  client close → cleanup() → releaseIp() → upstream.close()
```

**Surprise**: Le pattern "deux MediaRecorder sur le même MediaStream" fonctionne sans interférence — les tracks audio sont partagés en lecture seule, chaque recorder produit son propre encodage indépendamment.

**Friction**: Le SDK Deepgram v5 (Fern-generated) ne fournit plus d'API live transcription — solution : connexion upstream WebSocket directe avec `Authorization: Token` côté serveur, ce qui a l'avantage de ne jamais exposer la clé côté client.

**Time**: ~90 minutes (architecture serveur, hook client, wiring TutorialScreen, review architect × 2, hardening sécurité)

---

### [2026-05-02] — PostHog "Pipeline Latency Comparison" Dashboard 🔹

**Intent**: Créer un dashboard PostHog dédié au suivi de la latence des pipelines streaming/non-streaming, avec percentiles p50 et p95 par type de pipeline.

**Outcome**:
- Dashboard créé via l'API REST PostHog (id=656626) : [lien direct](https://eu.posthog.com/project/107669/dashboard/656626)
- 6 insights : `Audio Playback Started p50/p95`, `TTS Phase 1 Ready p50/p95`, `TTS Phase 2 Ready p50/p95` — chacun breakdowné par propriété `pipeline`
- API PostHog legacy (filters) bloquée en 403 → utilisation du format `InsightVizNode/TrendsQuery` plus récent
- `docs/POSTHOG_DASHBOARDS.md` créé pour la maintenabilité future

**Time**: ~15 minutes (API calls only, no code changes)

---

### [2026-05-02] — Rolling Phase 2 TTS Dispatch & Welcome Pre-generation 🔷

**Intent**: Réduire encore la latence conversation en déclenchant la TTS de qualité plus tôt (sans attendre la fin du LLM) et en pré-générant le message de bienvenue dès la création de session pour que Peter parle immédiatement à l'arrivée sur l'écran tutoriel.

**Prompt(s)**:
```
Implémenter 3 optimisations latence : (A) rolling Phase 2 TTS early dispatch mid-stream,
(B) pré-génération du message de bienvenue à la création de session,
(C) MIN_SENTENCE_CHARS abaissé 80→55.
```

**Tool**: Replit Agent

**Outcome**:
- `MIN_SENTENCE_CHARS` abaissé 80 → 55 : Phase 1 (flash model) se déclenche plus tôt sur les phrases courtes (~200-400ms gagnés sur le premier audio).
- Phase 2 scindée en deux appels parallèles au lieu d'un seul bloc à la fin du LLM :
  - `dispatchPhase2aTts()` se déclenche mid-stream dès 120 chars ou 3 phrases accumulées, avec `previous_text = phase1Text`.
  - `dispatchPhase2bTts()` traite les phrases résiduelles à `thread.run.completed`, avec `previous_text = phase1Text + phase2aText` pour une continuité prosodique complète.
- `POST /api/sessions` lance désormais la génération ElevenLabs du message de bienvenue en arrière-plan dès la création DB. Un `welcomeAudioToken` (UUID) est retourné dans la réponse JSON. L'app le stocke en sessionStorage. TutorialScreen le consomme au montage via `/api/tts/play/{token}` — fallback automatique vers la génération à la demande si le token est absent ou expiré.
- Fichiers: `server/routes.ts`, `client/src/lib/api.ts`, `client/src/App.tsx`, `client/src/components/TutorialScreen.tsx`

**Architecture**:
```
Avant (Phase 2 classique):
LLM stream → S1, S2, S3 (Phase 1 TTS mid-stream)
LLM complete → Phase 2 TTS (S4+S5+S6 en un bloc) → audio joue après silence

Après (Phase 2 rolling):
LLM stream → S1, S2 (Phase 1 TTS)
           → S3, S4, S5 (Phase 2a TTS mid-stream, pas d'attente fin LLM)
LLM complete → Phase 2b TTS (S6 résiduel si présent)
(chevauchement temporel → moins de silence entre Phase 1 et Phase 2)

Bienvenue:
Avant: WelcomeSetup → navigate → TutorialScreen.mount → TTS(3-5s) → audio
Après: WelcomeSetup → POST /api/sessions → TTS starts background → navigate
       → TutorialScreen.mount → fetch pregen token (~0s si prêt) → audio
```

**Surprise**: Le pattern `sessionStorage.getItem('welcomeAudioToken')` + suppression immédiate ("consume once") est simple et robuste — aucun état global supplémentaire requis.

**Friction**: La chaîne `previous_text` pour Phase 2b nécessite de conserver `phase2aText` pour que l'ElevenLabs API produise une prosodie cohérente avec les segments précédents.

**Time**: ~30 minutes

---

### [2026-03-07] — TTS Pre-Generation & Streaming Playback (Phase 3 Latence) 🔷

**Intent**: Réduire drastiquement la latence entre l'affichage du texte et le début de la voix de Peter, rendue trop longue par le fix du registre vocal (qui attend le texte complet avant de générer le TTS).

**Prompt(s)**:
```
Il y a une trop grande latence entre le texte qui s'affiche et la voix Elevenlab ! Quelles sont les possibilités d'optimisation pour avoir quelque chose de beaucoup plus réactif, la voix qui arrive beaucoup plus vite ?
```

**Tool**: Claude Code (claude-opus-4-6)

**Outcome**:
- Pré-génération TTS côté serveur : dès que le LLM termine, le serveur lance immédiatement la génération audio ElevenLabs en arrière-plan (sans attendre la requête client).
- Token system : le `complete` SSE event inclut un `ttsToken` que le client utilise pour accéder à l'audio pré-généré via `GET /api/tts/play/:token`.
- Lecture streaming native : nouvelle méthode `playFromUrl()` qui pointe `audio.src` directement sur l'URL serveur. Le navigateur gère le buffering et commence à jouer dès qu'il a assez de données.
- Store temporaire avec TTL 60s et cleanup automatique toutes les 30s.
- Fallback client-side si le token n'est pas disponible.
- Helper `generateTtsAudio()` factorisé pour réutilisation entre les endpoints.

**Architecture Delta**:
```
Avant:
LLM done → SSE complete → Client POST text → Server calls ElevenLabs →
Server streams chunks → Client collects ALL chunks → Blob → play()
(~3s de latence après affichage texte)

Après:
LLM done → Server starts TTS immediately → SSE complete (with ttsToken) →
Client sets audio.src = /api/tts/play/token → Browser streams + plays natively
(~0.5-1s de latence après affichage texte)
```

**Surprise**: La lecture streaming native du navigateur (`audio.src = URL`) est beaucoup plus efficace que la collecte manuelle de chunks + blob — le navigateur commence à jouer dès les premiers bytes bufferisés.

**Friction**: La pré-génération côté serveur nécessite un store temporaire en mémoire. Risque de memory leak si pas de cleanup, résolu par un TTL automatique.

**Time**: ~25 minutes

---

## Pulse Checks

*Subjective snapshots. AI should prompt these every 3-5 features or at major moments.*

### [2024-12-12] — Pulse Check #1

**Energy level** (1-10): 8/10

**Current doubt**: Will students actually enjoy voice conversations with AI, or will it feel awkward?

**Current satisfaction**: The clue detection system is working smoothly—feels like students will genuinely discover things rather than being told.

**If you stopped now, what would you regret?**: Not completing the community synthesis page with upvoting. That's the "aha" moment where students see their thinking reflected in the group.

**One word for how this feels**: Promising.

---

## Insights Vault

*Learnings that transcend this specific project. Things you'd tell someone starting a similar journey.*

- [2024-12-12]: Sometimes the simplest solution (web snippet) outperforms the "proper" programmatic approach. Ship the thing that's easier to maintain.
- [2024-12-12]: Variant matching in AI detection creates pedagogical flexibility—let students express ideas in their own language, don't force exact matches.
- [2024-12-12]: Dual-mode interfaces (drag + click) are more accessible AND feel better on mobile than we expected.
- [2026-02-16]: Une passe "fiabilité" sans changement fonctionnel peut améliorer fortement l'expérience perçue (moins de crashes, moins de glitches) en ciblant storage, listeners et viewport.

---

## Artifact Links

*Screenshots, recordings, deployed URLs, social posts — external evidence of the journey.*

| Date | Type | Link/Location | Note |
|------|------|---------------|------|
| 2024-12-12 | Live App | http://localhost:5000 | Development server running |
| 2024-12-12 | PostHog Dashboard | https://us.i.posthog.com | Analytics live |

---

## Narrative Seeds

*Raw material for the final story. Quotes, moments, metaphors that emerged during the build.*

- "We let students find clues instead of having them explained"
- "A 14-year-old in Geneva, learning that plastic pollution connects to human choices"
- "Voice feels like conversation, not instruction"

---

## Story Synthesis Prompt

*When ready to generate the narrative, use this prompt with the entire STORY.md as context:*

```
You are helping me write the genesis story of Dilemme Plastique. 

Using the documented journey in this file, craft a compelling narrative following this structure:
1. Open with the Friction (make readers feel why this matters)
2. Establish the Conviction (why we had to build this)
3. Show the messy Process (the pivots with PostHog, variant matching, accessibility)
4. Highlight key Progression moments (clue detection working, game completing, analytics live)
5. Weave in Human moments (from Pulse Checks—the doubt about voice, the satisfaction of discovery)
6. Close with Durable Insights (simple solutions > complicated ones, let users express in their language)

Tone: Honest, specific, humble but confident. Focus on what we learned about teaching, not just code shipped.
Length: Blog post (~1500 words)
```

---

## AI Instructions

*These instructions are for the AI assistant helping build this project:*

```
STORY.md MAINTENANCE PROTOCOL:

1. AFTER EACH FEATURE:
   - Add entry to "Feature Chronicle"
   - 🔷 Major = new capability, significant UI change, integration
   - 🔹 Minor = bug fix, tweak, small improvement
   
2. ON ERRORS/PIVOTS:
   - Add entry to "Pivots & Breakages" immediately
   - Capture emotional context if shared
   
3. EVERY 3-5 FEATURES:
   - Trigger Pulse Check: Ask creator ONE question from:
     * "How's your energy right now, 1-10?"
     * "What's your biggest doubt at this moment?"
     * "What's giving you satisfaction in this build?"
     * "If you had to stop now, what would you regret not finishing?"
     * "One word for how this project feels today?"
   - Record answer in "Pulse Checks" section
   
4. ON INSIGHTS:
   - When creator expresses a learning, add to "Insights Vault"
   
5. ON ARTIFACTS:
   - When screenshots/links are shared, add to "Artifact Links"
   
6. ALWAYS:
   - Update "Last Updated" date
   - Preserve exact prompts when significant
   - Don't sanitize failures or confusion
   - Keep this protocol visible and active throughout the build
```
