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
