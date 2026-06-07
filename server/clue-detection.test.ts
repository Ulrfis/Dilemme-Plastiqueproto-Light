import assert from "node:assert/strict";
import test from "node:test";
import { detectClues } from "./clue-detection.ts";

test("recognizes Plastic Treaty variants", () => {
  assert.deepEqual(detectClues("Je vois le panneau PLASTIC TREATY.", []), ["Traité plastique"]);
  assert.deepEqual(detectClues("On voit un traité sur le plastique.", []), ["Traité plastique"]);
});
test("does not use generic weak words without visual context", () => {
  assert.deepEqual(detectClues("Le plastique est un sujet compliqué.", []), []);
  assert.deepEqual(detectClues("Une femme peut penser à beaucoup de choses.", []), []);
});

test("uses weak words when the student clearly describes the image", () => {
  assert.deepEqual(detectClues("Je vois une femme dans l'image.", []), ["Femme"]);
  assert.deepEqual(detectClues("Je vois plein de plastique autour de la sculpture.", []), ["Déchets plastiques"]);
});

test("never duplicates clues already found", () => {
  assert.deepEqual(detectClues("Je vois une double hélice.", ["ADN"]), []);
});
