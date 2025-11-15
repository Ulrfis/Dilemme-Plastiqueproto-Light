import { useState, useRef, useCallback, useEffect } from 'react';

export type AudioState = 'idle' | 'recording' | 'processing' | 'playing' | 'error';

interface UseVoiceInteractionOptions {
  onAudioStart?: () => void;
  onAudioStop?: () => void;  // Appelé quand l'audio est arrêté ou échoue
}

interface UseVoiceInteractionResult {
  audioState: AudioState;
  transcription: string;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<string | null>;
  playAudio: (audioBlob: Blob) => Promise<void>;
  stopAudio: () => void;
  checkMicrophonePermission: () => Promise<boolean>;
  reset: () => void;
  recoverFromError: () => void;
}

export function useVoiceInteraction(options?: UseVoiceInteractionOptions): UseVoiceInteractionResult {
  const { onAudioStart, onAudioStop } = options || {};
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const [transcription, setTranscription] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  
  // Utiliser des refs pour stocker les callbacks et éviter les stale closures
  // Les callbacks playAudio/stopAudio seront stables et invoqueront toujours la dernière version
  const onAudioStartRef = useRef(onAudioStart);
  const onAudioStopRef = useRef(onAudioStop);
  
  // Synchroniser les refs avec les dernières versions des callbacks
  useEffect(() => {
    onAudioStartRef.current = onAudioStart;
  }, [onAudioStart]);
  
  useEffect(() => {
    onAudioStopRef.current = onAudioStop;
  }, [onAudioStop]);

  const checkMicrophonePermission = useCallback(async (): Promise<boolean> => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop());
      return true;
    } catch (error) {
      console.error('Microphone permission denied:', error);
      return false;
    }
  }, []);

  const startRecording = useCallback(async () => {
    console.log('[useVoiceInteraction] startRecording called');
    try {
      console.log('[useVoiceInteraction] Requesting microphone access...');
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 44100,
        }
      });
      console.log('[useVoiceInteraction] Microphone access granted, stream:', stream);

      audioChunksRef.current = [];
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm',
      });
      console.log('[useVoiceInteraction] MediaRecorder created');

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
          console.log('[useVoiceInteraction] Audio chunk received:', event.data.size, 'bytes');
        }
      };

      mediaRecorder.start();
      mediaRecorderRef.current = mediaRecorder;
      setAudioState('recording');
      console.log('[useVoiceInteraction] Recording started successfully');
    } catch (error) {
      console.error('[useVoiceInteraction] Error starting recording:', error);
      setAudioState('error');
      throw error;
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<string | null> => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;

      if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        console.log('[useVoiceInteraction] stopRecording: no active recording');
        resolve(null);
        return;
      }

      console.log('[useVoiceInteraction] stopRecording: stopping recording...');

      mediaRecorder.onstop = async () => {
        console.log('[useVoiceInteraction] Recording stopped, chunks:', audioChunksRef.current.length);
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        console.log('[useVoiceInteraction] Audio blob created, size:', audioBlob.size);

        // MOBILE FIX: S'assurer que toutes les tracks sont arrêtées pour libérer le micro
        mediaRecorder.stream.getTracks().forEach(track => {
          track.stop();
          console.log('[useVoiceInteraction] Stopped track:', track.kind, track.label);
        });

        setAudioState('processing');

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          console.log('[useVoiceInteraction] Sending audio to speech-to-text API...');
          const response = await fetch('/api/speech-to-text', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error(`Transcription failed with status ${response.status}`);
          }

          const data = await response.json();
          console.log('[useVoiceInteraction] Transcription successful:', data.text);
          setTranscription(data.text);
          setAudioState('idle'); // MOBILE FIX: Retourner à idle après succès
          resolve(data.text);
        } catch (error) {
          console.error('[useVoiceInteraction] Error transcribing audio:', error);
          setAudioState('idle'); // MOBILE FIX: Retourner à idle même en cas d'erreur
          resolve(null);
        }
      };

      mediaRecorder.stop();
    });
  }, []);

  const playAudio = useCallback(async (audioBlob: Blob): Promise<void> => {
    return new Promise((resolve, reject) => {
      console.log('[useVoiceInteraction] playAudio called, blob size:', audioBlob.size);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioElementRef.current = audio;

      setAudioState('playing');

      // MOBILE FIX: Timeout de sécurité pour détecter les blocages audio
      const maxAudioDuration = 120000; // 2 minutes max
      const safetyTimeoutId = setTimeout(() => {
        console.error('[useVoiceInteraction] Audio playback timeout - forcing cleanup');
        if (audioElementRef.current === audio) {
          audio.pause();
          audio.currentTime = 0;
          URL.revokeObjectURL(audioUrl);
          setAudioState('idle');
          audioElementRef.current = null;
          if (onAudioStopRef.current) {
            onAudioStopRef.current();
          }
          resolve(); // Résoudre au lieu de rejeter pour ne pas bloquer
        }
      }, maxAudioDuration);

      audio.onended = () => {
        console.log('[useVoiceInteraction] Audio ended normally');
        clearTimeout(safetyTimeoutId);
        URL.revokeObjectURL(audioUrl);
        setAudioState('idle');
        audioElementRef.current = null;
        if (onAudioStopRef.current) {
          onAudioStopRef.current();
        }
        resolve();
      };

      audio.onerror = (error) => {
        console.error('[useVoiceInteraction] Audio playback error:', error);
        clearTimeout(safetyTimeoutId);
        URL.revokeObjectURL(audioUrl);
        setAudioState('idle'); // MOBILE FIX: Retourner à idle au lieu de error
        audioElementRef.current = null;
        // Notifier l'arrêt de l'audio en cas d'erreur
        if (onAudioStopRef.current) {
          onAudioStopRef.current();
        }
        reject(error);
      };

      // Appeler onAudioStart quand l'audio commence VRAIMENT à jouer
      // Utilise la ref pour toujours appeler la dernière version du callback
      audio.onplaying = () => {
        console.log('[useVoiceInteraction] Audio started playing, calling onAudioStart');
        if (onAudioStartRef.current) {
          onAudioStartRef.current();
        }
      };

      // MOBILE FIX: Gérer l'interruption audio (appel entrant, changement d'app, etc.)
      audio.onpause = () => {
        console.log('[useVoiceInteraction] Audio paused (possibly interrupted on mobile)');
      };

      // MOBILE FIX: Tenter de reprendre la lecture si l'audio est suspendu
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && audio.paused && audioElementRef.current === audio) {
          console.log('[useVoiceInteraction] Page visible again, attempting to resume audio');
          audio.play().catch(err => {
            console.warn('[useVoiceInteraction] Could not resume audio:', err);
          });
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      audio.play().catch((error) => {
        console.error('[useVoiceInteraction] Error playing audio:', error);
        clearTimeout(safetyTimeoutId);
        URL.revokeObjectURL(audioUrl);
        setAudioState('idle'); // MOBILE FIX: Retourner à idle au lieu de error
        audioElementRef.current = null;
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        // Notifier l'arrêt en cas d'erreur de lecture
        if (onAudioStopRef.current) {
          onAudioStopRef.current();
        }
        reject(error);
      });

      // Cleanup de l'event listener quand l'audio se termine
      audio.addEventListener('ended', () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }, { once: true });
    });
  }, []); // Pas de dépendances - le callback reste stable

  // Fonction pour arrêter immédiatement la lecture audio de Peter
  const stopAudio = useCallback(() => {
    console.log('[useVoiceInteraction] Stopping audio playback - User wants to speak');

    if (audioElementRef.current) {
      // Pause et reset l'audio
      audioElementRef.current.pause();
      audioElementRef.current.currentTime = 0;
      audioElementRef.current = null;

      console.log('[useVoiceInteraction] Audio stopped successfully');
    }

    // Passer immédiatement à idle pour permettre l'enregistrement
    setAudioState('idle');
    
    // CRITIQUE: Notifier l'arrêt de l'audio pour nettoyer les flags dans TutorialScreen
    // Sans cela, isWaitingForAudioStart peut rester bloqué si l'audio est arrêté
    // avant que onplaying ne se déclenche
    if (onAudioStopRef.current) {
      onAudioStopRef.current();
    }
  }, []);

  const reset = useCallback(() => {
    console.log('[useVoiceInteraction] Resetting voice interaction state');

    // MOBILE FIX: Properly cleanup MediaRecorder and stream
    if (mediaRecorderRef.current) {
      try {
        if (mediaRecorderRef.current.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
        // Always stop all tracks to release microphone on mobile
        mediaRecorderRef.current.stream.getTracks().forEach(track => {
          track.stop();
          console.log('[useVoiceInteraction] Stopped track:', track.kind);
        });
        mediaRecorderRef.current = null;
      } catch (error) {
        console.warn('[useVoiceInteraction] Error during MediaRecorder cleanup:', error);
      }
    }

    // MOBILE FIX: Properly cleanup audio element
    if (audioElementRef.current) {
      try {
        audioElementRef.current.pause();
        audioElementRef.current.src = '';
        audioElementRef.current.load(); // Force cleanup
        audioElementRef.current = null;
      } catch (error) {
        console.warn('[useVoiceInteraction] Error during audio cleanup:', error);
      }
    }

    setAudioState('idle');
    setTranscription('');
    audioChunksRef.current = [];
  }, []);

  const recoverFromError = useCallback(() => {
    reset();
    setAudioState('idle');
  }, [reset]);

  return {
    audioState,
    transcription,
    startRecording,
    stopRecording,
    playAudio,
    stopAudio,
    checkMicrophonePermission,
    reset,
    recoverFromError,
  };
}
