# Prototype V1 – Guide d’Image IA – Spécification Fonctionnelle

## Objectif du Prototype

* Démontrer le concept de base : analyse guidée d’une image fixe via un agent conversationnel, découverte d’indices (mots-clés), validation, score et progression.

* Interaction **par la voix comme standard** : utilisateur parle, l’IA écoute et répond à l’oral.

* Utilisable en priorité sur mobile (mobile-first), session ≤ 5 minutes pour le tutoriel, testable en classe, plusieurs sessions en parallèle (24 minimum).

## Périmètre du Prototype

* **Inclus** :

  * Écran titre

  * Intro vidéo courte

  * Tutoriel avec 1 image fixe

  * 4 indices à découvrir (mots-clés)

  * Conversation avec l’IA **par voix (STT/TTS) par défaut**

  * Validation, score, écran de fin

  * Paramètres simples, feedback vocal et visuel

* **Exclus** :

  * Recherche documentaire dynamique (RAG étendu)

  * Multi-niveaux complets (hors tutoriel et niveau 1 si inclus)

  * Comptes utilisateurs, analytics avancées

---

## Parcours Utilisateur (UX Flow)

1. **Écran titre**

  * Logo/projet, ambiance visuelle

  * Bouton “Commencer”

  * Lien “Mentions / confidentialité” discret

2. **Intro vidéo**

  * Vidéo courte (20–40s) de Peter en plein écran

  * Boutons “Passer” et “Rejouer”

3. **Écran d’accueil tutoriel**

  * IA: “Comment dois-je t’appeler ?” + champ prénom

  * **Par défaut : Mode “Voix-Voix” (micro + synthèse vocale)**

  * Indicateur de statut du micro et test audio

  * **Si problème micro ou TTS : indication claire et bascule automatique sur mode texte**

  * Bouton “Démarrer le tutoriel”

4. **Écran principal (tutoriel)**

  * **Layout mobile** :

    * Haut : compteur indices découverts (ex. 0/4) + icône d’aide

    * Centre : image fixe à analyser (responsive, zoom désactivé)

    * **Bas : zone conversation (toujours axée voix)**

      * Bouton micro “Parler”

      * **Vue-mètre audio (animation pendant enregistrement)**

      * Indicateur “Enregistrement en cours”, passage à “Traitement”, puis “Lecture” au playback

      * Transcription visible de la reconnaissance vocale

    * **Fallback** : si système audio indisponible ou échec micro, passage visible en saisie texte + lecture des prompts à l’oral si possible, sinon affichage texte

    * Option : bouton “Terminer le niveau” dès 2 indices trouvés

5. **Détection & validation des indices**

  * 4 mots-clés cibles : “ADN”, “bébé”, “penseur de Rodin”, “plastique / pollution plastique” (+ variantes acceptées)

  * Synonymes, pluriels, déclinaisons linguistiques

  * Chaque indice compté une fois ; à partir de 2, suggestion de valider ou continuer

  * **Feedbacks systématiquement vocaux et visuels** :

    * Animation “indice trouvé” (sticker/emoji ou vidéo Peter_bot dansante)

    * Compteur visuel mis à jour

    * **Message de validation prononcé par l’IA (TTS/ElevenLabs)**

    * Si TTS échoue, fallback affichage texte

6. **Validation et score**

  * Écran score :

    * Liste indices trouvés (check visuel et lecture vocale)

    * Score simple (2/4, 3/4, 4/4)

    * Feedback synthétique **lu à voix haute par l’IA**

    * Boutons “Rejouer le tutoriel”, “Niveau 1” (si inclus)

  * Si utilisateur continue : retour à l’écran principal, jusqu’à 4 indices puis score

7. **Fin de session**

  * Écran fin avec call-to-action

    * “Prochain : Niveau 1 – Pollution dans la mer” (si inclus)

    * “Merci – fin du prototype”

    * Champ email (intérêt inscription, non-stocké)

---

## Fonctionnalités Clés & Exigences Fonctionnelles

* **Le parcours voix-voix est l'expérience standard exigée pour tous**.

