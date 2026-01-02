# Dilemme - Voice-First AI Educational App

## Overview

Dilemme is a mobile-first educational web application that enables students to discover environmental issues through AI-guided image analysis. Users engage in voice-based conversations with an AI assistant named "Peter" to find hidden clues within images, learning about plastic pollution and environmental topics through interactive dialogue.

**Core Purpose**: Educational tool for classroom settings enabling students to analyze images through natural voice conversations with an AI assistant, discovering environmental clues and synthesizing their findings.

**Target Environment**: 
- Mobile-first (320px-428px viewport priority)
- Classroom deployment (24+ concurrent sessions)
- Session duration: ≤5 minutes for tutorial
- Primary interaction: Voice-based (Speech-to-Text and Text-to-Speech)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Stack

**Framework**: React 18 with TypeScript, built using Vite for optimal development and production performance.

**Routing**: Wouter for lightweight client-side routing with multi-route navigation:
- `/`: Title screen with start button
- `/video`: Video introduction with skip option
- `/welcome`: User name input and session creation
- `/tutorial`: Main AI conversation interface with image analysis
- `/game`: Drag-drop game for clue organization
- `/synthesis`: User synthesis writing screen
- `/feedback`: Feedback survey
- `/complete`: Completion screen
- `/syntheses`: Community page displaying user synthesis submissions with upvoting

**State Management**: 
- SessionFlowContext for centralized session state with sessionStorage persistence
- TanStack Query v5 for server state synchronization and caching
- Hybrid session validation (React state + sessionStorage) to handle navigation race conditions
- Custom hooks for complex stateful logic (voice recording, audio playback, streaming)

**UI Architecture**:
- Shadcn/ui component library built on Radix UI primitives
- Material Design 3 principles adapted for educational context
- Tailwind CSS for styling with custom design system
- CSS variables for theming (light/dark mode support)
- Mobile-first responsive design with touch-friendly targets (minimum 44px)

**Design System**:
- Primary font: Inter (400-700 weights)
- Secondary font: Space Grotesk (branding, 500-700)
- Color system using HSL values with CSS custom properties
- Spacing scale: 2, 4, 6, 8, 12, 16, 20, 24 (Tailwind units)

**Key Frontend Patterns**:
- Screen-based navigation flow with explicit state management
- Component composition with examples directory for isolated development
- Progressive enhancement with text fallback for voice interactions
- Accessibility-first approach with ARIA labels and keyboard navigation

### Backend Stack

**Server**: Express.js with TypeScript running on Node.js 20.x

**Database**: PostgreSQL (Neon serverless) with Drizzle ORM for type-safe database operations

**Core Tables**:
1. `tutorial_sessions`: User sessions with clues found, score, synthesis, questionnaire responses
2. `conversation_messages`: Chat history between user and AI assistant
3. `feedback_surveys`: User feedback data (deprecated - merged into tutorial_sessions)

**Session Architecture**:
- UUID-based session identification
- Session lifecycle: creation → message tracking → completion → feedback collection
- All data tied to user name with unified structure in `tutorial_sessions` table
- Real-time message count tracking and clue detection

### AI Integration Architecture

**OpenAI Integration**:
- **Speech-to-Text**: Whisper-1 model for voice transcription
- **Conversational AI**: GPT Assistant API (Assistant ID: `asst_P9b5PxMd1k9HjBgbyXI1Cvm9`)
- **Thread Management**: Each session maintains an OpenAI thread for conversation context
- **Organization**: `org-z0AK8zYLTeapGaiDZFQ5co2N`

**ElevenLabs Integration**:
- **Text-to-Speech**: Voice ID `CBP9p4KAWPqrMHTDtWPR` (Peter mai 2025 FR)
- **Model**: eleven_multilingual_v2
- **Caching Strategy**: MD5 hash-based TTS response caching (max 100 entries) for repeated phrases

**Streaming Architecture (Phase 2 Optimization)**:
- Server-Sent Events (SSE) for streaming LLM responses sentence-by-sentence
- Parallel TTS generation: Each sentence converted to audio as it arrives
- Audio queue management for sequential playback without blocking
- Reduces perceived latency from 6-18s to 3-4s by starting audio playback before full response completion

**Clue Detection System**:
- Target clues: ADN, bébé, penseur de Rodin, plastique
- Variant matching for flexible user input (e.g., "génétique" matches "ADN")
- Real-time detection during conversation with session state updates

### Performance Optimizations

