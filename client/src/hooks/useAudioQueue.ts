import { useState, useRef, useCallback } from 'react';

// PHASE 2 OPTIMIZATION: Audio Queue Manager
// Manages sequential playback of audio chunks for streaming TTS
// Allows audio to start playing while more chunks are still being generated

interface AudioQueueItem {
  blob: Blob;
  sentence: string;
  index: number;
}

interface UseAudioQueueOptions {
  playAudio: (blob: Blob) => Promise<void>;
  onQueueEmpty?: () => void;
  onPlaybackStart?: () => void;
}

interface UseAudioQueueResult {
  enqueue: (blob: Blob, sentence: string, index: number) => void;
  clear: () => void;
  isPlaying: boolean;
  queueLength: number;
}

export function useAudioQueue(options: UseAudioQueueOptions): UseAudioQueueResult {
  const { playAudio, onQueueEmpty, onPlaybackStart } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [queueLength, setQueueLength] = useState(0);

  const queueRef = useRef<AudioQueueItem[]>([]);
  const isProcessingRef = useRef(false);

  // Process queue sequentially
  const processQueue = useCallback(async () => {
    // Prevent concurrent processing
    if (isProcessingRef.current) {
      console.log('[AudioQueue] Already processing queue');
      return;
    }

    if (queueRef.current.length === 0) {
      console.log('[AudioQueue] Queue empty, stopping playback');
      setIsPlaying(false);
      setQueueLength(0);
      if (onQueueEmpty) {
        onQueueEmpty();
      }
      return;
    }

    isProcessingRef.current = true;
    setIsPlaying(true);

    console.log('[AudioQueue] Processing queue, items:', queueRef.current.length);

    // Get next item from queue
    const item = queueRef.current.shift();
    setQueueLength(queueRef.current.length);

    if (!item) {
      isProcessingRef.current = false;
      setIsPlaying(false);
      return;
    }

    console.log('[AudioQueue] Playing sentence #' + item.index + ':', item.sentence.substring(0, 50) + '...');

    // Notify that playback is starting (for first item)
    if (onPlaybackStart && queueRef.current.length === 0 && isProcessingRef.current) {
      onPlaybackStart();
    }

    try {
      // Play audio (waits for completion)
      await playAudio(item.blob);
      console.log('[AudioQueue] Finished playing sentence #' + item.index);
    } catch (error) {
      console.error('[AudioQueue] Error playing audio:', error);
      // Continue to next item even if this one fails
    }

    isProcessingRef.current = false;

    // Process next item (recursive)
    await processQueue();
  }, [playAudio, onQueueEmpty, onPlaybackStart]);

  // Add item to queue and start processing if not already running
  const enqueue = useCallback((blob: Blob, sentence: string, index: number) => {
    console.log('[AudioQueue] Enqueuing sentence #' + index + ' (', blob.size, 'bytes)');

    queueRef.current.push({ blob, sentence, index });
    setQueueLength(queueRef.current.length);

    // Start processing if not already running
    if (!isProcessingRef.current) {
      console.log('[AudioQueue] Starting queue processing');
      processQueue();
    }
  }, [processQueue]);

  // Clear queue and stop playback
  const clear = useCallback(() => {
    console.log('[AudioQueue] Clearing queue (had', queueRef.current.length, 'items)');
    queueRef.current = [];
    setQueueLength(0);
    isProcessingRef.current = false;
    setIsPlaying(false);

    if (onQueueEmpty) {
      onQueueEmpty();
    }
  }, [onQueueEmpty]);

  return {
    enqueue,
    clear,
    isPlaying,
    queueLength,
  };
}