* **Le fallback textuel n’est activé que s’il y a problème technique détecté (micro inactif, permission refusée, TTS échoué)**.

* Aucune modalité texte-texte n’apparaît comme premier choix.

---

## Expérience Utilisateur (UX) – Voix comme Standard

1. **Par défaut** : démarrage de l’expérience en mode voix-voix.

2. Sur chaque écran avec interaction :

  * **Icône micro** avec feedback dynamique (idle, recording, processing, playback)

  * Animation vumètre et indication “Enregistrement…”

  * **Permettre à l’utilisateur de comprendre si le micro fonctionne ou non** (alertes claires permissions navigateur, erreurs affichées façon pop-up claire)

  * Après reconnaissance : transcription affichée + feedback IA immédiat

  * Lecture de la réponse IA par ElevenLabs (TTS), animation de lecture en cours

  * **En cas d’échec (micro ou TTS)** :

    * Message d’alerte explicite

    * Basculer interface en saisie texte + affichage texte réponses IA

    * Indication très visible du mode fallback utilisé

3. Navigation mobile-first, tous boutons grands/ergonomiques.

4. Expérience la plus fluide possible (≤2s pour chaque opération voix=>voix).

5. **Pas de choix “texte-texte” proposé à l’utilisateur, le texte seul n’est qu’un repli d’urgence**.

---

## Spécifications Techniques et Compatibilité Replit

### Voix

* **Speech-to-Text** :

  * OpenAI Whisper API (ou autre STT stable compatible Replit, API cloud)

  * Capture audio navigateur : gestion des permissions via front-end (Web Audio/MediaRecorder)

  * Alertes claires si refus ou erreur micro, offre automatique fallback texte

* **Text-to-Speech** :

  * ElevenLabs API (clé sécurisée, usage via backend ou proxy sécurisé si besoin)

  * Playback streaming si réseau le permet

  * Timeout/erreur = passage à l’affichage texte (logique UI claire)

  * Lecture audio obligatoire sauf détection d’indisponibilité TTS

* **Compatibilité Replit** :

  * Tous traitements côté client (capture audio, permissions)

  * Aucun stockage d’audio hors mémoire de session

  * Clés API sécurisées (jamais client-side en clair)

### Agent IA

* Assistant OpenAI (GPT-4.x/Omni), instructions few-shot pour la validation des indices, réponses courtes (1–2 phrases)

* Contexte minimal structuré avec image, indices, et variantes acceptées

* Pas de RAG, pas de recherche externe, pas d’expansion des fonctionnalités

### Gestion États utilisateur

* États principaux : Idle | Recording | Processing | Playing | Error

* Switch explicite fallback texte si besoin

* Toutes transitions accompagnées d'animation ou feedback visuel

### Fallbacks

* Si **micro inaccessible/refusé** → saisie texte

* Si **TTS unavailable** → texte affiché à l’écran seulement

* Indication explicite sur l’interface du mode fallback en cours

### Analytique (optionnel V1)

* Logs simples (durée session, nb échanges, score et mode interaction), stockage local/session ou webhook (sans perso)

---

## Exigences sur Permissions, Sécurité et Conformité

* **Permission microphone exigée dès l’entrée du tutoriel**

* Popup/navigation claire si la permission n’est pas donnée ou erreur détectée

* Utilisation ElevenLabs doit garantir le respect des quotas et du RGPD (pas de stockage voix utilisateur)

* Pas de collecte ni stockage du prénom ou données personnelles

---

## Milestones & Séquencement

---

## Résumé

Ce prototype impose **l’usage de la voix (microphone + TTS) comme parcours standard** dès la V1, avec fallback texte uniquement en cas d’indisponibilité technique. Toutes les interactions, validations et feedbacks passent d’abord par la voix, et l’interface guide l’utilisateur de façon explicite selon l’état du micro et du TTS. **Aucune modalité texte-texte n’est incluse par défaut**, ce mode ne s’active que comme solution de secours, toujours après tentative voix. Toutes les solutions techniques et UX sont compatibles avec les contraintes de déploiement web (Replit, permissions navigateur, sécurisation clés API), et aucun périmètre n’est étendu hors du scope défini.

---