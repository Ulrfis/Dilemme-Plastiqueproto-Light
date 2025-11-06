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
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }

      const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
      const VOICE_ID = 'ErXwobaYiN019PkySvjV';

      if (!ELEVENLABS_API_KEY) {
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

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
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const audioBuffer = await response.arrayBuffer();
      res.set('Content-Type', 'audio/mpeg');
      res.send(Buffer.from(audioBuffer));
    } catch (error) {
      console.error('Error generating speech:', error);
      res.status(500).json({ error: 'Speech generation failed' });
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      const { sessionId, userMessage } = req.body;

      if (!sessionId || !userMessage) {
        return res.status(400).json({ error: 'Missing sessionId or userMessage' });
      }

      const session = await storage.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const detectedClue = detectClue(userMessage, session.foundClues);

      await storage.addMessage({
        sessionId,
        role: 'user',
        content: userMessage,
        detectedClue: detectedClue || undefined,
      });

      const messages = await storage.getSessionMessages(sessionId);
      
      const systemPrompt = `Tu es Peter, un assistant IA éducatif amical qui aide les étudiants à analyser une image contenant 4 indices cachés: ADN, bébé, penseur de Rodin, et plastique/pollution.

Indices déjà trouvés: ${session.foundClues.join(', ') || 'aucun'}

Règles:
- Réponds en 1-2 phrases courtes et encourageantes en français
- Si l'utilisateur mentionne un indice non trouvé, félicite-le avec enthousiasme
- Guide l'utilisateur avec des questions ouvertes sans donner directement les réponses
- Sois chaleureux et positif
- Ne mentionne jamais les indices non trouvés directement`;

      const chatMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages.slice(-6).map(msg => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content
        }))
      ];

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: chatMessages,
        max_tokens: 150,
        temperature: 0.7,
      });

      const assistantResponse = completion.choices[0]?.message?.content || "Je n'ai pas compris, peux-tu reformuler?";

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

      res.json({
        response: assistantResponse,
        detectedClue: detectedClue,
        foundClues: detectedClue ? [...session.foundClues, detectedClue] : session.foundClues,
      });
    } catch (error) {
      console.error('Error in chat:', error);
      res.status(500).json({ error: 'Chat failed' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
