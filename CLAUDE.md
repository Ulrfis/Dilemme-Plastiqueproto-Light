# CLAUDE.md — Dilemme Plastique (Proto Light)

> Lis d'abord : STORY.md, README.md, PLAN.md si existe
> Contexte ulrfis : ~/CodeProjects/_shared/agent-context/00-memoways-context.md

## Contexte projet

Application éducative mobile-first pour enseigner la pollution plastique à des élèves (10-18 ans, Genève). L'élève dialogue avec "Peter" (assistant IA vocal) pour découvrir 6 indices cachés dans une image de la Place des Nations. Expérience voice-to-voice + jeu + synthèse.

- Statut : 🟡 En cours (dernière session 2026-05-06)
- Outil principal : **Replit** (dev + hébergement + secrets)
- Passage par Claude Code : debug, optimisations, architecture

## Stack

- Frontend : React + TypeScript (client/)
- Backend : Express.js (API + session management)
- Base de données : PostgreSQL (Drizzle ORM — `drizzle.config.ts`)
- STT : OpenAI Whisper
- LLM : GPT-4 (OpenAI Assistant — "Peter")
- TTS : ElevenLabs
- Analytics : PostHog + Google Sheets (sync via `google-apps-script.js`)
- Déploiement : Replit (intégré, secrets gérés dans Replit)

## Architecture clé

- Sessions persistées en PostgreSQL avec structure unifiée
- Peter = GPT Assistant avec mémoire de conversation dans la session
- Comptage des indices trouvés — logique sensible (cf. STORY.md §Fiabilité comptage)
- `additional_instructions` et `prompt Peter v3` → voir STORY.md pour le versioning exact
- Retour sur /tutorial : Peter reprend la conversation contextuellement (voir STORY.md 2026-05-02)

## Règles projet (fenêtres cassées connues)

- **Ne pas modifier le comptage des indices sans lire STORY.md §Fiabilité** — logique fragile, a déjà cassé
- **Secrets dans Replit uniquement** — ne jamais mettre les clés API dans le code ou les commits
- **Avant de changer le prompt Peter** : versionner dans STORY.md, pas de modification silencieuse
- Drizzle migrations : utiliser `npm run db:push` (voir AGENTS.md pour commandes complètes)
- Vérifier `npm run check` (TypeScript) avant tout commit
- PostHog + Google Sheets Analytics : ne pas désactiver sans accord explicite

## Workflow multi-outils

Ce projet vit principalement sur Replit. Quand tu arrives depuis Claude Code :
1. `git pull` — vérifier que tu es à jour
2. Lire STORY.md §Dernière session pour reprendre le contexte
3. `npm run check` — s'assurer que TypeScript est propre
4. Commit + push avant de repartir sur Replit
