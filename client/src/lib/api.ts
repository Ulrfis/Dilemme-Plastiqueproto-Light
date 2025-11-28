import type { TutorialSession, InsertTutorialSession } from "@shared/schema";

export async function createSession(data: InsertTutorialSession): Promise<TutorialSession> {
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
  const response = await fetch(`/api/sessions/${id}`);

  if (!response.ok) {
    throw new Error('Failed to fetch session');
  }

  return response.json();
}

export async function updateSession(id: string, updates: Partial<InsertTutorialSession>): Promise<TutorialSession> {
  const response = await fetch(`/api/sessions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
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
  const response = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, userMessage }),
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
export async function textToSpeechStreaming(text: string): Promise<Blob> {
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

  const blob = await response.blob();

  if (!blob || blob.size === 0) {
    console.error('[API] Received empty or invalid audio blob from streaming');
    throw new Error('Received empty or invalid audio blob from server');
  }

  console.log('[API] TTS streaming blob received successfully, size:', blob.size, 'type:', blob.type);
  return blob;
}

// PHASE 2 OPTIMIZATION: Streaming chat API with SSE
export interface StreamChatCallbacks {
  onSentence?: (sentence: string, index: number) => void;
  onComplete?: (fullResponse: string, foundClues: string[], detectedClue: string | null) => void;
  onError?: (error: string) => void;
}

export async function sendChatMessageStreaming(
  sessionId: string,
  userMessage: string,
  callbacks: StreamChatCallbacks
): Promise<void> {
  const response = await fetch('/api/chat/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId, userMessage }),
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
          } else if (data.type === 'complete' && callbacks.onComplete) {
            callbacks.onComplete(data.fullResponse, data.foundClues, data.detectedClue);
          } else if (data.type === 'error' && callbacks.onError) {
            callbacks.onError(data.message);
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
