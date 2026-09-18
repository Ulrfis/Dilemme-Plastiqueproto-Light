/**
 * Sonde l'API WebSocket de Gradium depuis le serveur, pour lever les inconnues
 * qui bloquent le passage au streaming TTS.
 *
 * Pourquoi côté serveur plutôt qu'en ligne de commande : la clé Gradium et
 * l'accès réseau vivent ici. Mesurer depuis la machine qui sert réellement les
 * élèves donne aussi des chiffres plus représentatifs que depuis un poste de
 * travail. Exposé par `GET /api/health/gradium-probe`.
 *
 * Trois questions :
 *
 *   1. FRÉQUENCE D'ÉCHANTILLONNAGE — le SDK Gradium fixe 48 kHz, ses propres
 *      types documentent 24 kHz. Se tromper donne une voix trop aiguë ou trop
 *      grave. Déduite du volume d'octets PCM reçu.
 *   2. RÉACTIVITÉ — temps jusqu'au premier octet audio, comparé au REST actuel
 *      qui bufferise tout avant de servir. C'est l'écart qui dit si le chantier
 *      streaming vaut son coût.
 *   3. MULTIPLEXAGE — `close_ws_on_eos` + `client_req_id` permettent-ils de
 *      partager une socket entre générations ? Absents du SDK, à confirmer.
 *
 * Ne modifie rien : génère trois courtes phrases et mesure.
 */
import WebSocket from 'ws';
import { gradiumFetch } from './gradium-agent.ts';

/** Phrase de référence : français courant, longueur d'une réplique de Peter. */
const PROBE_TEXT =
  'Bonjour, je suis Peter. Regarde bien cette image et raconte-moi ce qui attire ton attention.';

/** Octets par échantillon en PCM 16 bits mono. */
const BYTES_PER_SAMPLE = 2;

/** Débit de parole français, voix posée. Sert à estimer la durée attendue. */
const CHARS_PER_SECOND = 14;

const REST_URL = 'https://api.gradium.ai/api/post/speech/tts';
const CONNECT_TIMEOUT_MS = 15_000;
const GENERATION_TIMEOUT_MS = 30_000;

export interface GenerationMeasure {
  readyMs: number;
  /** Temps jusqu'au premier octet audio. */
  firstAudioMs: number | null;
  totalMs: number;
  bytes: number;
  chunkCount: number;
  clientReqIdEcho: string | null;
}

export interface GradiumProbeResult {
  ok: boolean;
  wsUrl: string;
  /** Vrai si l'hôte régional a échoué et qu'on est retombé sur l'hôte global. */
  usedFallbackHost: boolean;
  sampleRate: {
    bytes: number;
    samples: number;
    estimatedSeconds: number;
    impliedHz: number;
    verdictHz: number;
    /** Écart relatif au candidat retenu. Au-delà de ~15 %, l'estimation est douteuse. */
    confidence: 'bonne' | 'moyenne' | 'faible';
  } | null;
  reactivity: {
    ws: GenerationMeasure | null;
    restTotalMs: number | null;
    restBytes: number | null;
    /** Ce que le streaming ferait gagner sur le premier son, en ms. */
    gainMs: number | null;
  };
  multiplexing: {
    supported: boolean;
    detail: string;
  };
  /** Résumé en français, lisible sans interpréter le JSON. */
  resume: string[];
  errors: string[];
}

export function inferSampleRate(bytes: number, text: string) {
  const samples = bytes / BYTES_PER_SAMPLE;
  const estimatedSeconds = text.length / CHARS_PER_SECOND;
  const impliedHz = samples / estimatedSeconds;
  const candidates = [16000, 22050, 24000, 44100, 48000];
  const verdictHz = candidates.reduce((a, b) =>
    Math.abs(b - impliedHz) < Math.abs(a - impliedHz) ? b : a,
  );
  const drift = Math.abs(impliedHz - verdictHz) / verdictHz;
  const confidence = drift < 0.08 ? 'bonne' : drift < 0.2 ? 'moyenne' : 'faible';
  return { bytes, samples, estimatedSeconds, impliedHz, verdictHz, confidence } as const;
}

