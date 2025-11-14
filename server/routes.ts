import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import OpenAI from "openai";
import { z } from "zod";
import { insertTutorialSessionSchema, insertConversationMessageSchema } from "@shared/schema";

const upload = multer({ storage: multer.memoryStorage() });

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

function detectClue(text: string, alreadyFound: string[]): string | null {
  const textLower = text.toLowerCase();
  
  for (const clue of TARGET_CLUES) {
    if (alreadyFound.includes(clue.keyword)) continue;
    
    for (const variant of clue.variants) {
      if (textLower.includes(variant)) {
        return clue.keyword;
      }
    }
  }
  
  return null;
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

  app.post('/api/text-to-speech', async (req, res) => {
    try {
      console.log('[TTS API] Request received:', { textLength: req.body.text?.length });
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }

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
          model_id: 'eleven_multilingual_v2',
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

      console.log('[TTS API] Audio generated successfully');
      const audioBuffer = await response.arrayBuffer();
      res.set('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(audioBuffer));
    } catch (error) {
      console.error('[TTS API] Error generating speech:', error);
      res.status(500).json({
        error: 'Speech generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
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

      const detectedClue = detectClue(userMessage, session.foundClues);
      console.log('[Chat API] Clue detection:', { detectedClue, userMessage });

      await storage.addMessage({
        sessionId,
        role: 'user',
        content: userMessage,
        detectedClue: detectedClue || undefined,
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

      if (detectedClue) {
        const updatedClues = [...session.foundClues, detectedClue];
        await storage.updateSession(sessionId, {
          foundClues: updatedClues,
          score: updatedClues.length,
        });
      }

      console.log('[Chat API] Sending response to client');
      res.json({
        response: assistantResponse,
        detectedClue: detectedClue,
        foundClues: detectedClue ? [...session.foundClues, detectedClue] : session.foundClues,
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

  const httpServer = createServer(app);
  return httpServer;
}
