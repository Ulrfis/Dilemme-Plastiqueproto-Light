import assert from "node:assert/strict";
import test from "node:test";
import {
  getWelcomeMessage,
  getWelcomeSegments,
  WELCOME_BODY_SENTENCES,
} from "../shared/welcome-audio.ts";

const expectedMessage =
  "Bienvenue Lina dans cette courte expérience. Tente de trouver 6 indices dans cette image pendant les 8 premiers échanges, en racontant ce que tu vois et ce qui attire ton attention sur l'impact du plastique sur la santé. Ensuite, tu pourras continuer à chercher et à discuter avec Peter jusqu'à 15 échanges au total.";

test("personalizes the first Peter message with the entered name", () => {
  assert.equal(getWelcomeMessage("Lina"), expectedMessage);
});

test("normalizes whitespace before using the name", () => {
  assert.equal(getWelcomeMessage("  Jean   Luc  "), getWelcomeMessage("Jean Luc"));
});

/**
 * L'accueil est joué en trois morceaux pour que le son démarre sans attendre les
 * ~22 secondes d'audio du message entier, mais il reste affiché d'un bloc. Si la
 * découpe dérivait du texte affiché, Peter dirait autre chose que ce qu'on lit.
 */
test("the spoken segments reassemble into exactly the displayed message", () => {
  for (const name of ["Lina", "Jean Luc", "  Zoé-Marie  ", "", "A"]) {
    assert.equal(
      getWelcomeSegments(name).join(" "),
      getWelcomeMessage(name),
      `divergence pour le prénom ${JSON.stringify(name)}`,
    );
  }
});

test("only the first segment carries the name", () => {
  const segments = getWelcomeSegments("Lina");
  assert.equal(segments.length, 3);
  assert.ok(segments[0].includes("Lina"));
  // Les segments 2 et 3 sont épinglés en cache TTS au démarrage du serveur :
  // s'ils variaient d'un élève à l'autre, le cache ne servirait plus à rien.
  assert.deepEqual(segments.slice(1), [...WELCOME_BODY_SENTENCES]);
});

test("the invariant segments stay identical across names", () => {
  assert.deepEqual(getWelcomeSegments("Lina").slice(1), getWelcomeSegments("Mohamed").slice(1));
  assert.deepEqual(getWelcomeSegments("").slice(1), getWelcomeSegments("Lina").slice(1));
});

test("each segment ends on a sentence boundary", () => {
  // La découpe doit tomber sur une fin de phrase : c'est ce qui rend
  // l'enchaînement inaudible. Une coupure en milieu de phrase s'entendrait.
  for (const segment of getWelcomeSegments("Lina")) {
    assert.match(segment, /[.!?]$/, `segment sans ponctuation finale : ${segment}`);
  }
});
