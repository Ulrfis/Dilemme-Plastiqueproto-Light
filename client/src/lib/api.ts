import type { TutorialSession, InsertTutorialSession } from "@shared/schema";
import { readStoredSessionFlow } from "@/lib/sessionFlowStorage";

function sessionAuthHeaders(): Record<string, string> {
  const stored = readStoredSessionFlow();
  const token = stored?.accessToken;
  if (token) {
    return { 'X-Session-Token': token };
  }
  return {};
}

export async function createSession(data: InsertTutorialSession): Promise<TutorialSession & { welcomeAudioToken?: string }> {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    throw new Error('Failed to create session');
  }

  return response.json();
}

export async function getSession(id: string): Promise<TutorialSession> {
  const response = await fetch(`/api/sessions/${id}`, {
    headers: { ...sessionAuthHeaders() },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch session');
  }

  return response.json();
}

export async function updateSession(id: string, updates: Partial<InsertTutorialSession>): Promise<TutorialSession> {
  const response = await fetch(`/api/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...sessionAuthHeaders() },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    throw new Error('Failed to update session');
  }

  return response.json();
}

export async function sendChatMessage(sessionId: string, userMessage: string): Promise<{
  response: string;
  detectedClue: string | null;
  foundClues: string[];
}> {
  const stored = readStoredSessionFlow();
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionAuthHeaders() },
    body: JSON.stringify({ sessionId, userMessage, accessToken: stored?.accessToken }),
  });

  if (!response.ok) {
    throw new Error('Failed to send chat message');
  }

  return response.json();
}

export async function textToSpeech(text: string): Promise<Blob> {
  const response = await fetch('/api/text-to-speech', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[API] TTS error response:', errorText);
    throw new Error(`Failed to generate speech: ${response.status}`);
  }

  const blob = await response.blob();

  // MOBILE FIX: Vérifier que le blob est valide
  if (!blob || blob.size === 0) {
    console.error('[API] Received empty or invalid audio blob');
    throw new Error('Received empty or invalid audio blob from server');
  }

  console.log('[API] TTS blob received successfully, size:', blob.size, 'type:', blob.type);
  return blob;
}

// PHASE 2 OPTIMIZATION: Streaming TTS API
// Uses the streaming endpoint for faster server-side generation
// but waits for complete audio to avoid playback cuts
export async function textToSpeechStreaming(text: string): Promise<Blob> {
  console.log('[API] Starting streaming TTS for text length:', text.length);

  const response = await fetch('/api/text-to-speech/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[API] TTS Stream error response:', errorText);
    throw new Error(`Failed to generate speech: ${response.status}`);
  }

  // Check for cache hit (non-streaming response)
  const cacheHeader = response.headers.get('X-Cache');
  if (cacheHeader === 'HIT') {
    console.log('[API] TTS Cache HIT - returning cached audio');
    const blob = await response.blob();
    return blob;
  }

  // Stream the response and collect all chunks
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body reader available');
  }

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      totalBytes += value.length;
    }
  } finally {
    reader.releaseLock();
  }

  // Create complete blob from all chunks
  const fullBlob = new Blob(chunks, { type: 'audio/mpeg' });

  if (fullBlob.size === 0) {
    throw new Error('Received empty audio from streaming');
  }

  console.log('[API] TTS streaming complete, total size:', fullBlob.size, 'bytes');
  return fullBlob;
}

export interface StreamChatCallbacks {
  onSentence?: (sentence: string, index: number) => void;
  // count: number of sentence indices covered by this audio token (default 1).
  // When count > 1, the client must skip indices (index+1)...(index+count-1) in the audio queue.
  onSentenceAudio?: (index: number, audioToken: string, count: number, phase?: 'phase1' | 'phase2') => void;
  onSentenceAudioError?: (index: number) => void;
  onComplete?: (fullResponse: string, foundClues: string[], detectedClue: string | null, phase2Dispatched?: boolean) => void;
  onError?: (error: string) => void;
  /** Fired when Phase 2a TTS is dispatched; carries mid-stream flag and accumulated char count. */
  onPhase2aTiming?: (dispatchedMidStream: boolean, charsAtDispatch: number) => void;
}

export interface StreamChatOptions {
  exchangeCount?: number; // Current exchange number (1-8)
  userName?: string; // User's name for personalized goodbye
}

export async function sendChatMessageStreaming(
  sessionId: string,
  userMessage: string,
  callbacks: StreamChatCallbacks,
  options?: StreamChatOptions
): Promise<void> {
  const stored = readStoredSessionFlow();
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...sessionAuthHeaders() },
    body: JSON.stringify({
      sessionId,
      userMessage,
      accessToken: stored?.accessToken,
      exchangeCount: options?.exchangeCount,
      userName: options?.userName
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to send streaming chat message');
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body reader available');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // Decode chunk and add to buffer
      buffer += decoder.decode(value, { stream: true });

      // Process complete SSE messages (separated by \n\n)
      const messages = buffer.split('\n\n');
      buffer = messages.pop() || ''; // Keep incomplete message in buffer

      for (const message of messages) {
        if (!message.trim() || !message.startsWith('data: ')) continue;

        try {
          const data = JSON.parse(message.slice(6)); // Remove 'data: ' prefix

          if (data.type === 'sentence' && callbacks.onSentence) {
            callbacks.onSentence(data.text, data.index);
          } else if (data.type === 'sentence_audio' && callbacks.onSentenceAudio) {
            callbacks.onSentenceAudio(data.index, data.audioToken, data.count ?? 1, data.phase);
          } else if (data.type === 'sentence_audio_error' && callbacks.onSentenceAudioError) {
            callbacks.onSentenceAudioError(data.index);
          } else if (data.type === 'complete' && callbacks.onComplete) {
            callbacks.onComplete(data.fullResponse, data.foundClues, data.detectedClue, data.phase2Dispatched);
          } else if (data.type === 'error' && callbacks.onError) {
            callbacks.onError(data.message);
          } else if (data.type === 'phase2a_timing' && callbacks.onPhase2aTiming) {
            callbacks.onPhase2aTiming(data.dispatched_mid_stream, data.chars_at_dispatch);
          }
        } catch (parseError) {
          console.error('[API] Error parsing SSE message:', parseError, message);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
