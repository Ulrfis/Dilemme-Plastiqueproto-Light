import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type InsertTutorialSessionWithToken } from "./storage";
import { attachDeepgramRelay } from "./deepgramRelay";
import multer from "multer";
import OpenAI from "openai";
import { z } from "zod";
import { insertTutorialSessionSchema, insertConversationMessageSchema, insertFeedbackSurveySchema } from "@shared/schema";
import crypto from "crypto";
import { elevenLabsFetch } from "./elevenlabs-agent";

const AUDIO_MIME_WHITELIST = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp3",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB max to limiter le DoS
  },
  fileFilter: (_req, file, cb) => {
    if (AUDIO_MIME_WHITELIST.has(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

type RateEntry = { count: number; resetAt: number };
function createRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, RateEntry>();
  let lastPurge = Date.now();

  return function rateLimiter(req: any, res: any, next: any) {
    const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();

    // Purge expired entries every 5 minutes to prevent unbounded memory growth
    if (now - lastPurge > 5 * 60 * 1000) {
      for (const [k, v] of buckets) {
        if (now > v.resetAt) buckets.delete(k);
      }
      lastPurge = now;
    }

    const entry = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count += 1;
    buckets.set(key, entry);

    if (entry.count > maxRequests) {
      const retryAfter = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
      res.set("Retry-After", retryAfter.toString());
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    next();
  };
}

const generalLimiter = createRateLimiter(200, 15 * 60 * 1000); // 200 req / 15 min / IP
const ttsLimiter = createRateLimiter(60, 15 * 60 * 1000); // plus strict pour endpoints coûteux
const sttLimiter = createRateLimiter(60, 15 * 60 * 1000);

function requireAdmin(req: any, res: any): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    // No token configured: never expose the endpoint regardless of environment
    res.status(404).json({ error: 'Not found' });
    return false;
  }

  if (req.headers['x-admin-token'] !== adminToken) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// PHASE 1 OPTIMIZATION: TTS Response Cache
// Cache TTS audio by text hash to avoid regenerating identical responses
const ttsCache = new Map<string, Buffer>();
const TTS_CACHE_MAX_SIZE = 100; // Limit cache to 100 entries to prevent memory issues

// PHASE 3 OPTIMIZATION: Pre-generated TTS store
// Stores TTS generation promises by token so the server can start generating
// TTS as soon as the LLM finishes, before the client requests it.
interface TtsRequest {
  promise: Promise<Buffer>;
  createdAt: number;
}
const ttsRequestStore = new Map<string, TtsRequest>();
const TTS_REQUEST_TTL = 60000; // 60 seconds TTL for pre-generated audio

// Cleanup expired TTS requests every 30 seconds
setInterval(() => {
  const now = Date.now();
  ttsRequestStore.forEach((req, token) => {
    if (now - req.createdAt > TTS_REQUEST_TTL) {
      ttsRequestStore.delete(token);
    }
  });
}, 30000);

// Helper: Generate TTS audio from ElevenLabs (returns Buffer)
// previousText: text spoken before this segment, used by ElevenLabs to maintain prosody continuity
// quality: 'fast' uses eleven_flash_v2_5 for lowest latency (Phase 1)
//          'quality' uses eleven_multilingual_v2 for best prosody continuity (Phase 2)
async function generateTtsAudio(text: string, previousText?: string, quality: 'fast' | 'quality' = 'quality'): Promise<Buffer> {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const VOICE_ID = 'R8IjtpeRZsjoJfq1wwj3';

  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key not configured');
  }

  // Cache key includes text + quality level to avoid cross-phase cache pollution
  // (flash model audio should not be returned when quality model is requested and vice-versa)
  const textHash = crypto.createHash('md5').update(`${quality}:${text}`).digest('hex');
  if (!previousText && ttsCache.has(textHash)) {
    console.log('[TTS] Cache HIT:', textHash.substring(0, 8), `(${quality})`);
    return ttsCache.get(textHash)!;
  }

  // Phase 1 (fast): eleven_flash_v2_5, latency opt 3 → fast first audio without heavy compression artifacts
  // Phase 2 (quality): eleven_multilingual_v2, latency opt 2 → natural prosody for bulk of response
  const modelId = quality === 'fast' ? 'eleven_flash_v2_5' : 'eleven_multilingual_v2';
  const latencyOpt = quality === 'fast' ? 3 : 2;  // Was 4 for fast — level 4 causes compression artifacts on loud phonemes

  console.log('[TTS]', quality.toUpperCase(), 'mode — generating', text.length, 'chars', previousText ? `(with ${previousText.length} chars context)` : '', `[${modelId}]`);
  const body: Record<string, unknown> = {
    text,
    model_id: modelId,
    voice_settings: {
      stability: 0.75,          // Was 0.70 — slightly more stable, reduces amplitude spikes on "!"
      similarity_boost: 0.75,
      style: 0.0,               // Was 0.2 — neutral on flash model; expressivity on flash amplifies clipping on "!"
      use_speaker_boost: false  // Was true — speaker boost artificially amplifies peaks, causing saturation on exclamations
    },
    optimize_streaming_latency: latencyOpt,
  };

  if (previousText) {
    body.previous_text = previousText;
  }

  const response = await elevenLabsFetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  const chunks: Buffer[] = [];
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
  }

  const audioBuffer = Buffer.concat(chunks);
  if (audioBuffer.byteLength === 0) {
    throw new Error('Received empty audio from ElevenLabs');
  }

  // Cache the result
  if (ttsCache.size >= TTS_CACHE_MAX_SIZE) {
    const firstKey = ttsCache.keys().next().value as string;
    if (firstKey) ttsCache.delete(firstKey);
  }
  ttsCache.set(textHash, audioBuffer);
  console.log('[TTS] Audio generated and cached:', audioBuffer.byteLength, 'bytes');

  return audioBuffer;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: 'org-z0AK8zYLTeapGaiDZFQ5co2N',
});

const ASSISTANT_ID = 'asst_P9b5PxMd1k9HjBgbyXI1Cvm9';

// Vérifier que l'assistant existe au démarrage
async function validateAssistant() {
  try {
    const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);
    console.log('[Server] ✅ Assistant validated:', assistant.name);
  } catch (error) {
    console.error('[Server] ❌ CRITICAL: Assistant not found or invalid!', error);
  }
}

// Appeler au démarrage
validateAssistant();

