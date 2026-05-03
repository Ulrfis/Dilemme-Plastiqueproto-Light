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
- **Per-Sentence TTS Pipeline**: Streaming LLM responses via SSE and generating TTS for each sentence concurrently with LLM generation, managed by an audio queue.
- **Pre-generated Audio**: Welcome messages are pre-generated to reduce initial load time.
- **"Peter is Thinking" Bubble**: Visual cues and animated indicators to manage user perception during AI processing.

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