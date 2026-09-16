import assert from "node:assert/strict";
import test from "node:test";
import { getWelcomeMessage } from "../shared/welcome-audio.ts";

const expectedMessage =
  "Bienvenue Lina dans cette courte expérience. Tente de trouver 6 indices dans cette image pendant les 8 premiers échanges, en racontant ce que tu vois et ce qui attire ton attention sur l'impact du plastique sur la santé. Ensuite, tu pourras continuer à chercher et à discuter avec Peter jusqu'à 15 échanges au total.";

test("personalizes the first Peter message with the entered name", () => {
  assert.equal(getWelcomeMessage("Lina"), expectedMessage);
});

test("normalizes whitespace before using the name", () => {
  assert.equal(getWelcomeMessage("  Jean   Luc  "), getWelcomeMessage("Jean Luc"));
});

test("falls back to the generic welcome when the trimmed name is empty", () => {
  assert.equal(
    getWelcomeMessage("   "),
    "Bienvenue dans cette courte expérience. Tente de trouver 6 indices dans cette image pendant les 8 premiers échanges, en racontant ce que tu vois et ce qui attire ton attention sur l'impact du plastique sur la santé. Ensuite, tu pourras continuer à chercher et à discuter avec Peter jusqu'à 15 échanges au total.",
  );
});
