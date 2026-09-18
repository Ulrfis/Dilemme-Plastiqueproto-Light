import assert from "node:assert/strict";
import test from "node:test";
import { inferSampleRate } from "./gradium-probe.ts";

/**
 * La fréquence d'échantillonnage réelle de Gradium est l'inconnue qui bloque le
 * passage au streaming : le SDK fixe 48 kHz, ses propres types documentent
 * 24 kHz, et se tromper donne une voix trop aiguë ou trop grave.
 *
 * La sonde la déduit du volume d'octets PCM reçu, en le rapportant à une durée
 * estimée depuis le nombre de caractères. L'estimation repose donc sur un débit
 * de parole supposé — d'où l'indicateur de confiance, qui dit quand le verdict
 * automatique ne suffit pas et qu'il faut écouter.
 */

/** Construit un volume d'octets correspondant exactement à une fréquence. */
function bytesFor(text: string, hz: number): number {
  const seconds = text.length / 14; // même débit supposé que la sonde
  return Math.round(seconds * hz * 2); // 16 bits mono
}

const TEXT = "Bonjour, je suis Peter. Regarde bien cette image.";

test("identifies each plausible sample rate from the byte volume", () => {
  for (const hz of [16000, 22050, 24000, 44100, 48000]) {
    const result = inferSampleRate(bytesFor(TEXT, hz), TEXT);
    assert.equal(result.verdictHz, hz, `${hz} Hz mal identifié`);
    assert.equal(result.confidence, "bonne");
  }
});

test("separates the two candidates that matter here — 24 kHz and 48 kHz", () => {
  // C'est exactement l'ambiguïté du SDK Gradium. Si la sonde confondait ces
  // deux-là, elle ne servirait à rien.
  assert.equal(inferSampleRate(bytesFor(TEXT, 24000), TEXT).verdictHz, 24000);
  assert.equal(inferSampleRate(bytesFor(TEXT, 48000), TEXT).verdictHz, 48000);
});

test("flags low confidence when the speech rate assumption is off", () => {
  // Une voix nettement plus lente que supposé gonfle le volume d'octets et
  // tire le verdict vers une fréquence trop haute. Le résultat doit alors
  // s'annoncer comme douteux plutôt que d'être pris pour argent comptant.
  const misleading = inferSampleRate(Math.round(bytesFor(TEXT, 24000) * 1.35), TEXT);
  assert.notEqual(
    misleading.confidence,
    "bonne",
    "un volume incohérent doit baisser la confiance, pas passer inaperçu",
  );
});

test("reports the raw numbers so the verdict can be checked by hand", () => {
  const result = inferSampleRate(bytesFor(TEXT, 24000), TEXT);
  assert.equal(result.bytes, bytesFor(TEXT, 24000));
  assert.ok(result.samples > 0);
  assert.ok(result.estimatedSeconds > 0);
  assert.ok(result.impliedHz > 0);
});