function connect(wsUrl: string, apiKey: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl, { headers: { 'x-api-key': apiKey } });
    const timer = setTimeout(() => {
      try { ws.terminate(); } catch { /* déjà fermée */ }
      reject(new Error(`Connexion non établie en ${CONNECT_TIMEOUT_MS} ms`));
    }, CONNECT_TIMEOUT_MS);

    ws.once('open', () => {
      clearTimeout(timer);
      resolve(ws);
    });
    ws.once('error', (err: Error) => {
      clearTimeout(timer);
      reject(new Error(err?.message || 'Erreur WebSocket'));
    });
  });
}

/**
 * Lance une génération et mesure. `extraSetup` sert à tester le multiplexage ;
 * `socket` permet de réutiliser une connexion déjà ouverte.
 */
function generate(opts: {
  ws: WebSocket;
  text: string;
  outputFormat: string;
  voiceId: string;
  extraSetup?: Record<string, unknown>;
}): Promise<GenerationMeasure> {
  const { ws, text, outputFormat, voiceId, extraSetup = {} } = opts;

  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    let readyAt = 0;
    let firstAudioAt = 0;
    let bytes = 0;
    let chunkCount = 0;
    let clientReqIdEcho: string | null = null;
    let settled = false;

    const timer = setTimeout(
      () => finish(new Error(`Génération non terminée en ${GENERATION_TIMEOUT_MS} ms`)),
      GENERATION_TIMEOUT_MS,
    );

    function finish(err: Error | null, value?: GenerationMeasure) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.off('message', onMessage);
      ws.off('error', onError);
      err ? reject(err) : resolve(value!);
    }

    function onError(err: Error) {
      finish(new Error(err?.message || 'Erreur WebSocket'));
    }

    function onMessage(data: WebSocket.RawData) {
      let msg: Record<string, any>;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return; // Le protocole est en JSON ; toute autre trame est ignorée.
      }

      switch (msg.type) {
        case 'ready':
          readyAt = Date.now();
          ws.send(JSON.stringify({ type: 'text', text }));
          ws.send(JSON.stringify({ type: 'end_of_stream' }));
          break;
        case 'audio':
          if (firstAudioAt === 0) firstAudioAt = Date.now();
          chunkCount += 1;
          bytes += Buffer.from(msg.audio, 'base64').byteLength;
          break;
        case 'end_of_stream':
          if (msg.client_req_id) clientReqIdEcho = String(msg.client_req_id);
          finish(null, {
            readyMs: readyAt > 0 ? readyAt - t0 : 0,
            firstAudioMs: firstAudioAt > 0 ? firstAudioAt - t0 : null,
            totalMs: Date.now() - t0,
            bytes,
            chunkCount,
            clientReqIdEcho,
          });
          break;
        case 'error':
          finish(new Error(`Gradium a refusé : ${msg.message} (code ${msg.code})`));
          break;
      }
    }

    ws.on('message', onMessage);
    ws.on('error', onError);

    ws.send(JSON.stringify({
      type: 'setup',
      voice_id: voiceId,
      output_format: outputFormat,
      model_name: 'default',
      json_config: { language: 'fr' },
      ...extraSetup,
    }));
  });
}

/** Mesure le chemin REST actuel, qui bufferise tout avant de rendre la main. */
async function measureRest(text: string, apiKey: string, voiceId: string) {
  const t0 = Date.now();
  const response = await gradiumFetch(REST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    body: JSON.stringify({
      text,
      voice_id: voiceId,
      model_name: 'default',
      output_format: 'wav',
      only_audio: true,
      json_config: { language: 'fr' },
    }),
  });

  if (!response.ok) throw new Error(`REST ${response.status}`);

  let bytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
    }
  }
  return { totalMs: Date.now() - t0, bytes };
}

