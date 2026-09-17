/**
 * Sonde l'API WebSocket de Gradium pour lever les deux inconnues qui bloquent le
 * passage au streaming TTS (lot 3).
 *
 *   1. FRÉQUENCE D'ÉCHANTILLONNAGE. Le SDK `@confiture-ai/gradium-sdk-js` fixe
 *      `sampleRate = 48_000` alors que ses propres types documentent wav et pcm
 *      en 24 kHz. Se tromper donne une voix trop aiguë ou trop grave. On génère
 *      une phrase, on compte les octets PCM reçus et on en déduit la fréquence
 *      réelle en la comparant à une durée plausible.
 *
 *   2. MULTIPLEXAGE. Le guide Gradium décrit `close_ws_on_eos: false` et
 *      `client_req_id` pour partager une socket entre plusieurs générations.
 *      Ces champs sont ABSENTS du SDK 0.1.1 — donc à confirmer contre l'API
 *      réelle. S'ils ne sont pas honorés, le lot 3 reste faisable : une socket
 *      par génération, avec ~50 ms de plus par tour.
 *
 * Mesure aussi le temps jusqu'au premier octet audio — le chiffre qui décide si
 * le chantier streaming en vaut la peine.
 *
 * Usage :
 *   GRADIUM_API_KEY=… GRADIUM_VOICE_ID=… node scripts/probe-gradium-ws.mjs
 *
 * Variables optionnelles :
 *   GRADIUM_REGION=eu|us   (défaut eu — pertinent pour une classe genevoise)
 *   GRADIUM_WS_URL=…       (surcharge complète de l'URL)
 *
 * Utilise le paquet `ws` et NON le WebSocket global de Node : ce dernier accepte
 * un objet d'options sans broncher mais ignore `headers` en silence — on se
 * connecterait sans authentification, avec une erreur incompréhensible à l'arrivée.
 *
 * Ce script ne modifie rien. Il lit, mesure, et affiche un verdict.
 */
import WebSocket from "ws";

const API_KEY = process.env.GRADIUM_API_KEY;
const VOICE_ID = process.env.GRADIUM_VOICE_ID;
const REGION = process.env.GRADIUM_REGION || "eu";
const WS_URL = process.env.GRADIUM_WS_URL || `wss://${REGION}.api.gradium.ai/api/speech/tts`;

if (!API_KEY || !VOICE_ID) {
  console.error("GRADIUM_API_KEY et GRADIUM_VOICE_ID sont requis.");
  console.error("Ces secrets vivent dans Replit/Coolify — ne les mettez jamais dans le dépôt.");
  process.exit(1);
}

// Phrase de référence : du français courant, longueur proche d'une réplique de
// Peter. La durée attendue sert de garde-fou au calcul de fréquence.
const PROBE_TEXT =
  "Bonjour, je suis Peter. Regarde bien cette image et raconte-moi ce qui attire ton attention.";

/** Octets par échantillon en PCM 16 bits mono. */
const BYTES_PER_SAMPLE = 2;

function connect() {
  return new WebSocket(WS_URL, { headers: { "x-api-key": API_KEY } });
}

/**
 * Lance une génération et renvoie ses mesures.
 * `extraSetup` permet d'injecter les champs de multiplexage à tester.
 * `socket` permet de réutiliser une socket déjà ouverte.
 */
function generate({ text, outputFormat, extraSetup = {}, socket = null, timeoutMs = 30_000 }) {
  return new Promise((resolve, reject) => {
    const ws = socket || connect();
    const ownsSocket = !socket;
    const t0 = Date.now();
    let readyAt = 0;
    let firstAudioAt = 0;
    let bytes = 0;
    let chunkCount = 0;
    let requestId = null;
    let settled = false;

    const timer = setTimeout(() => finish(new Error(`Délai dépassé (${timeoutMs} ms)`)), timeoutMs);

    function finish(err, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      ws.off("message", onMessage);
      ws.off("error", onError);
      if (ownsSocket) {
        try { ws.close(); } catch { /* déjà fermée */ }
      }
      err ? reject(err) : resolve(value);
    }

    function onError(err) {
      finish(new Error(`Erreur WebSocket : ${err?.message || "clé invalide, région injoignable ?"}`));
    }

    function onMessage(data) {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return; // Trame binaire inattendue : ignorée, le protocole est en JSON.
      }

      switch (msg.type) {
        case "ready":
          readyAt = Date.now();
          requestId = msg.request_id ?? null;
          ws.send(JSON.stringify({ type: "text", text }));
          ws.send(JSON.stringify({ type: "end_of_stream" }));
          break;

        case "audio":
          if (firstAudioAt === 0) firstAudioAt = Date.now();
          chunkCount += 1;
          bytes += Buffer.from(msg.audio, "base64").byteLength;
          break;

        case "end_of_stream":
          finish(null, {
            requestId,
            clientReqIdEcho: msg.client_req_id ?? null,
            readyMs: readyAt - t0,
            ttfaMs: firstAudioAt > 0 ? firstAudioAt - t0 : null,
            totalMs: Date.now() - t0,
            bytes,
            chunkCount,
            socket: ws,
          });
          break;

        case "error":
          finish(new Error(`Gradium a refusé : ${msg.message} (code ${msg.code})`));
          break;
      }
    }

    ws.on("message", onMessage);
    ws.on("error", onError);

    const setup = JSON.stringify({
      type: "setup",
      voice_id: VOICE_ID,
      output_format: outputFormat,
      model_name: "default",
      json_config: { language: "fr" },
      ...extraSetup,
    });

    if (ws.readyState === WebSocket.OPEN) {
      ws.send(setup);
    } else {
      ws.once("open", () => ws.send(setup));
    }
  });
}

