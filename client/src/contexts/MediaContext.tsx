import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface MediaContextType {
  audioUnlocked: boolean;
  userGestureAcquired: boolean;
  unlockAudio: () => Promise<boolean>;
  markUserGesture: () => void;
}

const MediaContext = createContext<MediaContextType | undefined>(undefined);

export function MediaProvider({ children }: { children: ReactNode }) {
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const [userGestureAcquired, setUserGestureAcquired] = useState(false);

  const markUserGesture = useCallback(() => {
    console.log('[MediaManager] User gesture acquired');
    setUserGestureAcquired(true);
  }, []);

  /**
   * Déverrouille l'audio en jouant un son silencieux.
   * DOIT être appelé dans un gestionnaire d'événement utilisateur (click, touch, etc.)
   */
  const unlockAudio = useCallback(async (): Promise<boolean> => {
    if (audioUnlocked) {
      console.log('[MediaManager] Audio already unlocked');
      return true;
    }

    try {
      console.log('[MediaManager] Attempting to unlock audio...');

      // Créer un contexte audio silencieux et le jouer
      // Cela déverrouille l'audio sur Safari et autres navigateurs restrictifs
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

      // Créer un buffer silencieux très court
      const buffer = audioContext.createBuffer(1, 1, 22050);
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.start(0);

      // Reprendre le contexte audio si suspendu
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }

      console.log('[MediaManager] Audio unlocked successfully');
      setAudioUnlocked(true);
      setUserGestureAcquired(true);

      // Fermer le contexte après utilisation
      setTimeout(() => audioContext.close(), 100);

      return true;
    } catch (error) {
      console.error('[MediaManager] Failed to unlock audio:', error);
      // Même en cas d'erreur, on marque le gesture comme acquis
      setUserGestureAcquired(true);
      return false;
    }
  }, [audioUnlocked]);

  return (
    <MediaContext.Provider
      value={{
        audioUnlocked,
        userGestureAcquired,
        unlockAudio,
        markUserGesture
      }}
    >
      {children}
    </MediaContext.Provider>
  );
}

export function useMedia() {
  const context = useContext(MediaContext);
  if (context === undefined) {
    throw new Error('useMedia must be used within a MediaProvider');
  }
  return context;
}
