import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { PETER_INSTRUCTIONS, PETER_PROMPT_SOURCE, PETER_PROMPT_VERSION } from './peter-prompt.ts';

/**
 * `server/peter-prompt.ts` est généré depuis le Markdown par
 * `npm run peter:prompt:build`. Ces tests garantissent que les deux ne divergent
 * pas : depuis la fermeture de l'Assistants API, ce module EST le prompt envoyé
 * en production, alors que le document reste la référence relue par les humains.
 */

const repoRoot = path.resolve(import.meta.dirname, '..');

function readPromptDocument(): string {
  return fs.readFileSync(path.join(repoRoot, PETER_PROMPT_SOURCE), 'utf8');
}

function extractInstructions(markdown: string): string {
  const match = markdown.match(/## DÉBUT DU PROMPT\s+([\s\S]*?)\s+## FIN DU PROMPT/);
  assert.ok(match, 'Les marqueurs DÉBUT/FIN DU PROMPT sont introuvables dans le document.');
  return match![1].trim();
}

test('the bundled prompt matches the versioned Markdown document', () => {
  const expected = extractInstructions(readPromptDocument());
  assert.equal(
    PETER_INSTRUCTIONS,
    expected,
    'server/peter-prompt.ts a divergé du document. Exécuter: npm run peter:prompt:build',
  );
});

test('the declared prompt version matches the document header', () => {
  const match = readPromptDocument().match(/^Version\s*:\s*(.+)$/m);
  assert.ok(match, 'Le document ne déclare pas de version.');
  assert.equal(PETER_PROMPT_VERSION, match![1].trim());
});

test('the prompt carries Peter identity and the pedagogical guardrails', () => {
  // Garde-fous contre une génération vide ou tronquée : le serveur enverrait
  // alors un prompt amputé sans que rien n'échoue visiblement.
  assert.ok(PETER_INSTRUCTIONS.length > 10_000, 'Prompt anormalement court — génération tronquée ?');
  assert.match(PETER_INSTRUCTIONS, /Tu es Peter/);
  assert.match(PETER_INSTRUCTIONS, /IDENTITÉ ET MISSION/);
});

test('the prompt is bundled as a literal, not read from disk at runtime', () => {
  // L'image Docker de production ne copie que dist/ et attached_assets/ :
  // lire docs/ au runtime échouerait en production.
  const moduleSource = fs.readFileSync(path.join(repoRoot, 'server/peter-prompt.ts'), 'utf8');
  assert.doesNotMatch(moduleSource, /readFileSync|readFile|import\s*\(/);
});
