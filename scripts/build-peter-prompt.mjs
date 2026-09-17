/**
 * Génère `server/peter-prompt.ts` à partir de `docs/PROMPT_PETERBOT_V5_COMPLET.md`.
 *
 * Pourquoi ce script existe
 * -------------------------
 * Le prompt de Peter vivait dans l'objet Assistant hébergé chez OpenAI. Depuis la
 * fermeture de l'Assistants API (26 août 2026), il doit être envoyé par
 * l'application à chaque tour, via le champ `instructions` de la Responses API.
 *
 * Il ne peut pas être lu depuis `docs/` au runtime : l'image Docker de production
 * ne copie que `dist/` et `attached_assets/` (cf. Dockerfile). Le prompt doit donc
 * être compilé dans le bundle serveur — d'où ce module TypeScript généré.
 *
 * Le Markdown reste la source de vérité lisible et versionnée. `server/peter-prompt.test.ts`
 * vérifie que les deux ne divergent pas.
 *
 * Usage : npm run peter:prompt:build
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const PROMPT_DOC = 'docs/PROMPT_PETERBOT_V5_COMPLET.md';
const OUTPUT = 'server/peter-prompt.ts';

const repoRoot = new URL('..', import.meta.url);

/** Extrait le corps du prompt entre les marqueurs du document. */
export function extractInstructions(markdown) {
  const match = markdown.match(/## DÉBUT DU PROMPT\s+([\s\S]*?)\s+## FIN DU PROMPT/);
  if (!match) {
    throw new Error('Les marqueurs DÉBUT DU PROMPT / FIN DU PROMPT sont introuvables.');
  }
  return match[1].trim();
}

/** Extrait la version déclarée en en-tête du document (`Version : 5.0`). */
export function extractVersion(markdown) {
  const match = markdown.match(/^Version\s*:\s*(.+)$/m);
  return match ? match[1].trim() : 'inconnue';
}

/** Échappe le texte pour une insertion littérale dans un template literal TypeScript. */
export function escapeForTemplateLiteral(text) {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

export function renderModule(instructions, version) {
  return `// @generated par scripts/build-peter-prompt.mjs — NE PAS ÉDITER À LA MAIN.
//
// Source de vérité : ${PROMPT_DOC}
// Pour modifier le prompt de Peter : éditer ce Markdown, puis exécuter
//   npm run peter:prompt:build
// \`server/peter-prompt.test.ts\` échoue si les deux divergent.

/** Version du prompt déclarée dans le document source. */
export const PETER_PROMPT_VERSION = ${JSON.stringify(version)};

/** Chemin du document source, pour l'observabilité et les tests. */
export const PETER_PROMPT_SOURCE = ${JSON.stringify(PROMPT_DOC)};

/**
 * Instructions système de Peter, envoyées à chaque tour dans le champ
 * \`instructions\` de la Responses API.
 */
export const PETER_INSTRUCTIONS = \`${escapeForTemplateLiteral(instructions)}\`;
`;
}

async function main() {
  const docPath = path.join(repoRoot.pathname, PROMPT_DOC);
  const outPath = path.join(repoRoot.pathname, OUTPUT);

  const markdown = await fs.readFile(docPath, 'utf8');
  const instructions = extractInstructions(markdown);
  const version = extractVersion(markdown);

  await fs.writeFile(outPath, renderModule(instructions, version), 'utf8');

  console.log(JSON.stringify({
    source: PROMPT_DOC,
    output: OUTPUT,
    promptVersion: version,
    instructionCharacters: instructions.length,
  }, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
