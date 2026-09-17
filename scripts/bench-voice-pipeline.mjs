/**
 * Compare le chemin TTS actuel (REST, bufferisé intégralement) au chemin
 * WebSocket proposé pour le lot 3, sur des longueurs de texte représentatives
 * d'un tour de Peter.
 *
 * Ce que le banc cherche à établir, en un tableau :
 *
 *   - combien de temps l'élève attend AUJOURD'HUI avant le premier son ;
 *   - combien il attendrait en streaming ;
 *   - donc combien de secondes le lot 3 rachète réellement, par tour.
 *
 * Le REST n'a pas de « premier son » exploitable : `generateTtsAudio` bufferise
 * tout avant de servir. Sa colonne « premier son » est donc son temps total —
 * c'est précisément le problème qu'on mesure.
 *
 * Usage :
 *   GRADIUM_API_KEY=… GRADIUM_VOICE_ID=… node scripts/bench-voice-pipeline.mjs
 *
 * Variables optionnelles :
 *   RUNS=5               répétitions par cas (défaut 3 ; la médiane est retenue)
 *   GRADIUM_REGION=eu|us défaut eu
 *
 * Lancez-le depuis un environnement qui a la clé ET l'accès réseau à Gradium
 * (Replit, Coolify, ou votre machine) — pas depuis un agent sandboxé.
 *
 * Utilise le paquet `ws` et NON le WebSocket global de Node : ce dernier accepte
 * un objet d'options sans broncher mais ignore `headers` en silence — on se
 * connecterait sans authentification.
 */
import WebSocket from "ws";

const API_KEY = process.env.GRADIUM_API_KEY;
const VOICE_ID = process.env.GRADIUM_VOICE_ID;
const REGION = process.env.GRADIUM_REGION || "eu";
const RUNS = Math.max(1, Number.parseInt(process.env.RUNS || "3", 10) || 3);

const REST_URL = "https://api.gradium.ai/api/post/speech/tts";
const WS_URL = `wss://${REGION}.api.gradium.ai/api/speech/tts`;

if (!API_KEY || !VOICE_ID) {
  console.error("GRADIUM_API_KEY et GRADIUM_VOICE_ID sont requis.");
  process.exit(1);
}

/**
 * Trois longueurs calées sur le pipeline réel :
 *   - « phase 1 » reprend le seuil MIN_SENTENCE_CHARS = 55 de routes.ts ;
 *   - « réplique » est une réponse typique de Peter ;
 *   - « accueil » est le message de bienvenue de shared/welcome-audio.ts.
 */
const CASES = [
  {
    name: "phase 1 (1 phrase)",
    text: "Bonne observation ! Qu'est-ce qui te frappe le plus dans cette image ?",
  },
  {
    name: "réplique complète",
    text:
      "Bonne observation ! Ces bouteilles échouées racontent quelque chose d'important. " +
      "Regarde bien autour de la sculpture : d'autres détails attendent ton œil. " +
      "Qu'est-ce qui attire ton attention maintenant ?",
  },
  {
    name: "message d'accueil",
    text:
      "Bienvenue Lina dans cette courte expérience. Tente de trouver 6 indices dans cette " +
      "image pendant les 8 premiers échanges, en racontant ce que tu vois et ce qui attire " +
      "ton attention sur l'impact du plastique sur la santé. Ensuite, tu pourras continuer " +
      "à chercher et à discuter avec Peter jusqu'à 15 échanges au total.",
  },
];

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Chemin actuel : REST, corps drainé intégralement avant de rendre la main. */
async function measureRest(text) {
  const t0 = Date.now();
  let firstByteAt = 0;

  const response = await fetch(REST_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": API_KEY },
    body: JSON.stringify({
      text,
      voice_id: VOICE_ID,
      model_name: "default",
      output_format: "wav",
      only_audio: true,
      json_config: { language: "fr" },
    }),
  });

  if (!response.ok) {
    throw new Error(`REST ${response.status} — ${await response.text()}`);
  }

  let bytes = 0;
  const reader = response.body.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (firstByteAt === 0) firstByteAt = Date.now();
    bytes += value.byteLength;
  }

  const totalMs = Date.now() - t0;
  return {
    // Le serveur ne sert rien avant d'avoir tout reçu : l'élève attend le total.
    firstSoundMs: totalMs,
    transportFirstByteMs: firstByteAt > 0 ? firstByteAt - t0 : null,
    totalMs,
    bytes,
  };
}

