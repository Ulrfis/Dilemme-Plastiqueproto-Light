# Dilemme - Voice-First AI Educational App

## Overview

Dilemme is a mobile-first educational web application designed for classroom use. It enables students to explore environmental issues, particularly plastic pollution, through AI-guided image analysis. Users interact with an AI assistant named "Peter" via voice to discover hidden clues in images and synthesize their findings, fostering an interactive and engaging learning experience. The project aims to provide an accessible, interactive, and effective educational tool for environmental literacy.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend

The frontend is built with React 18, TypeScript, and Vite, prioritizing a mobile-first responsive design (320px-428px viewport). It uses Wouter for lightweight routing and SessionFlowContext with sessionStorage for state management, complemented by TanStack Query for server state. UI components are developed with Shadcn/ui based on Radix UI and styled using Tailwind CSS, adhering to Material Design 3 principles. Accessibility is a core consideration, with ARIA labels and keyboard navigation.

### Backend

The backend is an Express.js application with TypeScript running on Node.js. It uses PostgreSQL (Neon serverless) with Drizzle ORM for data persistence. Key tables store tutorial session data, conversation messages, and user feedback. The system uses UUID-based session identification to manage the lifecycle from creation to completion.

### AI Integration

The application heavily integrates with OpenAI for core AI functionalities:
- **Speech-to-Text**: Whisper-1 for transcribing user voice input (with Deepgram for live, interim transcription feedback).
- **Conversational AI**: GPT Assistant API manages dialogue context and responses.
- **Text-to-Speech**: ElevenLabs (voice ID `R8IjtpeRZsjoJfq1wwj3` for "Peter") synthesizes AI responses.
- **Streaming Architecture**: Server-Sent Events (SSE) deliver LLM responses sentence-by-sentence, enabling per-sentence TTS and an audio queue for sequential playback, significantly reducing perceived latency.
- **Clue Detection**: Real-time detection of specific environmental clues within user conversations.

### Performance Optimizations

