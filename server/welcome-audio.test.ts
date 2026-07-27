import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  WELCOME_AUDIO_FILENAME,
  WELCOME_AUDIO_URL,
  WELCOME_MESSAGE,
} from "../shared/welcome-audio.ts";

const expectedMessage =
  "Bienvenue ulrich dans cette courte expérience. Tente de trouver 6 indices dans cette image pendant les 8 premiers échanges, en racontant ce que tu vois et ce qui attire ton attention sur l'impact du plastique sur la santé. Ensuite, tu pourras continuer à chercher et à discuter avec Peter jusqu'à 15 échanges au total.";

test("keeps the displayed welcome text aligned with the cached recording", () => {
  assert.equal(WELCOME_MESSAGE, expectedMessage);
  assert.equal(WELCOME_AUDIO_URL, `/audio/${WELCOME_AUDIO_FILENAME}`);

  const indexHtml = fs.readFileSync(path.resolve("client", "index.html"), "utf8");
  assert.match(indexHtml, new RegExp(`href="${WELCOME_AUDIO_URL}"`));
  assert.match(indexHtml, /rel="preload"[^>]+as="audio"/);
});

test("ships a complete playable WAV for the first Peter message", () => {
  const audioPath = path.resolve("client", "public", "audio", WELCOME_AUDIO_FILENAME);
  const audio = fs.readFileSync(audioPath);

  assert.equal(audio.toString("ascii", 0, 4), "RIFF");
  assert.equal(audio.toString("ascii", 8, 12), "WAVE");
  assert.equal(audio.readUInt32LE(4), audio.byteLength - 8);

  let offset = 12;
  let dataSize: number | null = null;
  while (offset + 8 <= audio.byteLength) {
    const chunkId = audio.toString("ascii", offset, offset + 4);
    const chunkSize = audio.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }
    offset += 8 + chunkSize + (chunkSize % 2);
  }

  assert.equal(dataSize, audio.byteLength - offset - 8);
  assert.ok(audio.byteLength > 100_000);
});
