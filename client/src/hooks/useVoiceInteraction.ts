import { useState, useRef, useCallback } from 'react';

export type AudioState = 'idle' | 'recording' | 'processing' | 'playing' | 'error';

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

export function useVoiceInteraction(): UseVoiceInteractionResult {
  const [audioState, setAudioState] = useState<AudioState>('idle');
  const [transcription, setTranscription] = useState('');
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioElementRef = useRef<HTMLAudioElement | null>(null);

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
        resolve(null);
        return;
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        
        setAudioState('processing');

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, 'recording.webm');

          const response = await fetch('/api/speech-to-text', {
            method: 'POST',
            body: formData,
          });

          if (!response.ok) {
            throw new Error('Transcription failed');
          }

          const data = await response.json();
          setTranscription(data.text);
          resolve(data.text);
        } catch (error) {
          console.error('Error transcribing audio:', error);
          setAudioState('error');
          resolve(null);
        }
      };

      mediaRecorder.stop();
    });
  }, []);

  const playAudio = useCallback(async (audioBlob: Blob): Promise<void> => {
    return new Promise((resolve, reject) => {
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioElementRef.current = audio;

      setAudioState('playing');

      audio.onended = () => {
        URL.revokeObjectURL(audioUrl);
        setAudioState('idle');
        resolve();
      };

      audio.onerror = (error) => {
        URL.revokeObjectURL(audioUrl);
        setAudioState('error');
        reject(error);
      };

      audio.play().catch((error) => {
        console.error('Error playing audio:', error);
        setAudioState('error');
        reject(error);
      });
    });
  }, []);

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
  }, []);

  const reset = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (audioElementRef.current) {
      audioElementRef.current.pause();
      audioElementRef.current = null;
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