export async function runGradiumProbe(region = 'eu'): Promise<GradiumProbeResult> {
  const apiKey = process.env.GRADIUM_API_KEY;
  const voiceId = process.env.GRADIUM_VOICE_ID;

  const result: GradiumProbeResult = {
    ok: false,
    wsUrl: '',
    usedFallbackHost: false,
    sampleRate: null,
    reactivity: { ws: null, restTotalMs: null, restBytes: null, gainMs: null },
    multiplexing: { supported: false, detail: 'non testé' },
    resume: [],
    errors: [],
  };

  if (!apiKey || !voiceId) {
    result.errors.push('GRADIUM_API_KEY ou GRADIUM_VOICE_ID absent de l\'environnement.');
    result.resume.push('Les secrets Gradium ne sont pas configurés sur ce serveur.');
    return result;
  }

  // L'hôte régional n'existe pas forcément pour tous les comptes. On bascule
  // automatiquement sur l'hôte global plutôt que de renvoyer une erreur que
  // l'utilisateur devrait diagnostiquer lui-même.
  const hosts = [
    `wss://${region}.api.gradium.ai/api/speech/tts`,
    'wss://api.gradium.ai/api/speech/tts',
  ];

  let ws: WebSocket | null = null;
  for (const [index, host] of hosts.entries()) {
    try {
      ws = await connect(host, apiKey);
      result.wsUrl = host;
      result.usedFallbackHost = index > 0;
      break;
    } catch (err) {
      result.errors.push(`${host} — ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (!ws) {
    result.resume.push('Aucun hôte WebSocket Gradium n\'a répondu. Le streaming est hors de portée depuis ce serveur.');
    return result;
  }

  try {
    // ── 1 et 2 : fréquence d'échantillonnage et réactivité ──────────────────
    const pcm = await generate({ ws, text: PROBE_TEXT, outputFormat: 'pcm', voiceId });
    result.reactivity.ws = pcm;
    result.sampleRate = inferSampleRate(pcm.bytes, PROBE_TEXT);

    result.resume.push(
      `Fréquence d'échantillonnage probable : ${result.sampleRate.verdictHz} Hz ` +
      `(confiance ${result.sampleRate.confidence}). À confirmer à l'oreille.`,
    );
    result.resume.push(
      `Premier son en ${pcm.firstAudioMs ?? '?'} ms, dernier octet à ${pcm.totalMs} ms ` +
      `(${pcm.chunkCount} morceaux).`,
    );
  } catch (err) {
    result.errors.push(`Génération PCM — ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    try { ws.close(); } catch { /* déjà fermée */ }
  }

  // ── REST, pour comparaison ────────────────────────────────────────────────
  try {
    const rest = await measureRest(PROBE_TEXT, apiKey, voiceId);
    result.reactivity.restTotalMs = rest.totalMs;
    result.reactivity.restBytes = rest.bytes;

    const wsFirst = result.reactivity.ws?.firstAudioMs ?? null;
    if (wsFirst != null) {
      result.reactivity.gainMs = rest.totalMs - wsFirst;
      result.resume.push(
        `Le chemin actuel (REST) ne sert rien avant ${rest.totalMs} ms. ` +
        `Le streaming démarrerait à ${wsFirst} ms, soit ${result.reactivity.gainMs} ms gagnés par bloc.`,
      );
    }
  } catch (err) {
    result.errors.push(`REST — ${err instanceof Error ? err.message : String(err)}`);
  }

  // ── 3 : multiplexage ──────────────────────────────────────────────────────
  let muxWs: WebSocket | null = null;
  try {
    muxWs = await connect(result.wsUrl, apiKey);
    const first = await generate({
      ws: muxWs,
      text: 'Première génération.',
      outputFormat: 'pcm',
      voiceId,
      extraSetup: { close_ws_on_eos: false, client_req_id: 'probe-1' },
    });

    if (muxWs.readyState !== WebSocket.OPEN) {
      result.multiplexing = {
        supported: false,
        detail: 'La socket s\'est fermée malgré close_ws_on_eos: false.',
      };
    } else {
      const second = await generate({
        ws: muxWs,
        text: 'Deuxième génération sur la même socket.',
        outputFormat: 'pcm',
        voiceId,
        extraSetup: { close_ws_on_eos: false, client_req_id: 'probe-2' },
      });
      result.multiplexing = {
        supported: true,
        detail:
          `Deux générations sur une socket. Deuxième prête en ${second.readyMs} ms ` +
          `contre ${first.readyMs} ms pour la première` +
          (second.clientReqIdEcho
            ? `, client_req_id renvoyé (${second.clientReqIdEcho}).`
            : `, mais client_req_id n'est pas renvoyé : une seule génération à la fois par socket.`),
      };
    }
  } catch (err) {
    result.multiplexing = {
      supported: false,
      detail: `Échec : ${err instanceof Error ? err.message : String(err)}`,
    };
  } finally {
    try { muxWs?.close(); } catch { /* déjà fermée */ }
  }

  result.resume.push(
    result.multiplexing.supported
      ? 'Multiplexage de socket accepté — une connexion peut servir plusieurs générations.'
      : 'Multiplexage non disponible : une socket par génération. Le chantier reste faisable, on perd environ 50 ms par tour.',
  );

  result.ok = result.sampleRate !== null;
  return result;
}
