# Dilemme - Voice-First AI Educational App

## Overview

Dilemme is a mobile-first educational application that enables students to analyze images through voice-guided AI conversations. The app focuses on discovering hidden clues within images through natural dialogue with an AI assistant. Built as a prototype to demonstrate the core concept of guided image analysis with voice interaction as the primary interface.

**Target Audience**: Educational classroom settings (24+ concurrent sessions)  
**Session Duration**: ≤5 minutes for tutorial  
**Primary Interface**: Voice-first (Speech-to-Text and Text-to-Speech)  
**Platform**: Mobile-optimized web application (320px-428px viewport priority)

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture

**Framework**: React 18+ with TypeScript  
**Build Tool**: Vite  
**Routing**: Wouter (lightweight client-side routing)  
**State Management**: TanStack Query v5 for server state  

**UI Component Library**: Shadcn/ui (Radix UI primitives)
- Material Design 3 principles adapted for educational context
- Custom theme system using CSS variables for light/dark modes
- Mobile-first responsive design with Tailwind CSS
- Touch-friendly interaction zones (minimum 44px targets)

**Typography System**:
- Primary: Inter (400-700 weights)
- Secondary: Space Grotesk (500-700 for branding)
- Loaded via Google Fonts CDN

**Key Design Patterns**:
- Screen-based navigation flow (title → video intro → welcome setup → tutorial → score)
- Component composition with examples directory for development
- Accessibility-first approach with immediate visual and auditory feedback
- Progressive enhancement with fallback modes

**Video Introduction Flow** (Recent Enhancements):
- Immediate autoplay after "Commencer" button click (no secondary button)
- Automatic landscape orientation and fullscreen attempt on mobile
- Skip button visible throughout playback for quick navigation
- Simplified UX: single click to start video experience
- Guidance message "Mode paysage recommandé" hidden when video is fullscreen
- Fullscreen state tracking via event listeners for smart UI visibility

### Backend Architecture

**Runtime**: Node.js with Express  
**Type Safety**: TypeScript throughout (strict mode enabled)  
**Module System**: ES Modules (type: "module")  

**API Structure**:
- RESTful endpoints under `/api` prefix
- Session-based architecture (no user authentication in prototype)
- OpenAI integration for conversational AI
- Real-time clue detection using keyword matching

**Session Management**:
- In-memory storage (MemStorage class) for prototype
- Session tracking with UUID generation
- Conversation history per session
- Progress tracking (found clues, score, completion status)

**Audio Processing**:
- Client-side recording using MediaRecorder API
- WebM audio format for recordings
- Browser-native Speech Synthesis for TTS
- OpenAI Whisper API for speech-to-text transcription

### Data Storage Solutions

**Database**: PostgreSQL via Neon serverless  
**ORM**: Drizzle ORM with TypeScript schema definitions  
**Schema Design**:
- `tutorial_sessions`: User sessions with progress tracking
- `conversation_messages`: Message history with role (user/assistant) and detected clues
- JSON fields for flexible clue arrays
- Timestamps for all records

**Development Storage**: In-memory fallback (MemStorage) for rapid prototyping without database dependency

**Migration Strategy**: Drizzle Kit for schema migrations stored in `/migrations`

### Authentication and Authorization

**Current State**: No authentication (prototype scope)  
**Session Identification**: UUID-based session IDs  
**Data Isolation**: Sessions isolated by ID, no cross-session access  

### Voice Interaction Architecture

**Speech-to-Text**:
- OpenAI Whisper API integration
- Audio captured via MediaRecorder (WebM format)
- Transcription sent to backend for processing

**Text-to-Speech**:
- ElevenLabs API for high-quality French voice synthesis
- Retry mechanism (3 attempts) for robustness against temporary failures
- Voice-synchronized typewriter effect for text display
- Graceful degradation to text-only mode on persistent TTS failures
- Vocal mode persists throughout conversation (no permanent fallback)

**Audio State Machine**:
- States: idle → recording → processing → playing → idle
- Error recovery with user-friendly fallbacks
- Permission handling for microphone access
- Mobile-specific: Auto-resume when audio paused unexpectedly

**Mobile Audio Recovery** (Latest Enhancement - Nov 21):
- Automatic detection of unexpected audio pause on mobile
- Attempts resume after 100ms delay for accidental interruptions
- Flag tracking to distinguish intentional vs. accidental pauses
- Graceful fallback if resume fails (cleanup and transition to idle)
- Improves reliability on smartphone browsers with aggressive power saving

**Voice-Text Synchronization** (Recent Enhancement):
- Typewriter effect synchronized with audio playback start
- `onAudioStart` callback triggered by `audio.onplaying` event
- Text appears word-by-word only when audio begins playing
- Prevents duplicate messages when playback fails
- Pending message system ensures one-to-one message correspondence

**Microphone Fallback Logic** (Recent Enhancement):
- Automatic text mode activation for permanent microphone errors:
  - NotFoundError (no microphone device available)
  - NotAllowedError (permissions denied)
  - NotSupportedError (browser incompatibility)
- Temporary errors preserve vocal mode with retry option
- Toast notifications inform user of mode changes
- Seamless UX in environments without microphone (e.g., Playwright tests)

**Clue Detection Logic**:
- Server-side keyword matching with variants
- Target clues: ADN, bébé, penseur de Rodin, plastique
- Case-insensitive detection with multiple variant support
- Real-time feedback on discovery

## External Dependencies

### Third-Party APIs

**OpenAI API** (Primary AI Service):
- GPT-3.5-turbo for conversational responses
- Whisper API for speech-to-text
- Text-to-speech endpoint for audio responses
- System prompt engineering for educational context
- Conversation history management

### Database Services

**Neon Serverless PostgreSQL**:
- Configured via DATABASE_URL environment variable
- Connection pooling via @neondatabase/serverless
- Session storage with connect-pg-simple

### UI Component Libraries

**Radix UI Primitives**:
- Accessible headless components
- Dialog, Popover, Toast, and other interactive elements
- Fully customized with Tailwind styling

**Additional UI Dependencies**:
- cmdk: Command palette interface
- react-day-picker: Calendar functionality
- lucide-react: Icon system
- class-variance-authority: Component variant management

### Development Tools

**Replit Integration**:
- Vite plugin for runtime error overlay
- Cartographer plugin for code navigation
- Development banner for environment awareness

### Build and Development

**Core Tools**:
- Vite: Development server and production builds
- esbuild: Server bundle compilation
- TypeScript: Type checking and compilation
- Tailwind CSS + PostCSS: Styling pipeline

**File Upload**: Multer middleware for handling audio uploads (in-memory storage)

### Fonts and Assets

**Google Fonts**: Inter and Space Grotesk served via CDN  
**Static Assets**: Images stored in `/attached_assets/generated_images/`  
**Video Content**: Tutorial video (`/intro-peter.mp4`)