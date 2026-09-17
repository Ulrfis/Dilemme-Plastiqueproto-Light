import assert from "node:assert/strict";
import test from "node:test";
import { detectClues } from "./clue-detection.ts";

/**
 * `/api/chat/stream` annonce désormais les indices DEUX fois par tour :
 *
 *   1. `clues_detected`, émis dès l'ouverture du stream, avec
 *      `foundClues = dédoublonné([...session.foundClues, ...detectedClues])`
 *   2. `complete`, émis en fin de tour, avec
 *      `foundClues = [...session.foundClues, ...detectedClues]` (sans dédoublonnage)
 *
 * Le client applique le premier immédiatement — l'animation de la bouteille en
 * dépend — et le second en réconciliation. Les deux DOIVENT coïncider, sans quoi
 * la liste d'indices affichée changerait en cours de tour.
 *
 * Cette égalité ne tient que parce que `detectClues` ne renvoie jamais un indice
 * déjà trouvé, ni deux fois le même. C'est cet invariant qu'on verrouille ici :
 * le jour où il saute, ce test échoue avant que l'interface ne se mette à
 * clignoter.
 */

/** Réplique exacte des deux formules de `server/routes.ts`. */
function cluesDetectedPayload(sessionFoundClues: string[], detectedClues: string[]): string[] {
  const combined = [...sessionFoundClues, ...detectedClues];
  return combined.filter((v, i) => combined.indexOf(v) === i);
}

function completePayload(sessionFoundClues: string[], detectedClues: string[]): string[] {
  return detectedClues.length > 0 ? [...sessionFoundClues, ...detectedClues] : sessionFoundClues;
}

test("detectClues never returns a clue already found", () => {
  const alreadyFound = ["Déchets plastiques", "ADN"];
  const message = "Je vois plein de plastique et une double hélice, plus une femme.";
  const detected = detectClues(message, alreadyFound);

  for (const clue of detected) {
    assert.ok(!alreadyFound.includes(clue), `"${clue}" était déjà trouvé`);
  }
  assert.deepEqual(detected, ["Femme"]);
});

test("detectClues never returns the same clue twice", () => {
  const message = "Une femme, encore une femme, et toujours une femme.";
  const detected = detectClues(message, []);
  assert.equal(new Set(detected).size, detected.length);
});

test("clues_detected and complete carry the same clue list", () => {
  const cases: Array<{ sessionFoundClues: string[]; message: string }> = [
    { sessionFoundClues: [], message: "Je vois le traité du plastique." },
    { sessionFoundClues: [], message: "Rien de particulier ici." },
    { sessionFoundClues: ["Déchets plastiques"], message: "Une femme et un homme." },
    {
      sessionFoundClues: ["Déchets plastiques", "Végétation", "Homme"],
      message: "Je vois le traité du plastique, puis une femme et une double hélice.",
    },
    // L'élève redit un indice déjà validé : aucun nouvel indice, donc les deux
    // charges utiles doivent rester strictement égales à l'état existant.
    { sessionFoundClues: ["ADN"], message: "Je revois la double hélice." },
  ];

  for (const { sessionFoundClues, message } of cases) {
    const detectedClues = detectClues(message, sessionFoundClues);
    assert.deepEqual(
      cluesDetectedPayload(sessionFoundClues, detectedClues),
      completePayload(sessionFoundClues, detectedClues),
      `divergence sur : "${message}"`,
    );
  }
});