/** Chemin proposé : WebSocket, audio exploitable dès le premier chunk. */
function measureWs(text, outputFormat = "pcm") {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL, { headers: { "x-api-key": API_KEY } });
    const t0 = Date.now();
    let firstAudioAt = 0;
    let bytes = 0;
    let settled = false;

    const timer = setTimeout(() => finish(new Error("Délai dépassé (30 s)")), 30_000);

    function finish(err, value) {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch { /* déjà fermée */ }
      err ? reject(err) : resolve(value);
    }

    ws.once("open", () => {
      ws.send(JSON.stringify({
        type: "setup",
        voice_id: VOICE_ID,
        output_format: outputFormat,
        model_name: "default",
        json_config: { language: "fr" },
      }));
    });

    ws.on("error", (err) => finish(new Error(`Erreur WebSocket : ${err?.message || "inconnue"}`)));

    ws.on("message", (data) => {
      let msg;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      if (msg.type === "ready") {
        ws.send(JSON.stringify({ type: "text", text }));
        ws.send(JSON.stringify({ type: "end_of_stream" }));
      } else if (msg.type === "audio") {
        if (firstAudioAt === 0) firstAudioAt = Date.now();
        bytes += Buffer.from(msg.audio, "base64").byteLength;
      } else if (msg.type === "end_of_stream") {
        finish(null, {
          firstSoundMs: firstAudioAt > 0 ? firstAudioAt - t0 : null,
          totalMs: Date.now() - t0,
          bytes,
        });
      } else if (msg.type === "error") {
        finish(new Error(`Gradium : ${msg.message} (code ${msg.code})`));
      }
    });
  });
}

async function runCase(label, fn) {
  const samples = [];
  for (let i = 0; i < RUNS; i++) {
    try {
      samples.push(await fn());
    } catch (err) {
      console.error(`   ${label} — échec run ${i + 1} : ${err.message}`);
    }
  }
  if (samples.length === 0) return null;
  return {
    firstSoundMs: median(samples.map((s) => s.firstSoundMs).filter((v) => v != null)),
    totalMs: median(samples.map((s) => s.totalMs)),
    bytes: median(samples.map((s) => s.bytes)),
  };
}

function kb(bytes) {
  return bytes == null ? "—" : `${Math.round(bytes / 1024)} Ko`;
}

async function main() {
  console.log(`Région ${REGION} · médiane sur ${RUNS} run(s) par cas\n`);
  console.log("Le premier run inclut l'établissement de connexion ; en production");
  console.log("le pool undici et le warming la gardent chaude.\n");

  const rows = [];

  for (const testCase of CASES) {
    console.log(`▸ ${testCase.name} (${testCase.text.length} caractères)`);

    const rest = await runCase("REST", () => measureRest(testCase.text));
    const wsPcm = await runCase("WS pcm", () => measureWs(testCase.text, "pcm"));
    const wsOpus = await runCase("WS opus", () => measureWs(testCase.text, "opus"));

    rows.push({ testCase, rest, wsPcm, wsOpus });

    const gain = rest && wsPcm?.firstSoundMs != null ? rest.firstSoundMs - wsPcm.firstSoundMs : null;
    console.log(`   REST    premier son ${rest?.firstSoundMs ?? "—"} ms · ${kb(rest?.bytes)} (wav)`);
    console.log(`   WS pcm  premier son ${wsPcm?.firstSoundMs ?? "—"} ms · ${kb(wsPcm?.bytes)}`);
    console.log(`   WS opus premier son ${wsOpus?.firstSoundMs ?? "—"} ms · ${kb(wsOpus?.bytes)}`);
    if (gain != null) {
      console.log(`   → ${gain} ms rachetés par tour sur ce cas`);
    }
    console.log("");
  }

  console.log("─".repeat(70));
  console.log("Lecture :");
  console.log("  • « premier son » REST = son temps total, parce que le serveur");
  console.log("    bufferise tout avant de servir. C'est le problème, pas un artefact.");
  console.log("  • Si l'écart WS/REST est faible (< 300 ms), le lot 3 se justifie");
  console.log("    surtout par la continuité de la voix, pas par la latence.");
  console.log("  • Comparez aussi les volumes : le wav non compressé transite deux");
  console.log("    fois (Gradium→serveur, serveur→navigateur) sur réseau d'école.");

  const totalGain = rows
    .map((r) => (r.rest && r.wsPcm?.firstSoundMs != null ? r.rest.firstSoundMs - r.wsPcm.firstSoundMs : 0))
    .reduce((a, b) => a + b, 0);
  if (totalGain > 0) {
    console.log(`\n  Gain cumulé sur les ${rows.length} cas : ${totalGain} ms.`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(`\nÉchec du banc : ${err.message}`);
    process.exit(1);
  },
);
