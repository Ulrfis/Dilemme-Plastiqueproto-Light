import WebSocket, { WebSocketServer } from 'ws';
import type { Server, IncomingMessage } from 'http';
import { storage } from './storage';

const DEEPGRAM_PATH = '/ws/deepgram';

// Security & robustness limits
const MAX_BUFFERED_CHUNKS = 40;          // ~10s of 250ms webm chunks before we drop oldest
const MAX_BUFFERED_BYTES = 4 * 1024 * 1024; // hard cap 4MB total in buffer
const UPSTREAM_OPEN_TIMEOUT_MS = 8_000;  // close client if Deepgram doesn't open in 8s
const MAX_CONCURRENT_PER_IP = 3;         // anti-abuse: cap concurrent live transcriptions per IP
const MAX_SESSION_DURATION_MS = 5 * 60 * 1000; // hard kill after 5 min (tutorial is short)

const concurrentByIp = new Map<string, number>();

function clientIp(req: IncomingMessage): string {
  // On utilise toujours l'IP de la socket TCP réelle pour l'attribution
  // anti-abus. `x-forwarded-for` est contrôlable par le client tant qu'on
  // n'a pas configuré explicitement un reverse proxy de confiance, donc
  // on l'ignore ici.
  return req.socket.remoteAddress || 'unknown';
}

// Connexion directe à l'API WebSocket live de Deepgram
// (le SDK Node v5 n'expose plus l'API live transcription).
function buildDeepgramUrl(language: string): string {
  const params = new URLSearchParams({
    model: 'nova-2',
    language,
    interim_results: 'true',
    smart_format: 'true',
    punctuate: 'true',
    endpointing: '300',
    encoding: 'opus',
    sample_rate: '48000',
    channels: '1',
  });
  return `wss://api.deepgram.com/v1/listen?${params.toString()}`;
}

