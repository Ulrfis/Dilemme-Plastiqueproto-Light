const STORAGE_KEY = "dilemme_session_flow";

export interface StoredSessionFlow {
  messages?: Array<{
    id?: string;
    role: "assistant" | "user";
    content: string;
  }>;
  userName?: string;
  sessionId?: string;
  foundClues?: string[];
}

export function getSessionFlowStorageKey() {
  return STORAGE_KEY;
}

export function readStoredSessionFlow(): StoredSessionFlow | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;

    return parsed as StoredSessionFlow;
  } catch (error) {
    console.warn("[SessionFlow] Invalid session storage payload, clearing it.", error);
    sessionStorage.removeItem(STORAGE_KEY);
    return null;
  }
}
