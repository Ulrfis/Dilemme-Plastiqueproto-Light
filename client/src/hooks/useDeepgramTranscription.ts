import { useRef, useCallback, useEffect } from 'react';
import { readStoredSessionFlow } from '@/lib/sessionFlowStorage';
import { captureEvent } from '@/App';

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
  const sessionStartedAtRef = useRef(0);
  const firstInterimCapturedRef = useRef(false);

  const stop = useCallback(() => {
    const sessionStart = sessionStartedAtRef.current;
    if (sessionStart > 0) {
      captureEvent('deepgram_session', {
        duration_ms: Date.now() - sessionStart,
        had_first_interim: firstInterimCapturedRef.current,
      });
      sessionStartedAtRef.current = 0;
      firstInterimCapturedRef.current = false;
    }

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

      sessionStartedAtRef.current = Date.now();
      firstInterimCapturedRef.current = false;

      const mimeType = MediaRecorder.isTypeSupported?.('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported?.('audio/webm')
          ? 'audio/webm'
          : '';

      if (!mimeType) {
        console.warn('[Deepgram] No supported MIME type for live transcription');
        return;
      }

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
        const dgConnectStart = Date.now();

        ws.onopen = () => {
          captureEvent('deepgram_ws_connected', {
            connect_ms: Date.now() - dgConnectStart,
          });
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
              const text = msg.transcript;
              const isFinal = !!msg.isFinal;
              if (!firstInterimCapturedRef.current && text.trim() && !isFinal) {
                firstInterimCapturedRef.current = true;
                captureEvent('deepgram_first_interim', {
                  latency_ms: Date.now() - sessionStartedAtRef.current,
                });
              }
              onTranscript(text, isFinal);
            }
          } catch (err) {
            console.warn('[Deepgram] Failed to parse message:', err);
          }
        };

        ws.onerror = (event) => {
          console.warn('[Deepgram] WebSocket error', event);
          captureEvent('api_error', {
            endpoint: 'deepgram/listen',
            context: 'deepgram_ws_error',
            fallback_triggered: true,
          });
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

  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  return { start, stop };
}
