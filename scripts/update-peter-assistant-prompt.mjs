import fs from "node:fs/promises";
import OpenAI from "openai";

const assistantId = process.env.OPENAI_ASSISTANT_ID || "asst_P9b5PxMd1k9HjBgbyXI1Cvm9";
const promptPath = new URL("../docs/PROMPT_PETERBOT_V5_COMPLET.md", import.meta.url);
const dryRun = process.argv.includes("--dry-run");

const document = await fs.readFile(promptPath, "utf8");
const match = document.match(/## DÉBUT DU PROMPT\s+([\s\S]*?)\s+## FIN DU PROMPT/);
if (!match) {
  throw new Error("Les marqueurs DÉBUT DU PROMPT / FIN DU PROMPT sont introuvables.");
}

const instructions = match[1].trim();
if (dryRun) {
  console.log(JSON.stringify({
    assistantId,
    promptFile: "docs/PROMPT_PETERBOT_V5_COMPLET.md",
    instructionCharacters: instructions.length,
    valid: true,
    updated: false,
  }, null, 2));
  process.exit(0);
}

if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY est requis pour mettre à jour l'assistant PeterBot.");
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const assistant = await openai.beta.assistants.update(assistantId, { instructions });

console.log(JSON.stringify({
  assistantId: assistant.id,
  promptFile: "docs/PROMPT_PETERBOT_V5_COMPLET.md",
  instructionCharacters: instructions.length,
  updated: true,
}, null, 2));
