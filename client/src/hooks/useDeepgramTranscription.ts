import { useRef, useCallback, useEffect } from 'react';
import { readStoredSessionFlow } from '@/lib/sessionFlowStorage';

export interface DeepgramHook {
  start: (
    stream: MediaStream,
    onTranscript: (text: string, isFinal: boolean) => void,
  ) => void;
  stop: () => void;
}

export function useDeepgramTranscription(): DeepgramHook {
  const wsRef = useRef<WebSocket | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);

  const stop = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder) {
      try {
        if (recorder.state !== 'inactive') {
          recorder.stop();
        }
      } catch {}
      recorderRef.current = null;
    }
    const ws = wsRef.current;
    if (ws) {
      try {
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close(1000, 'client_stop');
        }
      } catch {}
      wsRef.current = null;
    }
  }, []);

  const start = useCallback(
    (
      stream: MediaStream,
      onTranscript: (text: string, isFinal: boolean) => void,
    ) => {
      stop();

      const mimeType = MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported?.('audio/webm')
          ? 'audio/webm'
          : '';

      if (!mimeType) {
        console.warn('[Deepgram] No supported MIME type for live transcription');
        return;
      }

      // Récupérer les credentials de session pour authentifier le WS
      const stored = readStoredSessionFlow();
      const sessionId = stored?.sessionId;
      const token = stored?.accessToken;
      if (!sessionId || !token) {
        console.warn('[Deepgram] No session token available — skipping live transcription');
        return;
      }

      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const params = new URLSearchParams({ lang: 'fr', sessionId, token });
        const wsUrl = `${protocol}//${window.location.host}/ws/deepgram?${params.toString()}`;
        const ws = new WebSocket(wsUrl);
        ws.binaryType = 'arraybuffer';
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[Deepgram] WebSocket open, starting parallel recorder');
          try {
            const recorder = new MediaRecorder(stream, { mimeType });
            recorderRef.current = recorder;

            recorder.ondataavailable = async (event) => {
              if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
                try {
                  const buf = await event.data.arrayBuffer();
                  if (ws.readyState === WebSocket.OPEN) {
                    ws.send(buf);
                  }
                } catch (err) {
                  console.warn('[Deepgram] Failed to send chunk:', err);
                }
              }
            };

            recorder.start(250);
          } catch (err) {
            console.warn('[Deepgram] Failed to start parallel recorder:', err);
            try { ws.close(); } catch {}
          }
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'transcript' && typeof msg.transcript === 'string') {
              onTranscript(msg.transcript, !!msg.isFinal);
            }
          } catch (err) {
            console.warn('[Deepgram] Failed to parse message:', err);
          }
        };

        ws.onerror = (event) => {
          console.warn('[Deepgram] WebSocket error', event);
        };

        ws.onclose = () => {
          console.log('[Deepgram] WebSocket closed');
          const recorder = recorderRef.current;
          if (recorder && recorder.state !== 'inactive') {
            try { recorder.stop(); } catch {}
          }
          recorderRef.current = null;
        };
      } catch (err) {
        console.warn('[Deepgram] Failed to start live transcription:', err);
        stop();
      }
    },
    [stop],
  );

  // Cleanup automatique au démontage du hook (si jamais l'utilisateur quitte
  // l'écran pendant un enregistrement, on ferme proprement le WS Deepgram).
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { start, stop };
}
