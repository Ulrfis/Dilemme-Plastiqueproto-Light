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
  checkMediaRecorderSupport: () => boolean;
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
  const audioExplicitlyStoppedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  
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

  // MOBILE FIX: Créer et activer l'AudioContext pour débloquer l'audio sur mobile
  const unlockAudioContext = useCallback(() => {
    try {
      if (!audioContextRef.current) {
        // @ts-ignore - webkit prefix for Safari
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioContextRef.current = new AudioContext();
        console.log('[useVoiceInteraction] AudioContext created:', audioContextRef.current.state);
      }

      // Si l'AudioContext est suspendu, le reprendre
      if (audioContextRef.current.state === 'suspended') {
        console.log('[useVoiceInteraction] Resuming suspended AudioContext...');
        audioContextRef.current.resume().then(() => {
          console.log('[useVoiceInteraction] AudioContext resumed successfully, state:', audioContextRef.current?.state);
        }).catch(err => {
          console.warn('[useVoiceInteraction] Failed to resume AudioContext:', err);
        });
      }

      // Jouer un buffer silencieux pour "débloquer" l'audio sur mobile
      const buffer = audioContextRef.current.createBuffer(1, 1, 22050);
      const source = audioContextRef.current.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContextRef.current.destination);
      source.start(0);
      console.log('[useVoiceInteraction] Silent audio played to unlock audio context');
    } catch (error) {
      console.warn('[useVoiceInteraction] Could not unlock audio context:', error);
    }
  }, []);

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

  // Vérifier si MediaRecorder est supporté (pas sur Safari iOS ancien)
  const checkMediaRecorderSupport = useCallback((): boolean => {
    const isSupported = typeof MediaRecorder !== 'undefined' &&
                       typeof navigator.mediaDevices !== 'undefined' &&
                       typeof navigator.mediaDevices.getUserMedia === 'function';

    console.log('[useVoiceInteraction] MediaRecorder support check:', isSupported);

    // Vérifier aussi si le navigateur supporte les types MIME nécessaires
    if (isSupported && MediaRecorder.isTypeSupported) {
      const webmSupported = MediaRecorder.isTypeSupported('audio/webm');
      const oggSupported = MediaRecorder.isTypeSupported('audio/ogg');
      const mp4Supported = MediaRecorder.isTypeSupported('audio/mp4');

      console.log('[useVoiceInteraction] MIME type support:', { webmSupported, oggSupported, mp4Supported });

      // Au moins un format doit être supporté
      return webmSupported || oggSupported || mp4Supported;
    }

    return isSupported;
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

      // Déterminer le meilleur format MIME supporté
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported && !MediaRecorder.isTypeSupported('audio/webm')) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }
      console.log('[useVoiceInteraction] Using MIME type:', mimeType);

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType,
      });
      console.log('[useVoiceInteraction] MediaRecorder created with type:', mimeType);

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

        // MOBILE FIX: Débloquer immédiatement l'audio context pour maintenir le contexte actif
        // Ceci est crucial pour que l'audio de Peter puisse jouer après le traitement
        unlockAudioContext();

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

      // MOBILE FIX: Réinitialiser le flag d'arrêt explicite pour chaque nouvelle lecture
      audioExplicitlyStoppedRef.current = false;
      console.log('[useVoiceInteraction] Reset audioExplicitlyStoppedRef to false');

      // MOBILE FIX: Débloquer l'audio context avant de jouer
      unlockAudioContext();

      // MOBILE FIX: Vérifier que le Blob est valide et non vide
      if (!audioBlob || audioBlob.size === 0) {
        console.error('[useVoiceInteraction] Invalid or empty audio blob');
        setAudioState('idle');
        if (onAudioStopRef.current) {
          onAudioStopRef.current();
        }
        reject(new Error('Invalid or empty audio blob'));
        return;
      }

      // MOBILE FIX: Nettoyer complètement l'élément audio précédent avant d'en créer un nouveau
      if (audioElementRef.current) {
        console.log('[useVoiceInteraction] Cleaning up previous audio element');
        try {
          audioElementRef.current.pause();
          audioElementRef.current.src = '';
          audioElementRef.current.load();
          audioElementRef.current = null;
        } catch (error) {
          console.warn('[useVoiceInteraction] Error cleaning up previous audio:', error);
        }
      }

      const audioUrl = URL.createObjectURL(audioBlob);
      console.log('[useVoiceInteraction] Created blob URL:', audioUrl.substring(0, 50) + '...');

      const audio = new Audio();
      audioElementRef.current = audio;

      // MOBILE FIX: Configuration pour mobile Safari
      audio.preload = 'auto';
      audio.volume = 1.0;
      console.log('[useVoiceInteraction] Audio element created and configured');

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

      // MOBILE FIX: Timeout pour détecter si play() ne démarre jamais
      let playStarted = false;
      const playTimeoutId = setTimeout(() => {
        if (!playStarted) {
          console.error('[useVoiceInteraction] Audio play() did not start within 5s - forcing cleanup');
          clearTimeout(safetyTimeoutId);
          URL.revokeObjectURL(audioUrl);
          setAudioState('idle');
          audioElementRef.current = null;
          if (onAudioStopRef.current) {
            onAudioStopRef.current();
          }
          reject(new Error('Audio play timeout'));
        }
      }, 5000);

      audio.onended = () => {
        console.log('[useVoiceInteraction] Audio ended normally');
        clearTimeout(safetyTimeoutId);
        clearTimeout(playTimeoutId);
        URL.revokeObjectURL(audioUrl);
        setAudioState('idle');
        audioElementRef.current = null;
        if (onAudioStopRef.current) {
          onAudioStopRef.current();
        }
        resolve();
      };

      audio.onerror = (error) => {
        console.error('[useVoiceInteraction] Audio element error event:', error);
        console.error('[useVoiceInteraction] Audio error details:', {
          error: audio.error,
          code: audio.error?.code,
          message: audio.error?.message,
        });
        clearTimeout(safetyTimeoutId);
        clearTimeout(playTimeoutId);
        URL.revokeObjectURL(audioUrl);
        setAudioState('idle');
        audioElementRef.current = null;
        if (onAudioStopRef.current) {
          onAudioStopRef.current();
        }
        reject(new Error(`Audio error: ${audio.error?.message || 'Unknown error'}`));
      };

      // Appeler onAudioStart quand l'audio commence VRAIMENT à jouer
      audio.onplaying = () => {
        console.log('[useVoiceInteraction] Audio PLAYING event - audio is actually playing now!');
        playStarted = true;
        clearTimeout(playTimeoutId);
        if (onAudioStartRef.current) {
          onAudioStartRef.current();
        }
      };

      // MOBILE FIX: Détecter quand l'audio est chargé
      audio.onloadeddata = () => {
        console.log('[useVoiceInteraction] Audio data loaded successfully');
      };

      audio.oncanplay = () => {
        console.log('[useVoiceInteraction] Audio can start playing (canplay event)');
      };

      // MOBILE FIX: Gérer l'interruption audio (appel entrant, changement d'app, etc.)
      audio.onpause = () => {
        console.log('[useVoiceInteraction] Audio paused (possibly interrupted on mobile)');
        console.log('[useVoiceInteraction] Audio state:', {
          paused: audio.paused,
          ended: audio.ended,
          currentTime: audio.currentTime,
          duration: audio.duration,
          explicitlyStopped: audioExplicitlyStoppedRef.current
        });

        // Si on n'a pas explicitement arrêté l'audio et qu'il n'est pas fini, essayer de reprendre
        if (!audioExplicitlyStoppedRef.current && !audio.ended && audioElementRef.current === audio) {
          console.log('[useVoiceInteraction] Audio was paused unexpectedly, attempting to resume...');

          // MOBILE FIX: Tenter de reprendre immédiatement (crucial pour mobile)
          console.log('[useVoiceInteraction] Immediate resume attempt...');
          audio.play().catch(immediateErr => {
            console.warn('[useVoiceInteraction] Immediate resume failed:', immediateErr);

            // Si la reprise immédiate échoue, attendre un peu et réessayer
            setTimeout(() => {
              if (audio.paused && audioElementRef.current === audio && !audioExplicitlyStoppedRef.current && !audio.ended) {
                console.log('[useVoiceInteraction] Delayed resume attempt...');
                audio.play().catch(delayedErr => {
                  console.warn('[useVoiceInteraction] Delayed resume also failed:', delayedErr);
                  // Si les deux tentatives échouent, c'est probablement une restriction du navigateur
                  // Ne pas nettoyer ici - laisser l'audio se terminer naturellement ou le safety timeout
                });
              }
            }, 100);
          });
        }
      };

      audio.onwaiting = () => {
        console.log('[useVoiceInteraction] Audio waiting for data (buffering)');
      };

      audio.onstalled = () => {
        console.warn('[useVoiceInteraction] Audio stalled (network issue?)');
      };

      // MOBILE FIX: Tenter de reprendre la lecture si l'audio est suspendu
      const handleVisibilityChange = () => {
        if (document.visibilityState === 'visible' && audio.paused && audioElementRef.current === audio && !audioExplicitlyStoppedRef.current) {
          console.log('[useVoiceInteraction] Page visible again, attempting to resume audio');
          audio.play().catch(err => {
            console.warn('[useVoiceInteraction] Could not resume audio:', err);
          });
        }
      };

      document.addEventListener('visibilitychange', handleVisibilityChange);

      // Cleanup de l'event listener quand l'audio se termine
      audio.addEventListener('ended', () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }, { once: true });

      // MOBILE FIX: Définir la source APRÈS avoir configuré tous les event listeners
      console.log('[useVoiceInteraction] Setting audio src and loading...');
      audio.src = audioUrl;
      audio.load(); // Force le chargement

      // MOBILE FIX: Attendre que l'audio soit chargé avant de jouer
      const attemptPlay = () => {
        console.log('[useVoiceInteraction] Attempting to play audio...');
        console.log('[useVoiceInteraction] Audio state before play:', {
          readyState: audio.readyState,
          paused: audio.paused,
          ended: audio.ended,
          duration: audio.duration,
        });

        setAudioState('playing');

        const playPromise = audio.play();
        console.log('[useVoiceInteraction] play() called, promise:', playPromise);

        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              console.log('[useVoiceInteraction] play() promise resolved successfully!');
              console.log('[useVoiceInteraction] Audio state after play:', {
                paused: audio.paused,
                currentTime: audio.currentTime,
                duration: audio.duration,
              });
            })
            .catch((error) => {
              console.error('[useVoiceInteraction] play() promise rejected:', error);
              console.error('[useVoiceInteraction] Error name:', error.name);
              console.error('[useVoiceInteraction] Error message:', error.message);
              clearTimeout(safetyTimeoutId);
              clearTimeout(playTimeoutId);
              URL.revokeObjectURL(audioUrl);
              setAudioState('idle');
              audioElementRef.current = null;
              document.removeEventListener('visibilitychange', handleVisibilityChange);
              if (onAudioStopRef.current) {
                onAudioStopRef.current();
              }
              reject(error);
            });
        } else {
          console.warn('[useVoiceInteraction] play() did not return a promise (old browser?)');
        }
      };

      // Si l'audio est déjà prêt, jouer immédiatement
      if (audio.readyState >= 2) { // HAVE_CURRENT_DATA
        console.log('[useVoiceInteraction] Audio already ready, playing immediately');
        attemptPlay();
      } else {
        // Sinon, attendre l'événement canplay
        console.log('[useVoiceInteraction] Audio not ready yet, waiting for canplay...');
        audio.addEventListener('canplay', () => {
          console.log('[useVoiceInteraction] canplay event received, now attempting play');
          attemptPlay();
        }, { once: true });

        // Timeout si canplay ne se déclenche jamais
        setTimeout(() => {
          if (audio.readyState < 2) {
            console.error('[useVoiceInteraction] Audio not ready after 3s, forcing play anyway');
            attemptPlay();
          }
        }, 3000);
      }
    });
  }, [unlockAudioContext]); // Dépendance nécessaire pour unlockAudioContext

  // Fonction pour arrêter immédiatement la lecture audio de Peter
  const stopAudio = useCallback(() => {
    console.log('[useVoiceInteraction] Stopping audio playback - User wants to speak');

    // Marquer que l'audio a été explicitement arrêté (pour empêcher la reprise automatique)
    audioExplicitlyStoppedRef.current = true;

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
    checkMediaRecorderSupport,
    reset,
    recoverFromError,
  };
}
