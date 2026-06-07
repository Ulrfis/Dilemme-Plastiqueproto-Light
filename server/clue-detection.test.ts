import assert from "node:assert/strict";
import test from "node:test";
import { detectClues } from "./clue-detection.ts";

test("recognizes Plastic Treaty variants", () => {
  assert.deepEqual(detectClues("Je vois le panneau PLASTIC TREATY.", []), ["Traité plastique"]);
  assert.deepEqual(detectClues("On voit un traité sur le plastique.", []), ["Traité plastique"]);
  assert.deepEqual(detectClues("On voit qu'il y a le traité du plastique.", []), ["Traité plastique"]);
});
test("does not use generic weak words without visual context", () => {
  assert.deepEqual(detectClues("Le plastique est un sujet compliqué.", []), []);
});

test("always recognizes explicit target clue names", () => {
  assert.deepEqual(detectClues("Puis une femme avec les yeux fermés.", []), ["Femme"]);
  assert.deepEqual(detectClues("On distingue un homme et une femme.", []), ["Homme", "Femme"]);
});

test("uses weak descriptive words only with visual context", () => {
  assert.deepEqual(detectClues("Je vois plein de plastique autour de la sculpture.", []), ["Déchets plastiques"]);
});

test("recognizes every new clue mentioned in the same message", () => {
  const message = "Je vois le traité du plastique, puis une femme et une double hélice.";
  assert.deepEqual(
    detectClues(message, ["Déchets plastiques", "Végétation", "Homme"]),
    ["ADN", "Traité plastique", "Femme"],
  );
});

test("recognizes the exact formulations from the reported session", () => {
  const firstMessage = "Mais en même temps, on voit qu'il y a le traité du plastique, peut-être qu'il va pouvoir changer ça.";
  const secondMessage = "Alors, je vois un homme avec un bébé sur le bras et puis une femme avec les yeux fermés et une chevelure verte qui semble être de la végétation, des algues.";
  const alreadyFound = ["Déchets plastiques", "Végétation", "Homme"];

  assert.deepEqual(detectClues(firstMessage, alreadyFound), ["Traité plastique"]);
  assert.deepEqual(detectClues(secondMessage, alreadyFound), ["Femme"]);
});

test("never duplicates clues already found", () => {
  assert.deepEqual(detectClues("Je vois une double hélice.", ["ADN"]), []);
});
