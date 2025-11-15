# Changelog

Tous les changements notables de ce projet seront documentés dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [Non publié]

### À venir
- Persistance des sessions (PostgreSQL via Drizzle)
- Authentification simple (code classe)
- Dashboard enseignant (statistiques, scores)
- Multi-niveaux (pollution marine, changement climatique)
- Mode hors-ligne (cache audio)

---

## [1.1.0] - 2025-01-15

### Corrigé
- **Flux audio mobile critique** : Résolution des problèmes de blocage audio après la première interaction
  - Validation des blobs audio (détection vides/invalides) côté client et serveur
  - Nettoyage complet des éléments Audio avant création de nouveaux (évite accumulation sur mobile)
  - Détection automatique d'états bloqués avec timeout de 5 secondes
  - Timeouts de sécurité améliorés (10s de marge au lieu de 5s)
  - Récupération automatique d'état quand l'audio ne démarre pas
  - Fichiers modifiés: `useVoiceInteraction.ts`, `TutorialScreen.tsx`, `api.ts`, `routes.ts`

- **Bouton "Rejouer le tutoriel"** : Correction de la navigation
  - Le bouton retourne maintenant à l'écran de titre initial au lieu de l'écran tutoriel
  - Réinitialisation complète de tous les états (userName, sessionId, score, foundClues)
  - Fichier modifié: `Home.tsx`

### Amélioré
- Logs détaillés pour faciliter le débogage du flux audio
- Meilleurs messages d'erreur pour les problèmes TTS
- Validation robuste des données audio à chaque étape

---

## [1.0.1] - 2025-01-14

### Corrigé
- **Lecteur vidéo et bouton d'activation vocale** : Correction du flux d'activation audio
  - Fichiers modifiés: composants vidéo et configuration audio

### Changé
- **Avatar de Peter** : Mise à jour de l'icône avec une nouvelle image pour l'agent IA
  - Images mises à jour pour une meilleure représentation visuelle de Peter
  - Fichiers ajoutés: nouveaux assets d'avatar

---

## [1.0.0] - 2025-01-13

### Ajouté
- **Lecture audio automatique** : Message de bienvenue de l'assistant IA joué automatiquement
- **Déverrouillage audio** : Système de déverrouillage conforme aux politiques des navigateurs mobiles
- **Image principale agrandie** : Amélioration de la visibilité de l'image à analyser
- **Écran de titre optimisé** : Suppression des liens légaux pour une interface plus épurée

### Fonctionnalités Principales (MVP)

#### 🎤 Interaction Vocale
- Speech-to-Text via OpenAI Whisper (français)
- Text-to-Speech via ElevenLabs (voix multilingue Peter)
- Conversation IA avec GPT-4o-mini
- Fallback automatique en mode texte si problème micro/audio

#### 🖼️ Analyse d'Image Interactive
- Image fixe avec zoom
- Détection intelligente de 4 indices cachés :
  - 🧬 ADN (double hélice génétique)
  - 👶 Bébé (représentation de l'avenir)
  - 🗿 Le Penseur de Rodin (réflexion philosophique)
  - ♻️ Plastique/Pollution (enjeux environnementaux)
- Validation progressive avec feedback visuel et vocal

#### 📱 Expérience Utilisateur Mobile-First
- Design responsive optimisé pour smartphones et tablettes
- 5 écrans de flux : Titre → Vidéo Intro → Configuration → Tutoriel → Score
- Animations fluides (vumètre, stickers de succès)
- Indicateurs d'état clairs (recording, processing, playing, error)

#### 🏗️ Architecture Technique
- **Frontend** : React 18.3.1 + TypeScript 5.6.3 + Vite
- **Backend** : Node.js 20.16.11 + Express 4.21.2
- **Styling** : Tailwind CSS 3.4.17 + shadcn/ui
- **State Management** : TanStack Query 5.60.5
- **Routing** : Wouter 3.3.5
- **Animations** : Framer Motion 11.13.1

#### 🎯 APIs & Services
- OpenAI Whisper (STT)
- OpenAI GPT-4o-mini (LLM)
- OpenAI Assistant API (gestion conversationnelle)
- ElevenLabs (TTS avec voix Peter custom)

#### 💾 Stockage
- MemStorage : Stockage en mémoire (sessions, messages)
- Schema Drizzle préparé pour PostgreSQL (non activé en V1)

### Limitations Connues (V1)
- Stockage temporaire : Sessions perdues au redémarrage serveur
- Pas de comptes utilisateurs : Pas d'historique persistant
- 24 sessions max recommandé : Limitation mémoire RAM
- 1 seul niveau : Tutoriel uniquement
- Latence réseau : STT + LLM + TTS ≈ 2-4s

---

## [0.1.0] - 2025-01-10

### Ajouté
- Configuration initiale du projet
- Structure de base frontend/backend
- Intégration APIs OpenAI et ElevenLabs
- Composants UI de base avec shadcn/ui
- Système de routing avec Wouter
- Configuration Tailwind CSS
- Setup TypeScript pour frontend et backend

---

## Types de Changements

- `Ajouté` pour les nouvelles fonctionnalités
- `Changé` pour les modifications de fonctionnalités existantes
- `Déprécié` pour les fonctionnalités bientôt supprimées
- `Supprimé` pour les fonctionnalités supprimées
- `Corrigé` pour les corrections de bugs
- `Sécurité` pour les corrections de vulnérabilités

---

## Notes de Version

### Version 1.1.0 (Actuelle)
Cette version se concentre sur la **robustesse mobile** et l'**expérience utilisateur**. Les corrections apportées au flux audio garantissent que Peter peut parler de manière fiable après chaque interaction utilisateur, même sur les navigateurs mobiles les plus restrictifs (Safari iOS notamment). Le bouton "Rejouer" offre maintenant une vraie réinitialisation complète de l'expérience.

### Version 1.0.0 (MVP)
Première version fonctionnelle complète de l'application éducative interactive. Toutes les fonctionnalités principales sont implémentées et testées. L'application est prête pour des tests en conditions réelles avec des élèves.

---

## Liens Utiles

- [README.md](./README.md) - Documentation principale
- [ARCHITECTURE.md](./ARCHITECTURE.md) - Documentation technique détaillée
- [GitHub Issues](https://github.com/Ulrfis/Dilemme-Plastiqueproto-Light/issues) - Rapporter des bugs
- [Pull Requests](https://github.com/Ulrfis/Dilemme-Plastiqueproto-Light/pulls) - Proposer des améliorations
