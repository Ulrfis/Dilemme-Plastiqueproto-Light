# Audit UX & Robustesse – Dilemme Plastique (févr. 2026)

Synthèse des points à améliorer, raisons observées, pistes de correction et variations possibles (desktop + mobile).

---

## 1) Réinitialisation de session fiable
- **Constat** : `resetSession` ne vide pas `foundClues`, `dragDropPlacements`, `synthesis`, `feedbackCompleted`, ni l’ID PostHog → un nouvel utilisateur hérite parfois de l’historique.
- **Impact** : états incohérents, “sautes” d’écran (redirects inattendus), métriques brouillées.
- **Corrections proposées**
  1. Étendre `resetSession` pour remettre tout l’état initial **et** appeler `window.posthog?.reset()`.
  2. Ajouter un bouton “Nouvelle session” (header tutoriel + menu) qui appelle `resetSession()` puis `window.location.replace('/')`.
  3. Ajouter un flag `?fresh=1` : si présent, ignorer `sessionStorage` au premier render (pratique QA / automatisation).
- **Variantes**
  - Option “Reset (test)” affichée uniquement en `import.meta.env.DEV`.
  - Bouton discret dans l’écran de fin “Recommencer” qui force un hard-refresh après reset.

## 2) Cohérence state React vs sessionStorage
- **Constat** : plusieurs pages relisent `sessionStorage` en direct (ex. `TutorialPage`, `GamePage`) alors que le contexte fournit déjà l’état.
- **Impact** : flashs de redirection si le storage est vidé, dé-synchro avec le state React.
- **Corrections proposées**
  - Centraliser l’accès via `SessionFlowProvider` (exposer un hook `usePersistedSession()`).
  - Ne relire le storage qu’une fois au mount, hydrater le contexte, puis utiliser uniquement le contexte.
- **Variantes**
  - Ajout d’un guard “stale storage” : si parse JSON échoue ou si `sessionId` absent, on reset proprement.

## 3) Sauts visuels dans la conversation (desktop & mobile)
- **Constat** : 
  - Messages keyés par index → reordering fait “sauter” le scroll.
  - Animation des barres d’enregistrement avec hauteurs aléatoires → micro‑jitter.
  - Streaming SSE réécrit le dernier bubble, change sa hauteur en continu.
- **Impact** : impression d’instabilité, surtout sur mobile où la zone scrollable est petite.
- **Corrections proposées**
  1. Keyer chaque message sur un `id` stable (timestamp ou `crypto.randomUUID()` côté front).
  2. Remplacer les barres aléatoires par un equalizer CSS fixe (3–4 barres à hauteur animée via keyframes déterministes).
  3. Pendant le streaming, réserver l’espace du bubble avec `min-height` (estimation sur 80–120 caractères) et n’auto‑scroller que si l’utilisateur est collé au bas (`isNearBottom` < 60 px).
- **Variantes**
  - Afficher un skeleton “Peter rédige…” plutôt que le texte partiel; injecter la phrase complète à la fin.
  - Option “compact mode” sur desktop : bulles plus denses pour limiter le défilement.

## 4) Latence perçue (TTS + LLM)
- **Constat** : pipeline déjà en streaming mais fallback non-streaming réintroduit un second aller-retour; TTS est appelé phrase par phrase sans préchauffage audio.
- **Corrections proposées**
  - Forcer le mode streaming par défaut et ne fallback qu’en cas d’erreur réseau.
  - Pochauffage audio : au clic “Écouter Peter”, lancer en parallèle un TTS ultra court (“.”) pour remplir les caches CDN/Edge.
  - Grouper les requêtes TTS en parallèle mais limiter à N simultanées (ex. 2) pour ne pas saturer le réseau mobile.
- **Variantes**
  - Choisir TTS phrase-à-phrase ou bloc complet selon la longueur de réponse (>320 chars → bloc).
  - Activer un “silent retry” : si un blob est <100 bytes, relancer une fois avant d’afficher un toast.

## 5) UX responsive (petits écrans)
- **Constat** : header fixe + image 30vh + footer commandes laissent peu d’espace scroll; l’arrivée d’un message fait remonter la vue.
- **Corrections proposées**
  - Réduire l’image à 24–26vh sur <640px, et déplacer le compteur d’indices dans la barre inférieure.
  - Ajouter un “sticky-bottom guard” sur la conversation (ne scroll que si l’utilisateur n’a pas remonté).
  - Passer les boutons micro/texte sur une seule ligne compressible (icons sm, padding réduit).
- **Variantes**
  - Mode “lecture seule” (texte) activable si MediaRecorder absent, avec UI plus compacte.
  - Bouton “plein écran conversation” qui masque l’image temporairement sur mobile.

## 6) Gestion d’erreurs & toasts
- **Constat** : chaque échec réseau peut générer un toast séparé; bruyant en cas de perte de connexion.
- **Corrections proposées**
  - Débouncer les toasts d’erreur (fenêtre 3–5 s) et les regrouper.
  - Ajouter un état “reconnexion en cours” visuel dans la zone d’input plutôt qu’un toast.
- **Variantes**
  - Mode silencieux QA : log console seulement, aucun toast utilisateur.

## 7) Instrumentation PostHog
- **Constat** : l’ID PostHog persiste entre sessions; les métriques d’abandon/session sont faussées.
- **Corrections proposées**
  - Appeler `posthog.reset()` dans `resetSession` et avant de recréer une session.
  - Flusher (`posthog.flush()`) avant unload pour capter la fin de session réelle.
- **Variantes**
  - Ajouter une prop de contexte `trackingEnabled` pour couper l’analytics sur environnements QA.

## 8) Outils de test / QA
- **Corrections proposées**
  - Ajouter un query param `?devtools=1` activant une barre QA (reset, logs réseau, simulateur de lenteur).
  - Scripts Playwright prêts : scénarios desktop + mobile (ouvrir, unlock audio, 2 échanges, reset).

---

## Actions prioritaires (ordre recommandé)
1) Étendre `resetSession` + bouton “Nouvelle session” + `posthog.reset()`.
2) Clés de messages stables + sticky bottom auto-scroll + min-height sur bubble streaming.
3) Pochauffage audio & forcer pipeline streaming.
4) Ajust UX mobile (hauteur image, barres compactes, guard scroll).
5) Debounce toasts et état “reconnexion”.
