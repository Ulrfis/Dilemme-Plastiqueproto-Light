---
name: Migration ElevenLabs → Gradium
description: Remplacement complet d'ElevenLabs par Gradium pour le TTS de Peter
---

## Règle
Toute génération TTS passe par `server/gradium-agent.ts` + endpoint Gradium REST.  
Ne jamais réintroduire elevenlabs-agent.ts ou les références ElevenLabs.

**Why:** Le projet a migré de ElevenLabs à Gradium (juillet 2026). L'ancienne clé ELEVENLABS_API_KEY et le voice ID R8IjtpeRZsjoJfq1wwj3 sont obsolètes.

**How to apply:**
- API endpoint : `POST https://api.gradium.ai/api/post/speech/tts`
- Auth header : `x-api-key` (non `xi-api-key`)
- Body : `{ text, voice_id: GRADIUM_VOICE_ID, model_name: "default", output_format: "wav", only_audio: true, json_config: { language: "fr" } }` — **NE PAS utiliser "mp3"** (HTTP 200 body vide sans erreur)
- Après concaténation du buffer : toujours appliquer `fixWavHeader()` (Gradium streame des tailles RIFF/data à 0xFFFFFFFF → duration=Infinity → séquencement cassé côté navigateur)
- Queue env vars : `GRADIUM_MAX_CONCURRENT`, `GRADIUM_MAX_QUEUED`
- Pool / warming : `server/gradium-agent.ts` (undici Agent vers api.gradium.ai)
- PostHog step names : `gradium_phase1`, `gradium_phase2a`, `gradium_phase2b`
- Le paramètre `previousText` est conservé dans la signature de `generateTtsAudio` mais non envoyé (pas d'équivalent REST Gradium)
- Le paramètre `quality` ('fast'/'quality') est conservé pour la compatibilité des appelants ; Gradium utilise toujours `model_name: "default"`
