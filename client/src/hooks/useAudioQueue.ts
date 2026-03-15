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
  skipIndex: (index: number) => void;
  clear: () => void;
  reset: () => void;
  pause: () => void;
  resume: () => void;
  isPlaying: boolean;
  queueLength: number;
}

export function useAudioQueue(options: UseAudioQueueOptions): UseAudioQueueResult {
  const { playAudio, onQueueEmpty, onPlaybackStart } = options;

  const [isPlaying, setIsPlaying] = useState(false);
  const [queueLength, setQueueLength] = useState(0);

  const queueRef = useRef<AudioQueueItem[]>([]);
  const isProcessingRef = useRef(false);
  const nextExpectedIndexRef = useRef(1);
  const skippedIndicesRef = useRef<Set<number>>(new Set());
  const pausedRef = useRef(false);

  const advancePastSkipped = useCallback(() => {
    while (skippedIndicesRef.current.has(nextExpectedIndexRef.current)) {
      console.log('[AudioQueue] Advancing past skipped index #' + nextExpectedIndexRef.current);
      skippedIndicesRef.current.delete(nextExpectedIndexRef.current);
      nextExpectedIndexRef.current++;
    }
  }, []);

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current || pausedRef.current) {
      return;
    }

    advancePastSkipped();

    if (queueRef.current.length === 0) {
      setIsPlaying(false);
      setQueueLength(0);
      if (onQueueEmpty) {
        onQueueEmpty();
      }
      return;
    }

    const nextItem = queueRef.current[0];
    if (nextItem.index > nextExpectedIndexRef.current) {
      console.log('[AudioQueue] Waiting for sentence #' + nextExpectedIndexRef.current +
                  ' (queue has #' + nextItem.index + ')');
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

    console.log('[AudioQueue] Playing sentence #' + item.index + ' (expected: #' + nextExpectedIndexRef.current + '):',
                item.sentence.substring(0, 50) + '...');

    // Update the next expected index
    nextExpectedIndexRef.current = item.index + 1;

    // Notify that playback is starting (for first item)
    if (onPlaybackStart && item.index === 1) {
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
  }, [playAudio, onQueueEmpty, onPlaybackStart, advancePastSkipped]);

  // Add item to queue and start processing if not already running
  // CRITICAL FIX: Insert in sorted order by index to ensure correct playback order
  // TTS requests complete in arbitrary order, but we must play sentences sequentially
  const enqueue = useCallback((blob: Blob, sentence: string, index: number) => {
    console.log('[AudioQueue] Enqueuing sentence #' + index + ' (', blob.size, 'bytes)',
                '- Expected: #' + nextExpectedIndexRef.current);

    // Insert in sorted position by index (ascending order)
    const queue = queueRef.current;
    let insertPosition = queue.length; // Default: end of queue

    for (let i = 0; i < queue.length; i++) {
      if (queue[i].index > index) {
        insertPosition = i;
        break;
      }
    }

    // Insert at the correct position to maintain order
    queue.splice(insertPosition, 0, { blob, sentence, index });
    console.log('[AudioQueue] Inserted at position', insertPosition, '- Queue order:', queue.map(q => q.index).join(', '));

    setQueueLength(queue.length);

    // Start processing if not already running, OR if this is the expected sentence
    // (the expected sentence might have arrived after others were queued)
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
    nextExpectedIndexRef.current = 1;
    skippedIndicesRef.current.clear();
    pausedRef.current = false;

    if (onQueueEmpty) {
      onQueueEmpty();
    }
  }, [onQueueEmpty]);

  const reset = useCallback(() => {
    console.log('[AudioQueue] Resetting expected index to 1');
    nextExpectedIndexRef.current = 1;
    skippedIndicesRef.current.clear();
    pausedRef.current = false;
  }, []);

  const pause = useCallback(() => {
    console.log('[AudioQueue] Paused - items will buffer without playing');
    pausedRef.current = true;
  }, []);

  const resume = useCallback(() => {
    console.log('[AudioQueue] Resumed - starting playback of buffered items');
    pausedRef.current = false;
    if (!isProcessingRef.current && queueRef.current.length > 0) {
      processQueue();
    }
  }, [processQueue]);

  const skipIndex = useCallback((index: number) => {
    console.log('[AudioQueue] Skipping failed sentence #' + index);
    if (index === nextExpectedIndexRef.current) {
      nextExpectedIndexRef.current = index + 1;
      advancePastSkipped();
      console.log('[AudioQueue] Advanced expected index to #' + nextExpectedIndexRef.current);
      if (!isProcessingRef.current) {
        processQueue();
      }
    } else if (index > nextExpectedIndexRef.current) {
      skippedIndicesRef.current.add(index);
      console.log('[AudioQueue] Recorded future skip for #' + index);
    }
  }, [processQueue, advancePastSkipped]);

  return {
    enqueue,
    skipIndex,
    clear,
    reset,
    pause,
    resume,
    isPlaying,
    queueLength,
  };
}
