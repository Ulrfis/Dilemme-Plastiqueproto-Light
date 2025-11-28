import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import OpenAI from "openai";
import { z } from "zod";
import { insertTutorialSessionSchema, insertConversationMessageSchema } from "@shared/schema";
import crypto from "crypto";

const upload = multer({ storage: multer.memoryStorage() });

// PHASE 1 OPTIMIZATION: TTS Response Cache
// Cache TTS audio by text hash to avoid regenerating identical responses
const ttsCache = new Map<string, Buffer>();
const TTS_CACHE_MAX_SIZE = 100; // Limit cache to 100 entries to prevent memory issues

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: 'org-z0AK8zYLTeapGaiDZFQ5co2N',
});

const TARGET_CLUES = [
  { keyword: "ADN", variants: ["adn", "acide désoxyribonucléique", "génétique", "double hélice"] },
  { keyword: "bébé", variants: ["bébé", "bebe", "nourrisson", "enfant", "nouveau-né"] },
  { keyword: "penseur de Rodin", variants: ["penseur", "rodin", "sculpture", "statue penseur"] },
  { keyword: "plastique", variants: ["plastique", "pollution plastique", "déchets plastiques", "pollution"] }
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
  
  app.post('/api/sessions', async (req, res) => {
    try {
      const data = insertTutorialSessionSchema.parse(req.body);
      const session = await storage.createSession(data);
      res.json(session);
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(400).json({ error: 'Invalid session data' });
    }
  });

  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(session);
    } catch (error) {
      console.error('Error fetching session:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.patch('/api/sessions/:id', async (req, res) => {
    try {
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
      res.json(session);
    } catch (error) {
      console.error('Error updating session:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid update data', details: error.errors });
      }
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/speech-to-text', upload.single('audio'), async (req: Express.Request, res) => {
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

  // PHASE 2 OPTIMIZATION: Streaming TTS endpoint
  // Uses ElevenLabs streaming to send audio chunks as they're generated
  app.post('/api/text-to-speech/stream', async (req, res) => {
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
      const VOICE_ID = 'CBP9p4KAWPqrMHTDtWPR'; // Peter mai 2025 FR

      if (!ELEVENLABS_API_KEY) {
        console.error('[TTS Stream API] ElevenLabs API key not configured');
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      console.log('[TTS Stream API] Calling ElevenLabs streaming API...');

      // Call ElevenLabs with stream optimization enabled
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5', // Faster model for lower latency
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
          },
          optimize_streaming_latency: 4, // 0-4, max optimization for lowest latency
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

  app.post('/api/text-to-speech', async (req, res) => {
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
      const VOICE_ID = 'CBP9p4KAWPqrMHTDtWPR'; // Peter mai 2025 FR

      console.log('[TTS API] Using voice:', VOICE_ID);

      if (!ELEVENLABS_API_KEY) {
        console.error('[TTS API] ElevenLabs API key not configured');
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      console.log('[TTS API] Calling ElevenLabs API...');
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2_5', // Faster model for lower latency
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75
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
      console.log('[Chat Stream API] Request received:', { sessionId: req.body.sessionId, messageLength: req.body.userMessage?.length });
      const { sessionId, userMessage } = req.body;

      if (!sessionId || !userMessage) {
        return res.status(400).json({ error: 'Missing sessionId or userMessage' });
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      console.log('[Chat Stream API] Session found:', { sessionId, foundClues: session.foundClues });

      const detectedClues = detectClues(userMessage, session.foundClues);
      console.log('[Chat Stream API] Clue detection:', { detectedClues, userMessage });

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

      const ASSISTANT_ID = 'asst_P9b5PxMd1k9HjBgbyXI1Cvm9';
      console.log('[Chat Stream API] Using OpenAI Assistant:', ASSISTANT_ID);

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
          content: `${contextPrompt}\n\n${userMessage}`
        });
      } else {
        console.log('[Chat Stream API] Reusing existing thread:', threadId);
        await openai.beta.threads.messages.create(threadId, {
          role: 'user',
          content: userMessage
        });
      }

      // Stream the assistant response
      console.log('[Chat Stream API] Running assistant with streaming...', { assistantId: ASSISTANT_ID, threadId });

      const stream = await openai.beta.threads.runs.stream(threadId, {
        assistant_id: ASSISTANT_ID,
      });

      let fullResponse = "";
      let currentSentence = "";
      let sentenceCount = 0;

      // Helper to detect sentence boundaries
      const isSentenceEnd = (text: string): boolean => {
        // Match sentence-ending punctuation followed by space or end of string
        return /[.!?]\s+$/.test(text) || /[.!?]$/.test(text);
      };

      // Helper to send sentence via SSE
      const sendSentence = (sentence: string) => {
        if (sentence.trim().length > 0) {
          sentenceCount++;
          console.log('[Chat Stream API] Sending sentence #' + sentenceCount + ':', sentence.substring(0, 50) + '...');
          res.write(`data: ${JSON.stringify({
            type: 'sentence',
            text: sentence.trim(),
            index: sentenceCount
          })}\n\n`);
        }
      };

      for await (const event of stream) {
        if (event.event === 'thread.message.delta') {
          const delta = event.data.delta;
          if (delta.content && delta.content[0]?.type === 'text') {
            const textDelta = delta.content[0].text?.value || '';
            fullResponse += textDelta;
            currentSentence += textDelta;

            // Check if we have a complete sentence
            if (isSentenceEnd(currentSentence)) {
              sendSentence(currentSentence);
              currentSentence = "";
            }
          }
        }

        if (event.event === 'thread.run.completed') {
          console.log('[Chat Stream API] Run completed:', { responseLength: fullResponse.length });

          // Send any remaining text as final sentence
          if (currentSentence.trim().length > 0) {
            sendSentence(currentSentence);
          }
        }

        if (event.event === 'thread.run.failed' ||
            event.event === 'thread.run.cancelled' ||
            event.event === 'thread.run.expired') {
          console.error('[Chat Stream API] Assistant run failed:', event.event);
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: `Assistant run failed: ${event.event}`
          })}\n\n`);
          res.end();
          return;
        }
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

      // Update session with detected clues
      if (detectedClues.length > 0) {
        const updatedClues = [...session.foundClues, ...detectedClues];
        await storage.updateSession(sessionId, {
          foundClues: updatedClues,
          score: updatedClues.length,
        });
      }

      // Send completion event with clue information
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        fullResponse,
        foundClues: detectedClues.length > 0 ? [...session.foundClues, ...detectedClues] : session.foundClues,
        detectedClue: detectedClues.length > 0 ? detectedClues[0] : null
      })}\n\n`);

      res.end();
      console.log('[Chat Stream API] Stream ended successfully');
    } catch (error) {
      console.error('[Chat Stream API] Error:', error);

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
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

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      console.log('[Chat API] Session found:', { sessionId, foundClues: session.foundClues });

      const detectedClues = detectClues(userMessage, session.foundClues);
      console.log('[Chat API] Clue detection:', { detectedClues, userMessage });

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

      // Update session with ALL detected clues
      if (detectedClues.length > 0) {
        const updatedClues = [...session.foundClues, ...detectedClues];
        await storage.updateSession(sessionId, {
          foundClues: updatedClues,
          score: updatedClues.length,
        });
      }

      console.log('[Chat API] Sending response to client');
      res.json({
        response: assistantResponse,
        detectedClue: detectedClues.length > 0 ? detectedClues[0] : null, // For backward compatibility
        foundClues: detectedClues.length > 0 ? [...session.foundClues, ...detectedClues] : session.foundClues,
      });
    } catch (error) {
      console.error('[Chat API] Error in chat:', error);
      
      const errorDetails = {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
        sessionId: req.body.sessionId,
        assistantId: 'asst_P9b5PxMd1k9HjBgbyXI1Cvm9',
      };
      
      console.error('[Chat API] Full error details:', errorDetails);
      
      // Return detailed error to frontend
      res.status(500).json({
        error: 'Erreur lors de la conversation avec Peter',
        details: error instanceof Error ? error.message : 'Unknown error',
        technicalInfo: {
          errorType: error instanceof Error ? error.name : 'UnknownError',
          sessionId: req.body.sessionId,
          assistantId: 'asst_P9b5PxMd1k9HjBgbyXI1Cvm9',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // =============== SYNTHESES ENDPOINTS ===============

  // POST /api/sessions/:id/synthesis - Enregistrer la phrase de synthèse finale
  app.post('/api/sessions/:id/synthesis', async (req, res) => {
    try {
      const { id } = req.params;
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
      res.json(session);
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

      // Filter to only return sessions with finalSynthesis
      const withSynthesis = syntheses.filter(s => s.finalSynthesis);

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
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

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
  return httpServer;
}