const TARGET_CLUES = [
  { keyword: "Déchets plastiques", variants: ["déchets plastiques", "dechets plastiques", "plastique", "pollution plastique", "déchets", "ordures plastiques"] },
  { keyword: "ADN", variants: ["adn", "acide désoxyribonucléique", "génétique", "double hélice", "hélice adn"] },
  { keyword: "Traité plastique", variants: ["traité plastique", "traite plastique", "traité", "accord plastique", "convention plastique"] },
  { keyword: "Végétation", variants: ["végétation", "végétaux", "algues", "algue", "végétation marine", "plantes marines", "végétaux marins", "plantes", "verdure"] },
  { keyword: "Homme", variants: ["homme", "penseur", "rodin", "sculpture homme", "figure masculine", "personnage masculin"] },
  { keyword: "Femme", variants: ["femme", "figure féminine", "personnage féminin", "sculpture femme", "mère", "terre-mère"] }
];

function detectClues(text: string, alreadyFound: string[]): string[] {
  const textLower = text.toLowerCase();
  const foundClues: string[] = [];

  for (const clue of TARGET_CLUES) {
    // Skip if already found
    if (alreadyFound.includes(clue.keyword)) continue;

    // Check all variants for this clue
    for (const variant of clue.variants) {
      if (textLower.includes(variant)) {
        foundClues.push(clue.keyword);
        break; // Move to next clue (avoid duplicates)
      }
    }
  }

  return foundClues;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Rate-limit global API
  app.use('/api', generalLimiter);

  // Endpoint de diagnostic pour vérifier les services AI
  app.get('/api/health/ai', async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const results: Record<string, { status: string; message: string }> = {
      openai: { status: 'unknown', message: '' },
      assistant: { status: 'unknown', message: '' },
      elevenlabs: { status: 'unknown', message: '' },
    };

    // Test OpenAI
    try {
      const models = await openai.models.list();
      results.openai = { status: 'ok', message: `${models.data.length} models available` };
    } catch (error) {
      results.openai = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Test Assistant
    try {
      const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);
      results.assistant = { status: 'ok', message: `Assistant: ${assistant.name}` };
    } catch (error) {
      results.assistant = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Test ElevenLabs
    try {
      const response = await elevenLabsFetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '' }
      });
      if (response.ok) {
        const data = await response.json() as { subscription?: { character_count?: number } };
        results.elevenlabs = { status: 'ok', message: `Characters: ${data.subscription?.character_count || 'N/A'}` };
      } else {
        results.elevenlabs = { status: 'error', message: `HTTP ${response.status}` };
      }
    } catch (error) {
      results.elevenlabs = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }

    res.json(results);
  });

  // Endpoint de diagnostic pour Google Sheets
  app.get('/api/health/sheets', async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const result: { status: string; message: string; details?: any } = {
      status: 'unknown',
      message: '',
    };

    try {
      // Vérifier les variables d'environnement
      const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
      const hasReplIdentity = !!process.env.REPL_IDENTITY;
      const hasWebReplRenewal = !!process.env.WEB_REPL_RENEWAL;

      result.details = {
        REPLIT_CONNECTORS_HOSTNAME: hostname ? 'SET' : 'NOT SET',
        REPL_IDENTITY: hasReplIdentity ? 'SET' : 'NOT SET',
        WEB_REPL_RENEWAL: hasWebReplRenewal ? 'SET' : 'NOT SET',
      };

      if (!hostname) {
        result.status = 'error';
        result.message = 'REPLIT_CONNECTORS_HOSTNAME not set - Not running on Replit?';
        return res.json(result);
      }

      if (!hasReplIdentity && !hasWebReplRenewal) {
        result.status = 'error';
        result.message = 'No Replit token available (REPL_IDENTITY or WEB_REPL_RENEWAL)';
        return res.json(result);
      }

      // Tester la connexion au connecteur
      const xReplitToken = hasReplIdentity
        ? 'repl ' + process.env.REPL_IDENTITY
        : 'depl ' + process.env.WEB_REPL_RENEWAL;

      const url = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet';
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      });

      if (!response.ok) {
        result.status = 'error';
        result.message = `Connector API error: ${response.status} ${response.statusText}`;
        return res.json(result);
      }

      const data = await response.json();
      const connector = data.items?.[0];

      if (!connector) {
        result.status = 'error';
        result.message = 'No Google Sheet connector found. Please add Google Sheets connection in Replit panel.';
        result.details.connectorCount = data.items?.length || 0;
        return res.json(result);
      }

      result.details.connectorName = connector.connector_name;
      result.details.hasAccessToken = !!(connector.settings?.access_token || connector.settings?.oauth?.credentials?.access_token);
      result.details.settingsKeys = Object.keys(connector.settings || {});
      result.details.spreadsheetId = connector.settings?.spreadsheet_id || 'NOT SET (will use hardcoded)';

      if (!result.details.hasAccessToken) {
        result.status = 'error';
        result.message = 'Google Sheet connector found but no access token';
        return res.json(result);
      }

      result.status = 'ok';
      result.message = 'Google Sheets connection is configured correctly';

    } catch (error) {
      result.status = 'error';
      result.message = error instanceof Error ? error.message : 'Unknown error';
    }

    res.json(result);
  });

  // Endpoint de TEST complet pour Google Sheets (essaie vraiment d'écrire)
  app.get('/api/health/sheets/test', async (req, res) => {
    if (!requireAdmin(req, res)) return;

    try {
      const { testGoogleSheetsConnection } = await import('./google-sheets-sync');
      const result = await testGoogleSheetsConnection();
      res.json(result);
    } catch (error) {
      res.json({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Verify that the request carries the correct access token for the given session.
   * Returns the session on success, or sends a 401/403/404 response and returns null.
   */
  async function verifySessionToken(
    sessionId: string,
    req: import('express').Request,
    res: import('express').Response
  ): Promise<import('@shared/schema').TutorialSession | null> {
    const session = await storage.getSession(sessionId);
    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return null;
    }
    const provided =
      (req.headers['x-session-token'] as string | undefined) ||
      (req.body?.accessToken as string | undefined);
    if (!provided || provided !== session.accessToken) {
      res.status(403).json({ error: 'Forbidden' });
      return null;
    }
    return session;
  }

  /**
   * Remove `accessToken` from a session object before sending it to the client.
   * The token is only ever sent once: in the POST /api/sessions creation response.
   */
  function sanitizeSession<T extends { accessToken?: string | null }>(session: T): Omit<T, 'accessToken'> {
    const { accessToken: _removed, ...rest } = session;
    return rest as Omit<T, 'accessToken'>;
  }

  app.post('/api/sessions', async (req, res) => {
    try {
      const data = insertTutorialSessionSchema.parse(req.body);
      const accessToken = crypto.randomBytes(16).toString('hex');
      const sessionData: InsertTutorialSessionWithToken = { ...data, accessToken };
      const session = await storage.createSession(sessionData);

      // Pre-generate welcome message TTS in background so TutorialScreen can play it immediately
      // without waiting for an on-demand ElevenLabs call after navigation.
      const welcomeText = `Bienvenue ${data.userName} dans cette courte expérience. Il faut que tu trouves 6 indices dans cette image, en me racontant ce que tu vois, ce qui attire ton attention, en relation avec la problématique de l'impact du plastique sur la santé. Tu as maximum 8 échanges pour y parvenir !`;
      const welcomeAudioToken = crypto.randomUUID();
      ttsRequestStore.set(welcomeAudioToken, {
        promise: generateTtsAudio(welcomeText, undefined, 'quality'),
        createdAt: Date.now(),
      });
      console.log('[Session Create] Pre-generating welcome TTS in background, token:', welcomeAudioToken.substring(0, 8));

      // Return accessToken once so the client can persist it; also include welcomeAudioToken
      res.json({ ...session, welcomeAudioToken });
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(400).json({ error: 'Invalid session data' });
    }
  });

  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const session = await verifySessionToken(req.params.id, req, res);
      if (!session) return;
      res.json(sanitizeSession(session));
    } catch (error) {
      console.error('Error fetching session:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.patch('/api/sessions/:id', async (req, res) => {
    try {
      const verified = await verifySessionToken(req.params.id, req, res);
      if (!verified) return;

      const updateSchema = z.object({
        foundClues: z.array(z.string()).optional(),
        score: z.number().int().min(0).max(4).optional(),
        audioMode: z.enum(['voice', 'text']).optional(),
        completed: z.number().int().min(0).max(1).optional(),
        threadId: z.string().optional().nullable(),
      });

      const updates = updateSchema.parse(req.body);
      const session = await storage.updateSession(req.params.id, updates);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(sanitizeSession(session));
    } catch (error) {
      console.error('Error updating session:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid update data', details: error.errors });
      }
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Feedback survey endpoints
  app.post('/api/feedback', async (req, res) => {
    try {
      const data = insertFeedbackSurveySchema.parse(req.body);
      const feedback = await storage.createFeedback(data);
      res.json(feedback);
    } catch (error) {
      console.error('Error creating feedback:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid feedback data', details: error.errors });
      }
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/feedback/:sessionId', async (req, res) => {
    try {
      const verified = await verifySessionToken(req.params.sessionId, req, res);
      if (!verified) return;

      const feedback = await storage.getFeedbackBySession(req.params.sessionId);
      if (!feedback) {
        return res.status(404).json({ error: 'Feedback not found' });
      }
      res.json(feedback);
    } catch (error) {
      console.error('Error fetching feedback:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.patch('/api/sessions/:id/feedback', async (req, res) => {
    try {
      const sessionId = req.params.id;

      const verified = await verifySessionToken(sessionId, req, res);
      if (!verified) return;

      const feedbackSchema = z.object({
        scenarioComprehension: z.number().int().min(1).max(6).optional(),
        scenarioObjectives: z.number().int().min(1).max(6).optional(),
        scenarioClueLink: z.number().int().min(1).max(6).optional(),
        gameplayExplanation: z.number().int().min(1).max(6).optional(),
        gameplaySimplicity: z.number().int().min(1).max(6).optional(),
        gameplayBotResponses: z.number().int().min(1).max(6).optional(),
        gameplayVoiceChat: z.number().int().min(1).max(6).optional(),
        feelingOriginality: z.number().int().min(1).max(6).optional(),
        feelingPleasant: z.number().int().min(1).max(6).optional(),
        feelingInteresting: z.number().int().min(1).max(6).optional(),
        motivationContinue: z.number().int().min(1).max(6).optional(),
        motivationGameplay: z.number().int().min(1).max(6).optional(),
        motivationEcology: z.number().int().min(1).max(6).optional(),
        interfaceVisualBeauty: z.number().int().min(1).max(6).optional(),
        interfaceVisualClarity: z.number().int().min(1).max(6).optional(),
        interfaceVoiceChat: z.number().int().min(1).max(6).optional(),
        overallRating: z.number().int().min(1).max(6).optional(),
        improvements: z.string().max(2000).optional(),
        wantsUpdates: z.boolean().optional(),
        updateEmail: z.string().email().max(254).optional().nullable(),
        wouldRecommend: z.boolean().optional(),
        wantsInSchool: z.boolean().optional(),
        feedbackCompletedAt: z.string().optional(),
      });

      const partialFeedback = feedbackSchema.parse(req.body);

      console.log('[API] Partial feedback update for session:', sessionId, '- fields:', Object.keys(partialFeedback).join(', '));

      const session = await storage.updatePartialFeedback(sessionId, partialFeedback);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json({ success: true, session: sanitizeSession(session) });
    } catch (error) {
      console.error('Error updating partial feedback:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid feedback data', details: error.errors });
      }
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/speech-to-text', sttLimiter, upload.single('audio'), async (req: Express.Request, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      const audioBuffer = req.file.buffer;
      const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'fr',
      });

      res.json({ text: transcription.text });
    } catch (error) {
      console.error('Error transcribing audio:', error);
      res.status(500).json({ error: 'Transcription failed' });
    }
  });

  // PHASE 3 OPTIMIZATION: GET endpoint for pre-generated TTS audio
  // The server starts TTS generation as soon as the LLM finishes (before client requests it).
  // Client sets audio.src to this URL for native streaming playback.
  app.get('/api/tts/play/:token', async (req, res) => {
    const { token } = req.params;
    const ttsRequest = ttsRequestStore.get(token);

    if (!ttsRequest) {
      return res.status(404).json({ error: 'TTS token not found or expired' });
    }

    try {
      const audioBuffer = await ttsRequest.promise;

      // Clean up the token after use
      ttsRequestStore.delete(token);

      res.set('Content-Type', 'audio/mpeg');
      res.set('Content-Length', String(audioBuffer.byteLength));
      res.set('Accept-Ranges', 'bytes');
      res.set('Cache-Control', 'no-cache');
      res.send(audioBuffer);
    } catch (error) {
      console.error('[TTS Play] Error:', error);
      ttsRequestStore.delete(token);
      res.status(500).json({
        error: 'TTS generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // PHASE 2 OPTIMIZATION: Streaming TTS endpoint
  // Uses ElevenLabs streaming to send audio chunks as they're generated
  app.post('/api/text-to-speech/stream', ttsLimiter, async (req, res) => {
    try {
      console.log('[TTS Stream API] Request received:', { textLength: req.body.text?.length });
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }

      // PHASE 1: Still check cache first for instant response
      const textHash = crypto.createHash('md5').update(text).digest('hex');
      if (ttsCache.has(textHash)) {
        console.log('[TTS Stream API] Cache HIT - streaming cached audio:', textHash.substring(0, 8));
        const cachedBuffer = ttsCache.get(textHash)!;
        res.set('Content-Type', 'audio/mpeg');
        res.set('X-Cache', 'HIT');
        res.send(cachedBuffer);
        return;
      }

      console.log('[TTS Stream API] Cache MISS - streaming from ElevenLabs:', textHash.substring(0, 8));

      const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
      const VOICE_ID = 'R8IjtpeRZsjoJfq1wwj3'; // Peter - nouveau workspace

      if (!ELEVENLABS_API_KEY) {
        console.error('[TTS Stream API] ElevenLabs API key not configured');
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      console.log('[TTS Stream API] Calling ElevenLabs streaming API...');

      // Call ElevenLabs with optimized settings for French diction quality
      // Full text is sent in a single call to maintain consistent voice register
      const response = await elevenLabsFetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2', // Best quality for French diction
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: false  // Disabled — causes saturation/clipping on exclamations
          },
          optimize_streaming_latency: 3,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TTS Stream API] ElevenLabs API error:', response.status, errorText);
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      // Set streaming headers
      res.set('Content-Type', 'audio/mpeg');
      res.set('Transfer-Encoding', 'chunked');
      res.set('X-Cache', 'MISS');

      // Collect chunks for caching while streaming to client
      const chunks: Buffer[] = [];

      console.log('[TTS Stream API] Streaming audio chunks to client...');

      // Stream response body to client
      if (response.body) {
        const reader = response.body.getReader();
        let chunkCount = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunkCount++;
            const chunk = Buffer.from(value);
            chunks.push(chunk);

            // Stream chunk to client immediately
            res.write(chunk);

            if (chunkCount === 1) {
              console.log('[TTS Stream API] First audio chunk sent (', chunk.length, 'bytes)');
            }
          }

          console.log('[TTS Stream API] Stream complete -', chunkCount, 'chunks sent');
        } catch (streamError) {
          console.error('[TTS Stream API] Error during streaming:', streamError);
          throw streamError;
        }
      }

      // End the response
      res.end();

      // Cache the complete audio
      const completeAudio = Buffer.concat(chunks);
      if (completeAudio.byteLength > 0) {
        // Implement LRU-style eviction if cache is full
        if (ttsCache.size >= TTS_CACHE_MAX_SIZE) {
          const firstKey = ttsCache.keys().next().value as string;
          if (firstKey) ttsCache.delete(firstKey);
          console.log('[TTS Stream API] Cache full - evicted oldest entry');
        }
        ttsCache.set(textHash, completeAudio);
        console.log('[TTS Stream API] Audio cached. Size:', completeAudio.byteLength, 'bytes, Cache entries:', ttsCache.size);
      }

    } catch (error) {
      console.error('[TTS Stream API] Error:', error);
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Speech generation failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      } else {
        // Headers already sent, just end the response
        res.end();
      }
    }
  });

  app.post('/api/text-to-speech', ttsLimiter, async (req, res) => {
    try {
      console.log('[TTS API] Request received:', { textLength: req.body.text?.length });
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }

      // PHASE 1 OPTIMIZATION: Check cache first
      const textHash = crypto.createHash('md5').update(text).digest('hex');
      if (ttsCache.has(textHash)) {
        console.log('[TTS API] Cache HIT - returning cached audio for hash:', textHash.substring(0, 8));
        const cachedBuffer = ttsCache.get(textHash)!;
        res.set('Content-Type', 'audio/mpeg');
        res.set('X-Cache', 'HIT'); // Debug header to confirm cache usage
        return res.send(cachedBuffer);
      }

      console.log('[TTS API] Cache MISS - generating new audio for hash:', textHash.substring(0, 8));

      const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
      const VOICE_ID = 'R8IjtpeRZsjoJfq1wwj3'; // Peter - nouveau workspace

      console.log('[TTS API] Using voice:', VOICE_ID);

      if (!ELEVENLABS_API_KEY) {
        console.error('[TTS API] ElevenLabs API key not configured');
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      console.log('[TTS API] Calling ElevenLabs API...');
      const response = await elevenLabsFetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2', // Best quality for French diction
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: false  // Disabled — causes saturation/clipping on exclamations
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TTS API] ElevenLabs API error:', response.status, errorText);
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const audioBuffer = await response.arrayBuffer();

      // MOBILE FIX: Vérifier que l'audio n'est pas vide
      if (audioBuffer.byteLength === 0) {
        console.error('[TTS API] Received empty audio from ElevenLabs');
        throw new Error('Received empty audio from ElevenLabs');
      }

      const audioBufferNode = Buffer.from(audioBuffer);

      // PHASE 1 OPTIMIZATION: Store in cache
      // Implement LRU-style eviction if cache is full
      if (ttsCache.size >= TTS_CACHE_MAX_SIZE) {
        // Remove oldest entry (first key in Map)
        const firstKey = ttsCache.keys().next().value as string;
        if (firstKey) ttsCache.delete(firstKey);
        console.log('[TTS API] Cache full - evicted oldest entry');
      }
      ttsCache.set(textHash, audioBufferNode);
      console.log('[TTS API] Audio cached successfully. Cache size:', ttsCache.size);

      console.log('[TTS API] Audio generated successfully, size:', audioBuffer.byteLength, 'bytes');
      res.set('Content-Type', 'audio/mpeg');
      res.set('X-Cache', 'MISS'); // Debug header to confirm cache usage
      res.send(audioBufferNode);
    } catch (error) {
      console.error('[TTS API] Error generating speech:', error);
      res.status(500).json({
        error: 'Speech generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // PHASE 2 OPTIMIZATION: Streaming chat endpoint with sentence-by-sentence delivery
  // This allows TTS to start generating audio while LLM is still responding
  app.post('/api/chat/stream', async (req, res) => {
    try {
      console.log('[Chat Stream API] Request received:', {
        sessionId: req.body.sessionId,
        messageLength: req.body.userMessage?.length,
        exchangeCount: req.body.exchangeCount,
        userName: req.body.userName
      });
      const { sessionId, userMessage, exchangeCount, userName } = req.body;

      if (!sessionId || !userMessage) {
        return res.status(400).json({ error: 'Missing sessionId or userMessage' });
      }

      if (typeof userMessage !== 'string' || userMessage.length > 2000) {
        return res.status(400).json({ error: 'userMessage must be a string of at most 2000 characters' });
      }

      const session = await verifySessionToken(sessionId, req, res);
      if (!session) return;

      console.log('[Chat Stream API] Session found:', { sessionId, foundClues: session.foundClues });

      const detectedClues = detectClues(userMessage, session.foundClues);
      console.log('[Chat Stream API] Clue detection:', { detectedClues, messageLength: userMessage.length });

      await storage.addMessage({
        sessionId,
        role: 'user',
        content: userMessage,
        detectedClue: detectedClues.length > 0 ? detectedClues.join(', ') : undefined,
      });

      // Set up Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      console.log('[Chat Stream API] Using OpenAI Assistant:', ASSISTANT_ID);

      // Build exchange-specific instructions for final exchanges
      let exchangeInstructions = '';
      if (exchangeCount === 7) {
        // 7th exchange: Peter must insist there's one more chance
        exchangeInstructions = `\n\n[INSTRUCTION IMPORTANTE: C'est l'avant-dernier échange (7/8). Tu dois absolument mentionner qu'il reste encore UN échange possible pour trouver les derniers indices. N'ouvre pas la conversation, mais encourage l'utilisateur à faire un dernier effort. Ne dis pas au revoir maintenant.]`;
      } else if (exchangeCount >= 8) {
        // 8th exchange: Peter must close the conversation with personalized goodbye
        const userNameToUse = userName || 'mon ami';
        exchangeInstructions = `\n\n[INSTRUCTION IMPORTANTE: C'est le DERNIER échange (8/8). Tu dois terminer la conversation de manière chaleureuse. Salue l'utilisateur en utilisant son prénom "${userNameToUse}". Ensuite, invite-le à cliquer sur le bouton "Continuer" pour poursuivre l'expérience. Fais un bref récapitulatif des indices trouvés et remercie-le pour cette conversation.]`;
      }

      // Reuse or create thread
      let threadId = session.threadId;

      if (!threadId) {
        console.log('[Chat Stream API] Creating new thread for session...');
        const thread = await openai.beta.threads.create();
        threadId = thread.id;

        await storage.updateSession(sessionId, { threadId });
        console.log('[Chat Stream API] Thread created and saved:', threadId);

        const contextPrompt = `Indices déjà trouvés: ${session.foundClues.join(', ') || 'aucun'}`;
        await openai.beta.threads.messages.create(threadId, {
          role: 'user',
          content: `${contextPrompt}${exchangeInstructions}\n\n${userMessage}`
        });
      } else {
        console.log('[Chat Stream API] Reusing existing thread:', threadId);
        await openai.beta.threads.messages.create(threadId, {
          role: 'user',
          content: `${userMessage}${exchangeInstructions}`
        });
      }

      // Stream the assistant response
      console.log('[Chat Stream API] Running assistant with streaming...', { assistantId: ASSISTANT_ID, threadId });

      const stream = await openai.beta.threads.runs.stream(threadId, {
        assistant_id: ASSISTANT_ID,
      });
      console.log('[Chat Stream API] Stream created successfully, starting to process events...');

      // Timeout de sécurité pour détecter les streams bloqués
      let streamTimeout: NodeJS.Timeout | null = setTimeout(() => {
        console.error('[Chat Stream API] ⚠️ TIMEOUT: Stream blocked after 30 seconds');
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: 'Response timeout - assistant did not respond in time'
          })}\n\n`);
          res.end();
        }
      }, 30000);

      let fullResponse = "";
      let currentSentence = "";
      let sentenceCount = 0;
      const sentenceTtsPromises: Promise<void>[] = [];

      // ── 2-PHASE TTS STRATEGY ───────────────────────────────────────────────
      // Phase 1 (FAST): first group of sentences sent to ElevenLabs immediately
      //   using eleven_flash_v2_5 + optimize_streaming_latency:4 → first audio ~2-3s
      // Phase 2 (QUALITY): remaining sentences sent as ONE single ElevenLabs call
      //   using eleven_multilingual_v2 + previous_text=phase1 → natural prosody for 70-80% of response
      //
      // Short sentences (< MIN_SENTENCE_CHARS) are grouped with the next one to avoid
      // unnatural micro-segments. Phase 1 fires as soon as the combined buffer reaches
      // MIN_SENTENCE_CHARS, or at stream completion if nothing was long enough.
      // ─────────────────────────────────────────────────────────────────────────
      const MIN_SENTENCE_CHARS = 55;
      const MAX_PHASE1_SENTENCES = 2;  // Prevent Phase 1 from grouping too many short sentences
      // Phase 2 early dispatch thresholds: fire Phase 2a mid-stream to avoid silence gaps
      const PHASE2_EARLY_CHARS = 120;      // dispatch Phase 2a when accumulated text reaches this
      const PHASE2_EARLY_SENTENCES = 3;    // OR when accumulated sentence count reaches this
      let phase1Done = false;
      let phase1Text = "";                        // text sent in Phase 1 (used as previous_text for Phase 2)
      let phase1ShortBuffer: Array<{ text: string; index: number }> = []; // short sentences accumulating before Phase 1 fires
      let phase2Buffer: string[] = [];            // sentences queued for Phase 2a (early dispatch)
      let phase2StartIndex = -1;                  // SSE index of the first Phase 2 sentence
      let phase2Dispatched = false;               // true when any Phase 2 TTS call has been dispatched
      let phase2aDispatched = false;              // true when Phase 2a early TTS has fired
      let phase2aText = "";                       // text sent in Phase 2a (chained as previous_text for Phase 2b)
      let phase2bBuffer: string[] = [];           // sentences accumulating after Phase 2a fires
      let phase2bStartIndex = -1;                 // SSE index of first Phase 2b sentence

      const dispatchPhase1Tts = (sentences: Array<{ text: string; index: number }>) => {
        const combined = sentences.map(s => s.text).join(' ');
        const startIndex = sentences[0].index;
        const count = sentences.length;
        phase1Text = combined;
        phase1Done = true;

        console.log(`[Chat Stream API] Phase 1 TTS: ${count} sentence(s) → "${combined.substring(0, 60)}..." (fast model)`);

        const ttsPromise = generateTtsAudio(combined, undefined, 'fast')
          .then((audioBuffer) => {
            const audioToken = crypto.randomUUID();
            ttsRequestStore.set(audioToken, { promise: Promise.resolve(audioBuffer), createdAt: Date.now() });
            console.log(`[Chat Stream API] Phase 1 TTS ready (index=${startIndex}, count=${count}), token:`, audioToken);
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({
                type: 'sentence_audio',
                index: startIndex,
                audioToken,
                count,  // client must skip indices startIndex+1 … startIndex+count-1
                phase: 'phase1',
              })}\n\n`);
            }
          })
          .catch((ttsErr) => {
            console.error('[Chat Stream API] Phase 1 TTS failed:', ttsErr);
            if (!res.writableEnded) {
              for (const s of sentences) {
                res.write(`data: ${JSON.stringify({ type: 'sentence_audio_error', index: s.index })}\n\n`);
              }
            }
          });

        sentenceTtsPromises.push(ttsPromise);
      };

      // Phase 2a: early dispatch mid-stream when buffer threshold is reached.
      // Fires with previous_text=phase1Text so prosody continues naturally from Phase 1.
      const dispatchPhase2aTts = (sentences: string[], startIndex: number) => {
        const combined = sentences.join(' ');
        const count = sentences.length;
        phase2aDispatched = true;
        phase2aText = combined;
        phase2Dispatched = true;

        console.log(`[Chat Stream API] Phase 2a TTS (EARLY): ${count} sentence(s) → "${combined.substring(0, 60)}..." (quality model)`);

        const ttsPromise = generateTtsAudio(combined, phase1Text || undefined, 'quality')
          .then((audioBuffer) => {
            const audioToken = crypto.randomUUID();
            ttsRequestStore.set(audioToken, { promise: Promise.resolve(audioBuffer), createdAt: Date.now() });
            console.log(`[Chat Stream API] Phase 2a TTS ready (index=${startIndex}, count=${count}), token:`, audioToken);
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({
                type: 'sentence_audio',
                index: startIndex,
                audioToken,
                count,
                phase: 'phase2',
              })}\n\n`);
            }
          })
          .catch((ttsErr) => {
            console.error('[Chat Stream API] Phase 2a TTS failed:', ttsErr);
            if (!res.writableEnded) {
              for (let i = startIndex; i < startIndex + count; i++) {
                res.write(`data: ${JSON.stringify({ type: 'sentence_audio_error', index: i })}\n\n`);
              }
            }
          });

        sentenceTtsPromises.push(ttsPromise);
      };

      // Phase 2b: sentences that arrived after Phase 2a was dispatched.
      // Chains previous_text = phase1Text + phase2aText for full prosody continuity.
      const dispatchPhase2bTts = (sentences: string[], startIndex: number) => {
        const combined = sentences.join(' ');
        const count = sentences.length;
        const prevText = [phase1Text, phase2aText].filter(Boolean).join(' ') || undefined;

        console.log(`[Chat Stream API] Phase 2b TTS: ${count} sentence(s) → "${combined.substring(0, 60)}..." (quality model)`);

        const ttsPromise = generateTtsAudio(combined, prevText, 'quality')
          .then((audioBuffer) => {
            const audioToken = crypto.randomUUID();
            ttsRequestStore.set(audioToken, { promise: Promise.resolve(audioBuffer), createdAt: Date.now() });
            console.log(`[Chat Stream API] Phase 2b TTS ready (index=${startIndex}, count=${count}), token:`, audioToken);
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({
                type: 'sentence_audio',
                index: startIndex,
                audioToken,
                count,
                phase: 'phase2',
              })}\n\n`);
            }
          })
          .catch((ttsErr) => {
            console.error('[Chat Stream API] Phase 2b TTS failed:', ttsErr);
            if (!res.writableEnded) {
              for (let i = startIndex; i < startIndex + count; i++) {
                res.write(`data: ${JSON.stringify({ type: 'sentence_audio_error', index: i })}\n\n`);
              }
            }
          });

        sentenceTtsPromises.push(ttsPromise);
      };

      const sendSentence = (sentence: string) => {
        const trimmed = sentence.trim();
        if (trimmed.length === 0) return;

        sentenceCount++;
        const index = sentenceCount;
        console.log('[Chat Stream API] Sentence #' + index + ' (' + trimmed.length + ' chars):', trimmed.substring(0, 50) + (trimmed.length > 50 ? '...' : ''));

        // Always emit the text SSE event immediately (client display + UI)
        res.write(`data: ${JSON.stringify({ type: 'sentence', text: trimmed, index })}\n\n`);

        if (!phase1Done) {
          // Buffer short sentences; fire Phase 1 as soon as combined length ≥ MIN_SENTENCE_CHARS
          // OR the buffer reaches MAX_PHASE1_SENTENCES (to bound first-audio latency)
          phase1ShortBuffer.push({ text: trimmed, index });
          const combined = phase1ShortBuffer.map(s => s.text).join(' ');

          if (combined.length >= MIN_SENTENCE_CHARS || phase1ShortBuffer.length >= MAX_PHASE1_SENTENCES) {
            dispatchPhase1Tts(phase1ShortBuffer);
            phase1ShortBuffer = [];
          }
          // If still too short and under cap: keep buffering — will be flushed on thread.run.completed
        } else {
          // Phase 2: rolling early dispatch — fire Phase 2a when threshold reached,
          // then accumulate Phase 2b tail for dispatch at thread.run.completed.
          if (!phase2aDispatched) {
            if (phase2Buffer.length === 0) {
              phase2StartIndex = index;
            }
            phase2Buffer.push(trimmed);
            const combined2a = phase2Buffer.join(' ');
            if (combined2a.length >= PHASE2_EARLY_CHARS || phase2Buffer.length >= PHASE2_EARLY_SENTENCES) {
              dispatchPhase2aTts(phase2Buffer, phase2StartIndex);
              phase2Buffer = [];
            }
          } else {
            // Phase 2a already fired — accumulate remainder for Phase 2b
            if (phase2bBuffer.length === 0) {
              phase2bStartIndex = index;
            }
            phase2bBuffer.push(trimmed);
          }
        }
      };

      for await (const event of stream) {
        console.log('[Chat Stream API] Event received:', event.event);

        if (event.event === 'thread.message.delta') {
          const delta = event.data.delta;
          if (delta.content && delta.content[0]?.type === 'text') {
            const textDelta = delta.content[0].text?.value || '';
            fullResponse += textDelta;
            currentSentence += textDelta;

            let match;
            while ((match = currentSentence.match(/^([\s\S]*?[.!?])(\s+|$)/)) !== null) {
              sendSentence(match[1]);
              currentSentence = currentSentence.slice(match[0].length);
            }
          }
        }

        if (event.event === 'thread.run.completed') {
          console.log('[Chat Stream API] ✅ Run completed:', { responseLength: fullResponse.length });

          if (streamTimeout) {
            clearTimeout(streamTimeout);
            streamTimeout = null;
          }

          // Flush any remaining text as a final sentence
          if (currentSentence.trim().length > 0) {
            sendSentence(currentSentence);
            currentSentence = "";
          }

          // Flush Phase 1 buffer if it never reached the threshold (entire response was short)
          if (!phase1Done && phase1ShortBuffer.length > 0) {
            dispatchPhase1Tts(phase1ShortBuffer);
            phase1ShortBuffer = [];
          }

          // Flush Phase 2a buffer if early threshold was never reached during streaming
          if (!phase2aDispatched && phase2Buffer.length > 0) {
            dispatchPhase2aTts(phase2Buffer, phase2StartIndex);
            phase2Buffer = [];
          }

          // Dispatch Phase 2b for any sentences accumulated after Phase 2a fired
          if (phase2bBuffer.length > 0) {
            dispatchPhase2bTts(phase2bBuffer, phase2bStartIndex);
          }
        }

        if (event.event === 'thread.run.failed' ||
            event.event === 'thread.run.cancelled' ||
            event.event === 'thread.run.expired') {
          console.error('[Chat Stream API] ❌ Assistant run failed:', event.event);

          if (streamTimeout) {
            clearTimeout(streamTimeout);
            streamTimeout = null;
          }

          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: `Assistant run failed: ${event.event}`
          })}\n\n`);
          res.end();
          return;
        }
      }

      // Annuler le timeout à la fin du stream (au cas où)
      if (streamTimeout) {
        clearTimeout(streamTimeout);
        streamTimeout = null;
      }

      // Fallback if response is empty
      if (!fullResponse) {
        fullResponse = "Je n'ai pas compris, peux-tu reformuler?";
        res.write(`data: ${JSON.stringify({
          type: 'sentence',
          text: fullResponse,
          index: 1
        })}\n\n`);
      }

      // Save full response to storage
      await storage.addMessage({
        sessionId,
        role: 'assistant',
        content: fullResponse,
      });

      // Detect clues from Peter's response too (not just from the user's message).
      // Peter often explicitly names a clue when validating it — e.g. "Bravo, tu as trouvé le Traité plastique !"
      // The earlier detectClues(userMessage) only caught words the USER used; this catches what PETER validates.
      const detectedFromResponse = detectClues(fullResponse, [...session.foundClues, ...detectedClues]);
      const allDetectedClues = [...detectedClues, ...detectedFromResponse];
      if (detectedFromResponse.length > 0) {
        console.log('[Chat Stream API] Additional clues detected from Peter\'s response:', detectedFromResponse);
      }

      // Update session with all detected clues (from user message + from Peter's response)
      if (allDetectedClues.length > 0) {
        const updatedClues = [...session.foundClues, ...allDetectedClues];
        await storage.updateSession(sessionId, {
          foundClues: updatedClues,
          score: updatedClues.length,
        });
      }

      // Incrémenter le compteur de messages pour la synchronisation Google Sheets
      await storage.incrementMessageCount(sessionId);
      console.log('[Chat Stream API] Message count incremented for session:', sessionId);

      res.write(`data: ${JSON.stringify({
        type: 'complete',
        fullResponse,
        foundClues: allDetectedClues.length > 0 ? [...session.foundClues, ...allDetectedClues] : session.foundClues,
        detectedClue: allDetectedClues.length > 0 ? allDetectedClues[0] : null,
        phase2Dispatched,
      })}\n\n`);

      if (sentenceTtsPromises.length > 0) {
        console.log('[Chat Stream API] Waiting for', sentenceTtsPromises.length, 'remaining TTS promises...');
        await Promise.allSettled(sentenceTtsPromises);
        console.log('[Chat Stream API] All sentence TTS promises settled');
      }

      res.end();
      console.log('[Chat Stream API] Stream ended successfully');
    } catch (error) {
      console.error('[Chat Stream API] Error:', error);

      const isProd = process.env.NODE_ENV === 'production';
      const errorMessage = isProd
        ? 'Une erreur est survenue lors de la conversation'
        : (error instanceof Error ? error.message : 'Unknown error');
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: errorMessage
      })}\n\n`);
      res.end();
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      console.log('[Chat API] Request received:', { sessionId: req.body.sessionId, messageLength: req.body.userMessage?.length });
      const { sessionId, userMessage } = req.body;

      if (!sessionId || !userMessage) {
        return res.status(400).json({ error: 'Missing sessionId or userMessage' });
      }

      if (typeof userMessage !== 'string' || userMessage.length > 2000) {
        return res.status(400).json({ error: 'userMessage must be a string of at most 2000 characters' });
      }

      const session = await verifySessionToken(sessionId, req, res);
      if (!session) return;

      console.log('[Chat API] Session found:', { sessionId, foundClues: session.foundClues });

      const detectedClues = detectClues(userMessage, session.foundClues);
      console.log('[Chat API] Clue detection:', { detectedClues, messageLength: userMessage.length });

      await storage.addMessage({
        sessionId,
        role: 'user',
        content: userMessage,
        detectedClue: detectedClues.length > 0 ? detectedClues.join(', ') : undefined,
      });

      // Use OpenAI Assistant API with the specified assistant ID
      const ASSISTANT_ID = 'asst_P9b5PxMd1k9HjBgbyXI1Cvm9';
      console.log('[Chat API] Using OpenAI Assistant:', ASSISTANT_ID);

      // Réutiliser le thread existant ou en créer un nouveau
      let threadId = session.threadId;

      if (!threadId) {
        console.log('[Chat API] Creating new thread for session...');
        const thread = await openai.beta.threads.create();
        threadId = thread.id;

        // Sauvegarder le threadId dans la session
        await storage.updateSession(sessionId, { threadId });
        console.log('[Chat API] Thread created and saved:', threadId);

        // Premier message : ajouter le contexte initial
        const contextPrompt = `Indices déjà trouvés: ${session.foundClues.join(', ') || 'aucun'}`;
        await openai.beta.threads.messages.create(threadId, {
          role: 'user',
          content: `${contextPrompt}\n\n${userMessage}`
        });
      } else {
        console.log('[Chat API] Reusing existing thread:', threadId);

        // Messages suivants : juste ajouter le message utilisateur
        // Le thread garde déjà tout le contexte
        await openai.beta.threads.messages.create(threadId, {
          role: 'user',
          content: userMessage
        });
      }

      // Run the assistant avec streaming pour meilleure réactivité
      console.log('[Chat API] Running assistant with streaming...', { assistantId: ASSISTANT_ID, threadId });

      // Créer le run avec streaming
      const stream = await openai.beta.threads.runs.stream(threadId, {
        assistant_id: ASSISTANT_ID,
      });

      console.log('[Chat API] Stream created, waiting for response...');

      let assistantResponse = "";
      let runId = "";

      // Écouter les événements du stream
      for await (const event of stream) {
        // Capturer le run ID
        if (event.event === 'thread.run.created') {
          runId = event.data.id;
          console.log('[Chat API] Run created:', runId);
        }

        // Capturer les deltas de texte au fur et à mesure
        if (event.event === 'thread.message.delta') {
          const delta = event.data.delta;
          if (delta.content && delta.content[0]?.type === 'text') {
            const textDelta = delta.content[0].text?.value || '';
            assistantResponse += textDelta;
          }
        }

        // Vérifier la complétion
        if (event.event === 'thread.run.completed') {
          console.log('[Chat API] Run completed via stream:', {
            runId,
            threadId,
            responseLength: assistantResponse.length
          });
        }

        // Gérer les erreurs
        if (event.event === 'thread.run.failed' ||
            event.event === 'thread.run.cancelled' ||
            event.event === 'thread.run.expired') {
          const errorDetails = {
            event: event.event,
            runId,
            threadId,
            assistantId: ASSISTANT_ID,
          };
          console.error('[Chat API] Assistant run failed via stream:', errorDetails);
          throw new Error(`Assistant run failed - Event: ${event.event}, Run ID: ${runId}, Thread ID: ${threadId}`);
        }
      }

      // Fallback si la réponse est vide
      if (!assistantResponse) {
        assistantResponse = "Je n'ai pas compris, peux-tu reformuler?";
      }

      console.log('[Chat API] Final assistant response:', {
        responseLength: assistantResponse.length,
        runId,
        threadId
      });

      await storage.addMessage({
        sessionId,
        role: 'assistant',
        content: assistantResponse,
      });

      // Detect clues from Peter's response too (not just from the user's message)
      const detectedFromResponse = detectClues(assistantResponse, [...session.foundClues, ...detectedClues]);
      const allDetectedClues = [...detectedClues, ...detectedFromResponse];
      if (detectedFromResponse.length > 0) {
        console.log('[Chat API] Additional clues detected from Peter\'s response:', detectedFromResponse);
      }

      // Update session with ALL detected clues (from user message + from Peter's response)
      if (allDetectedClues.length > 0) {
        const updatedClues = [...session.foundClues, ...allDetectedClues];
        await storage.updateSession(sessionId, {
          foundClues: updatedClues,
          score: updatedClues.length,
        });
      }

      // Incrémenter le compteur de messages pour la synchronisation Google Sheets
      await storage.incrementMessageCount(sessionId);
      console.log('[Chat API] Message count incremented for session:', sessionId);

      console.log('[Chat API] Sending response to client');
      res.json({
        response: assistantResponse,
        detectedClue: allDetectedClues.length > 0 ? allDetectedClues[0] : null,
        foundClues: allDetectedClues.length > 0 ? [...session.foundClues, ...allDetectedClues] : session.foundClues,
      });
    } catch (error) {
      console.error('[Chat API] Error in chat:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
        sessionId: req.body.sessionId,
      });

      const isProd = process.env.NODE_ENV === 'production';
      res.status(500).json({
        error: 'Erreur lors de la conversation avec Peter',
        ...(isProd ? {} : {
          details: error instanceof Error ? error.message : 'Unknown error',
          technicalInfo: {
            errorType: error instanceof Error ? error.name : 'UnknownError',
            sessionId: req.body.sessionId,
            timestamp: new Date().toISOString()
          }
        })
      });
    }
  });

  // =============== SYNTHESES ENDPOINTS ===============

  // POST /api/sessions/:id/synthesis - Enregistrer la phrase de synthèse finale
  app.post('/api/sessions/:id/synthesis', async (req, res) => {
    try {
      const { id } = req.params;

      const verified = await verifySessionToken(id, req, res);
      if (!verified) return;

      const { finalSynthesis } = req.body;

      if (!finalSynthesis || typeof finalSynthesis !== 'string') {
        return res.status(400).json({ error: 'finalSynthesis is required' });
      }

      const session = await storage.updateSession(id, {
        finalSynthesis,
        completedAt: new Date(),
        completed: 1,
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      console.log('[Synthesis API] Synthesis saved for session:', id);
      res.json(sanitizeSession(session));
    } catch (error) {
      console.error('[Synthesis API] Error saving synthesis:', error);
      res.status(500).json({ error: 'Failed to save synthesis' });
    }
  });

  // GET /api/syntheses - Lister toutes les synthèses (page finale)
  app.get('/api/syntheses', async (req, res) => {
    try {
      const sort = (req.query.sort as 'recent' | 'upvotes') || 'recent';
      const limit = parseInt(req.query.limit as string) || 50;

      const syntheses = await storage.getCompletedSessions({
        sort,
        limit: Math.min(limit, 100), // Max 100
      });

      // Filter to only return sessions with finalSynthesis, strip access tokens
      const withSynthesis = syntheses
        .filter(s => s.finalSynthesis)
        .map(sanitizeSession);

      console.log('[Syntheses API] Returning', withSynthesis.length, 'syntheses');
      res.json(withSynthesis);
    } catch (error) {
      console.error('[Syntheses API] Error fetching syntheses:', error);
      res.status(500).json({ error: 'Failed to fetch syntheses' });
    }
  });

  // POST /api/syntheses/:id/upvote - Ajouter un upvote à une synthèse
  app.post('/api/syntheses/:id/upvote', async (req, res) => {
    try {
      const { id } = req.params;

      const session = await storage.incrementUpvote(id);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      console.log('[Upvote API] Upvote added for session:', id, 'Total:', session.upvotes);
      res.json({ upvotes: session.upvotes });
    } catch (error) {
      console.error('[Upvote API] Error adding upvote:', error);
      res.status(500).json({ error: 'Failed to add upvote' });
    }
  });

  // GET /api/sessions/:id/stats - Stats de la session
  app.get('/api/sessions/:id/stats', async (req, res) => {
    try {
      const session = await verifySessionToken(req.params.id, req, res);
      if (!session) return;

      res.json({
        messageCount: session.messageCount,
        foundClues: session.foundClues,
        clueCount: session.foundClues.length,
        score: session.score,
        completed: session.completed === 1,
        finalSynthesis: session.finalSynthesis,
        upvotes: session.upvotes,
      });
    } catch (error) {
      console.error('[Stats API] Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  const httpServer = createServer(app);
  attachDeepgramRelay(httpServer);
  return httpServer;
}
