import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { WELCOME_AUDIO_FILENAME, WELCOME_AUDIO_URL } from "../shared/welcome-audio";

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.get(WELCOME_AUDIO_URL, (_req, res) => {
    res.set({
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Type": "audio/wav",
    });
    res.sendFile(path.resolve(distPath, "audio", WELCOME_AUDIO_FILENAME));
  });

  app.use(express.static(distPath));

  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