Several strategies are implemented to optimize performance, especially reducing perceived latency for AI interactions:
- **TTS Caching**: MD5 hash-based caching of ElevenLabs audio responses.
- **API Connection Warming**: DNS prefetch and preconnect for external API endpoints.
- **Per-Sentence TTS Pipeline (Phase 2)**: SSE streams LLM responses sentence-by-sentence; TTS generates concurrently; `useAudioQueue` plays in order. First audio ~2–3s after send (was 5–9s).
- **Phase 3 Optimizations (Task #26)**:
  - `MIN_SENTENCE_CHARS=55`: Phase 1 groups short sentences to avoid TTS on fragments.
  - Phase 2a rolling dispatch: fires mid-stream when ≥120 chars or ≥3 sentences accumulated (not only at stream completion), closing silence gap between Phase 1 and Phase 2 audio.
  - Welcome audio pre-generation: TTS token generated at session creation, stored in `sessionStorage('welcomeAudioToken')`, consumed immediately in `handleUnlockAudio`.
- **"Peter is Thinking" Bubble**: Animated visual indicator during AI processing.
- **Resume Pre-generation (Task #30)**: After each chat exchange, `schedulePregenResume()` runs in the background (fire-and-forget) to silently generate + TTS the next session-resume message. Stored in `pregenResumeStore` (keyed by sessionId, 5 min TTL). `TutorialScreen` tries `GET /api/sessions/:id/resume-token` first when a returning user arrives; on 404 it falls back to the existing `POST /api/sessions/:id/resume` on-demand path. A `resume_audio_latency` PostHog event records `used_pregen` and `latency_ms`.

### Latency Measurement Instrumentation (Task #27)

Two PostHog events instrument the Phase 3 optimizations:

#### `welcome_audio_latency`
Fired in `TutorialScreen.handleUnlockAudio` just before `playAudio()` is called.
| Property | Type | Description |
|---|---|---|
| `used_pregen` | bool | `true` = pre-generated token was available and valid; `false` = on-demand fallback |
| `latency_ms` | number | ms from entering welcome branch to audio blob ready |

**Baseline (development observations)**:
- `used_pregen=true`: ~150–500ms (fetch from in-memory `ttsRequestStore`)
- `used_pregen=false`: ~1 500–3 000ms (live ElevenLabs API call)

#### `phase2a_dispatch_timing`
Fired client-side when server emits SSE `type: 'phase2a_timing'` (immediately at Phase 2a dispatch, before TTS completes).
| Property | Type | Description |
|---|---|---|
| `dispatched_mid_stream` | bool | `true` = threshold reached during streaming; `false` = flushed at `thread.run.completed` |
| `chars_at_dispatch` | number | accumulated char count of Phase 2a text when dispatched |

**Baseline (development observations)**:
- Normal-length responses (≥3 sentences): `dispatched_mid_stream=true` in ~70–80% of exchanges.
- Short responses (1–2 sentences total): `dispatched_mid_stream=false`, handled entirely by Phase 1.

#### PostHog Dashboard — "Latence TTS — Impact Phase 3"
To create in PostHog UI (app.posthog.com → Insights → New insight):

**Insight 1 — Welcome audio latency by path**
- Type: Trends
- Event: `welcome_audio_latency`
- Breakdown: `used_pregen` (bool)
- Aggregation: p50 of `latency_ms`, then p95 of `latency_ms` (two series)
- Date range: Last 30 days (rolling)
- Title: `Welcome audio p50/p95 — pregen vs on-demand`

**Insight 2 — Phase 2a mid-stream dispatch rate**
- Type: Trends
- Event: `phase2a_dispatch_timing`
- Breakdown: `dispatched_mid_stream`
- Aggregation: Count (absolute) and % of total (derived)
- Date range: Last 30 days (rolling)
- Title: `Phase 2a dispatch timing — mid-stream vs at-completion`

**Insight 3 — Phase 1 TTS latency trend**
- Type: Trends
- Event: `tts_phase1_ready`
- Aggregation: p50 of `latency_ms`, p95 of `latency_ms`
- Date range: Last 90 days (to show before/after Task #26 inflection)
- Title: `Phase 1 TTS p50/p95 over time`

Group the three insights into a dashboard named **"Latence TTS — Impact Phase 3"**.
Filter all insights to exclude `$host contains localhost` to keep only production data.

### Comprehensive PostHog Tracking (Task #32)

All client-side `captureEvent()` calls now auto-inject `session_id` and `user_name`
read from sessionStorage via `readStoredSessionFlow()`. `captureWithContext` is
exported as an alias for clarity at call sites. Events added in Task #32:

- `posthog_health_check` — fired ~3s after app mount with SDK status, distinct_id, loaded flag.
- `js_error` — global `window.error` + `unhandledrejection` handlers (truncated stack).
- `mic_permission` — `{ state: granted|denied, source: check|start_recording|synthesis, error_name?, error_message? }`. May fire from both check and start paths in one flow; analyze by `source`.
- `audio_interrupted` — fired in `useVoiceInteraction` `audio.onpause` only when not explicitly stopped.
- `voice_turn_complete` — fired in streaming `onComplete` for voice turns: `recording_to_complete_ms`, `stt_to_complete_ms`, `exchange`, `new_clues`.
- `clue_discovered` — one event per new clue (both streaming + non-streaming pipelines): `clue, total_found, total_clues, exchange, pipeline`.
- `fallback_mode_activated` — `reason: no_mediarecorder|mic_denied|mic_not_found|mic_unsupported`.
- `game_started` — DragDropGame mount.
- `drag_drop_attempt` — every word placement: `slot_id, word, correct, attempt_number`.
- `drag_drop_validation` — every "Valider" click: `errors, success, validation_attempt, attempts`.
- `game_completed` (enriched) — adds `duration_seconds, attempts, validation_attempts`.
- `synthesis_input_mode` — first input (voice or text) per submission.
- `synthesis_submitted` (enriched) — adds `input_mode`.
- `video_intro_outcome` — `outcome: completed|skipped|error` with `time_in_video_ms, video_current_time, video_duration`.
- `api_error` — captured in `catch` of fetches: `endpoint, status?, context, error_message?`.
  Endpoints instrumented: `/api/tts/play` (welcome_pregen, resume, streaming_sentence_block),
  `/api/sessions/{id}/resume`, `/api/sessions/{id}/synthesis`, `/api/speech-to-text`.

### Media Management

The application manages audio context for recording and playback, requiring user gesture-based unlock on mobile. Voice interaction involves MediaRecorder for audio capture, Whisper for transcription, and ElevenLabs for synthesis. Video content is hosted on Gumlet, supporting HLS streaming, autoplay, and fullscreen.

## External Dependencies

### Third-Party APIs

- **OpenAI Platform**: For Speech-to-Text (Whisper), and Conversational AI (GPT Assistant API).
- **ElevenLabs**: For Text-to-Speech synthesis.
- **Google Sheets API**: For real-time data synchronization and analytics via Replit Connectors.
- **Gumlet Video Hosting**: For serving introductory video content.
- **Deepgram**: For live, interim speech-to-text transcription during user input.

### Database

- **PostgreSQL (Neon Serverless)**: Primary data store, provisioned via Replit, accessed using Drizzle ORM.

### UI Component Libraries

- **Radix UI**: Foundational accessible UI primitives.
- **Shadcn/ui**: Pre-built UI components based on Radix UI.
- **Lucide React**: Icon library.
- **React Zoom Pan Pinch**: For image interaction in the tutorial.

### Build and Development Tools

- **Vite**: Frontend build tool.
- **esbuild**: Backend bundling.
- **Drizzle Kit**: Database migration and schema management.
- **TypeScript**: For type safety.
- **Tailwind CSS**: Utility-first CSS framework.

### Replit-Specific Integrations

- **Replit Connectors**: Facilitates Google Sheets integration.
- **Environment Variables**: For managing API keys and secrets.
- **Database Provisioning**: Automatic setup of Neon PostgreSQL.