**Phase 1 - Quick Wins**:
1. **TTS Response Caching**: MD5-based cache for audio responses (1-3s savings on repeated phrases)
2. **API Connection Warming**: DNS prefetch and preconnect for OpenAI/ElevenLabs endpoints (300-800ms reduction)

**Phase 2 - Streaming Pipeline**:
1. **SSE Streaming**: LLM responses streamed sentence-by-sentence via `/api/chat/stream` endpoint
2. **Parallel TTS**: Audio generation happens in parallel with LLM text generation
3. **Audio Queue**: Custom hook manages sequential audio playback while more chunks generate
4. **Expected Latency Reduction**: 6-11 seconds total (Phase 1 + Phase 2 combined)

**Frontend Performance**:
- Lazy loading and code splitting via Vite
- Image optimization with proper responsive images
- Audio context management with proper cleanup
- Mobile-specific optimizations for touch interactions

### Media Management

**Audio Context Handling**:
- Centralized MediaContext for audio unlock management
- User gesture-based audio unlock (required for mobile browsers)
- Audio keep-alive mechanism to prevent context suspension
- Proper cleanup of audio resources on component unmount

**Voice Interaction Flow**:
1. User initiates recording via microphone button
2. Audio captured via MediaRecorder API (WebM format)
3. Sent to `/api/speech-to-text` for Whisper transcription
4. Text sent to `/api/chat/stream` for AI response
5. AI response streamed via SSE, each sentence sent to `/api/text-to-speech-streaming`
6. Audio chunks queued and played sequentially

**Fallback Mechanisms**:
- Text input mode if microphone permissions denied
- Non-streaming endpoints available if SSE fails
- Error recovery with user-friendly messaging

### Video Integration

**Provider**: Gumlet video hosting
- Video ID: `6916ff7ddf9720847e0868f0`
- Autoplay attempt with fullscreen on mobile
- Landscape orientation lock (when supported)
- Skip button for quick navigation

## External Dependencies

### Third-Party APIs

1. **OpenAI Platform** (`api.openai.com`)
   - Purpose: Speech-to-Text (Whisper), Conversational AI (GPT Assistant)
   - Authentication: API key via `OPENAI_API_KEY` environment variable
   - Organization: `org-z0AK8zYLTeapGaiDZFQ5co2N`
   - Critical dependency for core functionality

2. **ElevenLabs** (`api.elevenlabs.io`)
   - Purpose: Text-to-Speech voice synthesis
   - Authentication: API key via `ELEVENLABS_API_KEY` environment variable
   - Voice: Peter (ID: `CBP9p4KAWPqrMHTDtWPqrMHTDtWPR`)
   - Critical dependency for voice output

3. **Google Sheets API**
   - Purpose: Real-time data synchronization for analytics
   - Authentication: Replit connector via `REPLIT_CONNECTORS_HOSTNAME`
   - Auto-sync: Tutorial sessions and feedback responses
   - Non-blocking: Failures logged but don't interrupt user flow

4. **Gumlet Video Hosting**
   - Purpose: Intro video delivery
   - Embedded via iframe with autoplay controls
   - Non-critical: Skippable by users

### Database

**PostgreSQL (Neon Serverless)**:
- Provisioned via Replit deployment
- Connection string: `DATABASE_URL` environment variable
- ORM: Drizzle with type-safe schema definitions
- WebSocket support via `@neondatabase/serverless` with ws polyfill

### UI Component Libraries

1. **Radix UI**: Accessible component primitives (accordion, dialog, dropdown, etc.)
2. **Shadcn/ui**: Pre-built component system with Radix UI foundation
3. **Lucide React**: Icon library for consistent iconography
4. **React Zoom Pan Pinch**: Image zoom/pan functionality for tutorial image

### Build and Development Tools

1. **Vite**: Frontend build tool with HMR and optimized production builds
2. **esbuild**: Backend bundling for production deployment
3. **Drizzle Kit**: Database migration and schema management
4. **TypeScript**: Type safety across frontend and backend
5. **Tailwind CSS**: Utility-first CSS framework
6. **PostCSS**: CSS processing with autoprefixer

### Replit-Specific Integrations

1. **Replit Connectors**: Google Sheets integration via connector API
2. **Replit Development Plugins**: Runtime error modal, cartographer, dev banner
3. **Environment Variables**: Replit-managed secrets for API keys
4. **Database Provisioning**: Automatic Neon PostgreSQL setup

### Media APIs

1. **MediaRecorder API**: Browser-native audio recording
2. **Web Audio API**: Audio context management and playback control
3. **Screen Orientation API**: Landscape lock for video viewing (when supported)
4. **Fullscreen API**: Immersive video experience on mobile