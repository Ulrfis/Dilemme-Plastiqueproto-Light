# Dilemme Plastique — Development Story

> **Status**: 🟡 In Progress  
> **Creator**: Ulrich Fischer  
> **Started**: 2024-11-12  
> **Last Updated**: 2024-12-19  

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