export function attachDeepgramRelay(server: Server) {
  const apiKey = process.env.DEEPGRAM_API_KEY;
  if (!apiKey) {
    console.warn('[Deepgram] No DEEPGRAM_API_KEY — live transcription disabled');
    return;
  }

  const wss = new WebSocketServer({ noServer: true });

  server.on('upgrade', async (req: IncomingMessage, socket: any, head: Buffer) => {
    let url: URL;
    try {
      url = new URL(req.url || '', `http://${req.headers.host}`);
    } catch {
      return; // Pas notre route
    }
    if (url.pathname !== DEEPGRAM_PATH) {
      return; // Laisse Vite HMR (ou autre) gérer
    }

    // === AUTH: vérifier le session token avant tout ===
    const sessionId = url.searchParams.get('sessionId') || '';
    const token = url.searchParams.get('token') || '';
    if (!sessionId || !token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }
    let session;
    try {
      session = await storage.getSession(sessionId);
    } catch (err) {
      console.warn('[Deepgram] Session lookup failed:', err);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
      return;
    }
    if (!session || session.accessToken !== token) {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }

    // === Rate limit: max N connexions concurrentes par IP ===
    const ip = clientIp(req);
    const current = concurrentByIp.get(ip) || 0;
    if (current >= MAX_CONCURRENT_PER_IP) {
      console.warn('[Deepgram] Too many concurrent connections from', ip);
      socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
      socket.destroy();
      return;
    }

    // Décrément garanti si la socket meurt avant que l'upgrade aboutisse
    let counted = false;
    const decrementOnce = () => {
      if (!counted) return;
      counted = false;
      const n = concurrentByIp.get(ip) || 0;
      if (n <= 1) concurrentByIp.delete(ip);
      else concurrentByIp.set(ip, n - 1);
    };
    socket.once('close', () => {
      // Si on a incrémenté mais que la connexion `wss.connection` n'a pas pris
      // le relais (ex: upgrade qui échoue silencieusement), on libère ici.
      // Si la connexion s'est faite normalement, le cleanup() ws-level libère
      // déjà — le flag `counted` empêche un double-décrément.
      decrementOnce();
    });

    // On incrémente APRÈS avoir attaché le hook de socket close,
    // pour qu'il n'y ait pas de fenêtre où le compteur reste bloqué.
    concurrentByIp.set(ip, current + 1);
    counted = true;

    wss.handleUpgrade(req, socket, head, (ws) => {
      (ws as any)._dg_ip = ip;
      (ws as any)._dg_decrementOnce = () => {
        // Le cleanup ws-level reprend la main sur la libération.
        decrementOnce();
      };
      wss.emit('connection', ws, req);
    });
  });

  wss.on('connection', (clientWs: WebSocket, req: IncomingMessage) => {
    const ip = (clientWs as any)._dg_ip as string;
    let language = 'fr';
    try {
      const url = new URL(req.url || '', `http://${req.headers.host}`);
      language = url.searchParams.get('lang') || 'fr';
    } catch {}

    console.log('[Deepgram] Client connected (ip=' + ip + ', lang=' + language + ')');

    const upstreamUrl = buildDeepgramUrl(language);
    let upstream: WebSocket | null = null;
    let upstreamReady = false;
    const audioBuffer: Buffer[] = [];
    let audioBufferBytes = 0;
    let closed = false;
    let openTimeout: NodeJS.Timeout | null = null;
    let hardKillTimeout: NodeJS.Timeout | null = null;

    const releaseIp = () => {
      // Délègue au décrément idempotent attaché à la socket dans le handler upgrade
      const dec = (clientWs as any)._dg_decrementOnce as (() => void) | undefined;
      if (dec) dec();
    };

    const cleanup = (code = 1000, reason = 'normal') => {
      if (closed) return;
      closed = true;
      if (openTimeout) { clearTimeout(openTimeout); openTimeout = null; }
      if (hardKillTimeout) { clearTimeout(hardKillTimeout); hardKillTimeout = null; }
      try {
        if (upstream && upstream.readyState === WebSocket.OPEN) {
          try { upstream.send(JSON.stringify({ type: 'CloseStream' })); } catch {}
        }
      } catch {}
      try { upstream?.close(code, reason); } catch {}
      try {
        if (clientWs.readyState === WebSocket.OPEN || clientWs.readyState === WebSocket.CONNECTING) {
          clientWs.close(code, reason);
        }
      } catch {}
      upstream = null;
      audioBuffer.length = 0;
      audioBufferBytes = 0;
      releaseIp();
    };

    // Hard kill après MAX_SESSION_DURATION_MS pour empêcher des connexions zombies
    hardKillTimeout = setTimeout(() => {
      console.warn('[Deepgram] Session duration cap reached, closing');
      cleanup(1000, 'session_duration_cap');
    }, MAX_SESSION_DURATION_MS);

    try {
      upstream = new WebSocket(upstreamUrl, {
        headers: { Authorization: `Token ${apiKey}` },
      });
    } catch (err) {
      console.error('[Deepgram] Failed to open upstream:', err);
      cleanup(1011, 'upstream_open_failed');
      return;
    }

    // Timeout d'ouverture upstream
    openTimeout = setTimeout(() => {
      if (!upstreamReady) {
        console.warn('[Deepgram] Upstream open timeout, closing');
        cleanup(1011, 'upstream_open_timeout');
      }
    }, UPSTREAM_OPEN_TIMEOUT_MS);

    upstream.on('open', () => {
      console.log('[Deepgram] Upstream WebSocket open');
      upstreamReady = true;
      if (openTimeout) { clearTimeout(openTimeout); openTimeout = null; }
      while (audioBuffer.length > 0) {
        const chunk = audioBuffer.shift();
        if (chunk) audioBufferBytes -= chunk.length;
        if (chunk && upstream && upstream.readyState === WebSocket.OPEN) {
          try { upstream.send(chunk); } catch (err) {
            console.warn('[Deepgram] Upstream send buffered failed:', err);
          }
        }
      }
    });

    upstream.on('message', (data) => {
      try {
        const text = typeof data === 'string' ? data : data.toString('utf-8');
        const msg = JSON.parse(text);
        if (msg.type === 'Results') {
          const transcript: string | undefined = msg?.channel?.alternatives?.[0]?.transcript;
          const isFinal = !!msg?.is_final;
          if (transcript && transcript.length > 0 && clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({ type: 'transcript', transcript, isFinal }));
          }
        }
      } catch {
        // Ignorer messages non-JSON (Metadata, SpeechStarted, etc.)
      }
    });

    upstream.on('error', (err) => {
      console.error('[Deepgram] Upstream error:', err?.message || err);
      if (clientWs.readyState === WebSocket.OPEN) {
        try {
          clientWs.send(JSON.stringify({ type: 'error', message: 'transcription_error' }));
        } catch {}
      }
      cleanup(1011, 'upstream_error');
    });

    upstream.on('close', (code, reason) => {
      console.log('[Deepgram] Upstream closed:', code, reason?.toString());
      cleanup(1000, 'upstream_closed');
    });

    clientWs.on('message', (data, isBinary) => {
      if (!upstream || !isBinary) return;
      const buf = Buffer.isBuffer(data)
        ? data
        : Array.isArray(data)
          ? Buffer.concat(data)
          : Buffer.from(data as ArrayBuffer);
      if (upstreamReady && upstream.readyState === WebSocket.OPEN) {
        try { upstream.send(buf); } catch (err) {
          console.warn('[Deepgram] Upstream send chunk failed:', err);
        }
      } else {
        // Plafonner le buffer pour éviter une fuite mémoire si Deepgram est lent
        audioBuffer.push(buf);
        audioBufferBytes += buf.length;
        while (
          (audioBuffer.length > MAX_BUFFERED_CHUNKS || audioBufferBytes > MAX_BUFFERED_BYTES)
          && audioBuffer.length > 0
        ) {
          const dropped = audioBuffer.shift();
          if (dropped) audioBufferBytes -= dropped.length;
        }
      }
    });

    clientWs.on('close', () => {
      console.log('[Deepgram] Client disconnected, cleaning up upstream');
      cleanup(1000, 'client_closed');
    });

    clientWs.on('error', (err) => {
      console.error('[Deepgram] Client WS error:', err);
      cleanup(1011, 'client_error');
    });
  });

  console.log('[Deepgram] Live transcription relay attached at', DEEPGRAM_PATH);
}
