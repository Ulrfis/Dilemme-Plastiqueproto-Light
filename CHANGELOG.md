# Changelog

Historique des modifications du projet Dilemme Plastique - Prototype Light.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/).

---

## [2025-11-15]

### Corrigé
- **Lecture audio critique sur mobile** (commit 444d662, 15:30:37)
  - Pré-chargement explicite de l'audio avant play()
  - Vérification du readyState de l'audio
  - Timeout de détection si play() ne démarre pas (5s)
  - Logs détaillés à chaque étape du flux audio
  - Événements audio supplémentaires (loadeddata, canplay, waiting, stalled)
  - Fichier: `client/src/hooks/useVoiceInteraction.ts`

- **Flux audio mobile et bouton rejouer** (commit 76b5429, 15:00:50)
  - Validation des blobs audio côté client et serveur
  - Nettoyage complet des éléments Audio entre les lectures
  - Détection automatique d'états bloqués avec récupération
  - Timeouts de sécurité améliorés (10s de marge pour mobile)
  - Bouton "Rejouer le tutoriel" retourne maintenant à l'écran de titre
  - Fichiers: `useVoiceInteraction.ts`, `TutorialScreen.tsx`, `api.ts`, `routes.ts`, `Home.tsx`

### Ajouté
- **Documentation projet** (commit c0befea, 15:17:59)
  - CHANGELOG.md créé
  - README.md mis à jour avec section "Dernières Améliorations"
  - ARCHITECTURE.md mis à jour avec détails des corrections v1.1.0

- **Avatar Peter** (commits 192cd51, 6f941de, 16b5bee, 14:44-14:48)
  - Nouvelle image d'avatar pour l'agent IA Peter

- **Lecteur vidéo et activation vocale** (commit 24b4a6e, 14:45:05)
  - Corrections du lecteur vidéo
  - Corrections du bouton d'activation vocale

- **Message de bienvenue audio** (commit 7d8fb0b, 14:27:52)
  - Lecture automatique du message de bienvenue de Peter

- **Écran de titre** (commit e749c83, 14:26:20)
  - Agrandissement de l'image principale
  - Suppression des liens légaux

- **Corrections mobile** (commits c3ea03f, d009f57, a10e41b, 13:38-14:06)
  - Désactivation autoplay vidéo
  - Corrections voix de Peter sur mobile
  - Redesign layout desktop
  - Fiabilité interaction vocale mobile

---

## Notes

- Tous les commits "Published your App" sont des déploiements automatiques
- Les dates sont au format UTC (temps universel)
- Version actuelle : 1.1.0
