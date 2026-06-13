import assert from "node:assert/strict";
import test from "node:test";
import {
  canStartTutorialExchange,
  getTutorialConversationPhase,
} from "../shared/tutorial-config.ts";
import { buildPeterExchangeInstructions, buildPeterGameContext } from "./peter-game-context.ts";

const baseInput = {
  foundBefore: ["Homme"],
  newlyFound: [],
  foundAfter: ["Homme"],
  missingClues: ["Femme"],
  userName: "Lina",
};

test("uses the 8-exchange challenge and 15-exchange conversation phases", () => {
  assert.equal(getTutorialConversationPhase(7), "clue_challenge");
  assert.equal(getTutorialConversationPhase(8), "clue_challenge");
  assert.equal(getTutorialConversationPhase(9), "open_discussion");
  assert.equal(getTutorialConversationPhase(14), "open_discussion");
  assert.equal(getTutorialConversationPhase(15), "final_exchange");
});

test("allows exactly 15 completed conversation exchanges", () => {
  assert.equal(canStartTutorialExchange(14), true);
  assert.equal(canStartTutorialExchange(15), false);
});

test("keeps clues valid after challenge and closes only on exchange 15", () => {
  const context9 = buildPeterGameContext({ ...baseInput, exchangeNumber: 9 });
  const context15 = buildPeterGameContext({ ...baseInput, exchangeNumber: 15 });

  assert.match(context9, /Indices toujours validables : oui/);
  assert.match(context9, /Conversation encore possible après cette réponse : oui/);
  assert.match(context15, /Dernier échange autorisé : oui/);
  assert.match(context15, /Conversation encore possible après cette réponse : non/);
});

test("explains transition at exchange 8 and conclusion at exchange 15", () => {
  assert.match(
    buildPeterExchangeInstructions({ ...baseInput, exchangeNumber: 8 }),
    /conversation ne se termine pas/,
  );
  assert.match(
    buildPeterExchangeInstructions({ ...baseInput, exchangeNumber: 15 }),
    /dernier échange autorisé/,
  );
});

test("keeps the post-challenge discussion open with an indirect visual hint", () => {
  assert.match(
    buildPeterExchangeInstructions({ ...baseInput, exchangeNumber: 9 }),
    /discussion continue et les indices restent validables/,
  );
  assert.match(
    buildPeterExchangeInstructions({ ...baseInput, exchangeNumber: 9 }),
    /une seule piste visuelle indirecte/,
  );
});

test("switches to the completion message once every clue is found", () => {
  const completedInstructions = buildPeterExchangeInstructions({
    ...baseInput,
    exchangeNumber: 9,
    foundAfter: ["Homme", "Femme", "ADN", "Traité plastique", "Végétation", "Déchets plastiques"],
    missingClues: [],
  });

  assert.match(completedInstructions, /Tous les indices sont trouvés/);
  assert.match(completedInstructions, /discussion peut continuer jusqu'au 15e échange/);
});

test("uses the single-clue hint before the open discussion phase", () => {
  assert.match(
    buildPeterExchangeInstructions({ ...baseInput, exchangeNumber: 7 }),
    /Il reste un seul indice/,
  );
  assert.doesNotMatch(
    buildPeterExchangeInstructions({ ...baseInput, exchangeNumber: 7 }),
    /discussion continue et les indices restent validables/,
  );
});