/** Déduit la fréquence à partir du volume d'octets PCM et d'une durée plausible. */
function inferSampleRate(bytes, text) {
  const samples = bytes / BYTES_PER_SAMPLE;
  // Débit de parole français ≈ 14 caractères/seconde, voix posée.
  const estimatedSeconds = text.length / 14;
  const implied = samples / estimatedSeconds;
  const candidates = [16000, 22050, 24000, 44100, 48000];
  const closest = candidates.reduce((a, b) => (Math.abs(b - implied) < Math.abs(a - implied) ? b : a));
  return { samples, estimatedSeconds, implied, closest };
}

async function main() {
  console.log(`URL      : ${WS_URL}`);
  console.log(`Phrase   : "${PROBE_TEXT}" (${PROBE_TEXT.length} caractères)\n`);

  // ── 1. Fréquence d'échantillonnage ────────────────────────────────────────
  console.log("① Fréquence d'échantillonnage");
  const pcm = await generate({ text: PROBE_TEXT, outputFormat: "pcm" });
  const rate = inferSampleRate(pcm.bytes, PROBE_TEXT);

  console.log(`   ${pcm.bytes} octets en ${pcm.chunkCount} chunks`);
  console.log(`   → ${Math.round(rate.samples)} échantillons 16 bits mono`);
  console.log(`   → durée estimée ${rate.estimatedSeconds.toFixed(1)} s (à ~14 car/s)`);
  console.log(`   → fréquence impliquée ${Math.round(rate.implied)} Hz`);
  console.log(`   VERDICT : ${rate.closest} Hz\n`);
  console.log("   ⚠ Confirmez à l'oreille : générez le même texte en wav et écoutez-le.");
  console.log("     Voix trop aiguë = fréquence réelle plus basse que supposé ; trop grave =");
  console.log("     l'inverse. L'estimation ci-dessus dépend du débit de parole retenu.\n");

  // ── 2. Réactivité ─────────────────────────────────────────────────────────
  console.log("② Réactivité (c'est ce chiffre qui justifie ou non le lot 3)");
  console.log(`   connexion + ready : ${pcm.readyMs} ms`);
  console.log(`   premier octet     : ${pcm.ttfaMs ?? "—"} ms`);
  console.log(`   dernier octet     : ${pcm.totalMs} ms`);
  if (pcm.ttfaMs != null) {
    console.log(`   → ${pcm.totalMs - pcm.ttfaMs} ms séparent le premier du dernier octet.`);
    console.log("     En REST, c'est exactement ce que le serveur passe à bufferiser");
    console.log("     pendant que l'élève attend en silence.\n");
  }

  // ── 3. Multiplexage ───────────────────────────────────────────────────────
  console.log("③ Multiplexage d'une socket entre générations");
  let muxSocket = null;
  try {
    const first = await generate({
      text: "Première génération.",
      outputFormat: "pcm",
      extraSetup: { close_ws_on_eos: false, client_req_id: "probe-1" },
    });
    muxSocket = first.socket;

    if (muxSocket.readyState !== WebSocket.OPEN) {
      console.log("   ✗ La socket s'est fermée malgré close_ws_on_eos: false.");
      console.log("     → Le champ n'est pas honoré. Lot 3 : une socket par génération.");
    } else {
      const second = await generate({
        text: "Deuxième génération sur la même socket.",
        outputFormat: "pcm",
        extraSetup: { close_ws_on_eos: false, client_req_id: "probe-2" },
        socket: muxSocket,
      });
      console.log("   ✓ Deux générations sur une seule socket.");
      console.log(`     2ᵉ ready en ${second.readyMs} ms contre ${first.readyMs} ms pour la 1ʳᵉ`);
      console.log("     (l'écart est ce que le multiplexage économise par tour)");
      console.log(`     echo client_req_id : ${second.clientReqIdEcho ?? "absent de la réponse"}`);
      if (second.clientReqIdEcho == null) {
        console.log("     ⚠ Sans echo, impossible de démêler des générations concurrentes :");
        console.log("       n'en lancez qu'une à la fois par socket.");
      }
    }
  } catch (err) {
    console.log(`   ✗ Échec : ${err.message}`);
    console.log("     → Traitez le multiplexage comme indisponible. Le lot 3 tient quand même.");
  } finally {
    try { muxSocket?.close(); } catch { /* rien */ }
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`\nÉchec de la sonde : ${err.message}`);
    process.exit(1);
  },
);
