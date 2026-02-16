import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { getSessionFlowStorageKey, readStoredSessionFlow } from "@/lib/sessionFlowStorage";

interface Message {
  id?: string;
  role: 'assistant' | 'user';
  content: string;
}

interface SessionFlowState {
  userName: string;
  sessionId: string;
  foundClues: string[];
  messages: Message[];
  exchangeCount: number;
  conversationEnded: boolean;
  audioUnlocked: boolean;
  dragDropPlacements: Record<string, string>;
  dragDropValidated: boolean;
  synthesis: string;
  feedbackCompleted: boolean;
}

interface SessionFlowContextType extends SessionFlowState {
  setUserName: (name: string) => void;
  setSessionId: (id: string) => void;
  setFoundClues: (clues: string[]) => void;
  setMessages: (messages: Message[] | ((prev: Message[]) => Message[])) => void;
  setExchangeCount: (count: number | ((prev: number) => number)) => void;
  setConversationEnded: (ended: boolean) => void;
  setAudioUnlocked: (unlocked: boolean) => void;
  setDragDropPlacements: (placements: Record<string, string>) => void;
  setDragDropValidated: (validated: boolean) => void;
  setSynthesis: (text: string) => void;
  setFeedbackCompleted: (completed: boolean) => void;
  resetSession: () => void;
  hasSession: boolean;
}

const STORAGE_KEY = getSessionFlowStorageKey();

const initialState: SessionFlowState = {
  userName: '',
  sessionId: '',
  foundClues: [],
  messages: [],
  exchangeCount: 0,
  conversationEnded: false,
  audioUnlocked: false,
  dragDropPlacements: {},
  dragDropValidated: false,
  synthesis: '',
  feedbackCompleted: false,
};

const SessionFlowContext = createContext<SessionFlowContextType | null>(null);

function generateId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `msg-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadFromStorage(): SessionFlowState {
  try {
    // Permettre aux testeurs de forcer une session neuve via ?fresh=1
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('fresh')) {
        console.log('[SessionFlow] Fresh flag detected, skipping stored session');
        sessionStorage.removeItem(STORAGE_KEY);
        return initialState;
      }
    }

    const parsed = readStoredSessionFlow();
    if (parsed) {
      console.log('[SessionFlow] Loaded state from storage:', { 
        userName: parsed.userName, 
        sessionId: parsed.sessionId?.substring(0, 8),
        messagesCount: parsed.messages?.length || 0,
        foundClues: parsed.foundClues?.length || 0
      });
      // Re-générer des IDs manquants pour les messages afin d'éviter les key collisions
      const messagesWithIds = (parsed.messages || []).map((m: Message) => ({
        ...m,
        id: m.id || generateId(),
      }));
      return { ...initialState, ...parsed, messages: messagesWithIds };
    }
  } catch (e) {
    console.error('[SessionFlow] Failed to load from storage:', e);
  }
  return initialState;
}

function saveToStorage(state: SessionFlowState) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[SessionFlow] Failed to save to storage:', e);
  }
}

export function SessionFlowProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionFlowState>(() => loadFromStorage());

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      saveToStorage(state);
    }, 100);
    return () => clearTimeout(timeoutId);
  }, [state]);

  const setUserName = useCallback((name: string) => {
    // Save to storage FIRST (synchronously) before React state update
    const currentState = readStoredSessionFlow() ?? initialState;
    const newState = { ...currentState, userName: name };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    console.log('[SessionFlow] userName saved synchronously:', name);
    
    setState(prev => ({ ...prev, userName: name }));
  }, []);

  const setSessionId = useCallback((id: string) => {
    // Save to storage FIRST (synchronously) before React state update
    // This ensures sessionStorage has the value before any navigation
    const currentState = readStoredSessionFlow() ?? initialState;
    const newState = { ...currentState, sessionId: id };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(newState));
    console.log('[SessionFlow] sessionId saved synchronously:', id.substring(0, 8));
    
    setState(prev => ({ ...prev, sessionId: id }));
  }, []);

  const setFoundClues = useCallback((clues: string[]) => {
    setState(prev => ({ ...prev, foundClues: clues }));
  }, []);

  const setMessages = useCallback((messagesOrFn: Message[] | ((prev: Message[]) => Message[])) => {
    setState(prev => ({
      ...prev,
      messages: typeof messagesOrFn === 'function' ? messagesOrFn(prev.messages) : messagesOrFn
    }));
  }, []);

  const setExchangeCount = useCallback((countOrFn: number | ((prev: number) => number)) => {
    setState(prev => ({
      ...prev,
      exchangeCount: typeof countOrFn === 'function' ? countOrFn(prev.exchangeCount) : countOrFn
    }));
  }, []);

  const setConversationEnded = useCallback((ended: boolean) => {
    setState(prev => ({ ...prev, conversationEnded: ended }));
  }, []);

  const setAudioUnlocked = useCallback((unlocked: boolean) => {
    setState(prev => ({ ...prev, audioUnlocked: unlocked }));
  }, []);

  const setDragDropPlacements = useCallback((placements: Record<string, string>) => {
    setState(prev => ({ ...prev, dragDropPlacements: placements }));
  }, []);

  const setDragDropValidated = useCallback((validated: boolean) => {
    setState(prev => ({ ...prev, dragDropValidated: validated }));
  }, []);

  const setSynthesis = useCallback((text: string) => {
    setState(prev => ({ ...prev, synthesis: text }));
  }, []);

  const setFeedbackCompleted = useCallback((completed: boolean) => {
    setState(prev => ({ ...prev, feedbackCompleted: completed }));
  }, []);

  const resetSession = useCallback(() => {
    console.log('[SessionFlow] Resetting session (full)');
    sessionStorage.removeItem(STORAGE_KEY);
    setState(initialState);

    // S'assurer qu'une nouvelle session PostHog démarre proprement
    if (typeof window !== 'undefined' && (window as any).posthog?.reset) {
      try {
        (window as any).posthog.reset();
        console.log('[SessionFlow] PostHog reset called');
      } catch (err) {
        console.warn('[SessionFlow] PostHog reset failed:', err);
      }
    }
  }, []);

  const hasSession = Boolean(state.sessionId);

  return (
    <SessionFlowContext.Provider value={{
      ...state,
      setUserName,
      setSessionId,
      setFoundClues,
      setMessages,
      setExchangeCount,
      setConversationEnded,
      setAudioUnlocked,
      setDragDropPlacements,
      setDragDropValidated,
      setSynthesis,
      setFeedbackCompleted,
      resetSession,
      hasSession,
    }}>
      {children}
    </SessionFlowContext.Provider>
  );
}

export function useSessionFlow() {
  const context = useContext(SessionFlowContext);
  if (!context) {
    throw new Error('useSessionFlow must be used within a SessionFlowProvider');
  }
  return context;
}
