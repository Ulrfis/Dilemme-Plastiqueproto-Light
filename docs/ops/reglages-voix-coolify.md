# Réglages de la voix de Peter — variables Coolify

Mode d'emploi des variables d'environnement qui pilotent la réactivité, le débit
et la charge, sans toucher au code.

---

## Comment ça marche

Les variables se règlent dans **Coolify → votre application → Environment
Variables**.

**Un changement demande un redémarrage de l'application** pour atteindre le
processus Node. C'est rapide (pas de reconstruction du code), mais ce n'est pas
instantané : comptez le temps d'un restart.

Le redémarrage a un effet de bord utile : il **vide le cache audio en mémoire**.
C'est ce qui fait qu'un changement de vitesse de diction s'entend tout de suite,
y compris sur le message d'accueil — sinon les phrases déjà en cache garderaient
l'ancien réglage.

> ⚠️ **Règle d'or** : une valeur vide, négative ou mal écrite **retombe
> silencieusement sur le défaut**. Aucune erreur, aucun message. Si un réglage
> semble sans effet, vérifiez d'abord qu'il est bien orthographié.

Après chaque changement : faites **deux ou trois tours de conversation** avant de
juger. Un seul tour ne dit rien — c'est justement l'irrégularité qu'on cherche à
mesurer.

---

## 1. Le débit de la voix

C'est ici que vous réglerez le plus souvent.

### `GRADIUM_PADDING_BONUS`

**Vitesse de diction de Peter.** Vide par défaut (Gradium décide).

| Valeur | Effet |
|---|---|
| `-4.0` à `-0.1` | Plus **rapide** (plus la valeur est basse, plus c'est rapide) |
| vide | Réglage par défaut de Gradium |
| `0.1` à `4.0` | Plus **lent** |

Commencez par `-0.5` ou `0.5` — les extrêmes sonnent artificiels. C'est un choix
d'oreille qui change le caractère de Peter, pas un réglage de performance.

### Le découpage en blocs

Chaque réponse de Peter est découpée en blocs audio. **Chaque bloc est un appel
séparé au service de synthèse vocale**, avec sa propre intonation et un petit
blanc à la jointure.

- **Moins de blocs** → débit plus régulier, mais le premier son arrive plus tard
- **Plus de blocs** → premier son plus tôt, mais rythme plus haché

| Variable | Défaut | Rôle |
|---|---|---|
| `TTS_PHASE1_MIN_CHARS` | `55` | Nombre de caractères avant que le **premier** bloc parte. Plus bas = Peter parle plus vite, mais son premier bloc est plus court. |
| `TTS_PHASE1_MAX_SENTENCES` | `2` | Nombre max de phrases dans le premier bloc. |
| `TTS_PHASE2_EARLY_CHARS` | `220` | Au-delà de ce volume, la suite part **en cours de rédaction** au lieu d'attendre la fin. Plus haut = moins de blocs = plus régulier. |
| `TTS_PHASE2_EARLY_SENTENCES` | `4` | Même chose, en nombre de phrases. |

Avec les défauts actuels, une réponse normale de Peter tient en **un ou deux
blocs**, jamais trois, et ne se termine jamais sur un bout de phrase isolé.

---

## 2. Recettes

### « Peter est trop lent à répondre »

1. `TTS_PHASE1_MIN_CHARS=40` — il commence à parler plus tôt
2. `GRADIUM_PADDING_BONUS=-0.5` — il parle un peu plus vite

Contrepartie : un premier bloc plus court se raccorde moins bien au suivant.

### « Son débit est irrégulier, parfois haché »

1. `TTS_PHASE2_EARLY_CHARS=400` et `TTS_PHASE2_EARLY_SENTENCES=8` — quasiment
   toutes les réponses tiendront en deux blocs au maximum

Contrepartie : sur une réponse longue, un silence plus marqué avant la suite.

### « Il parle trop vite, les élèves ne suivent pas »

1. `GRADIUM_PADDING_BONUS=0.5` puis `1.0` si besoin

### « J'entends un blanc au milieu de l'accueil »

C'est le réseau, pas le réglage : la phrase suivante n'a pas fini d'arriver.
Vérifiez d'abord sur une bonne connexion. Si ça persiste en classe, dites-le moi
— la parade est la compression des réponses audio, qui demande du code.

### « Ses réponses sont trop longues »

1. `OPENAI_MAX_OUTPUT_TOKENS=250` — plafond plus serré

⚠️ Trop bas, la réponse est **coupée en pleine phrase**. En dessous de 200,
attendez-vous à des phrases inachevées. Le défaut de 400 ne coupe jamais une
réponse normale.

---

## 3. Le comportement de Peter

### `OPENAI_MODEL`

Défaut `gpt-5.6-luna` — le plus rapide, choisi pour la latence.

| Valeur | Compromis |
|---|---|
| `gpt-5.6-luna` | Le plus rapide. Suffisant : tout le cadrage pédagogique vient du prompt. |
| `gpt-5.6-terra` | Plus capable, sensiblement plus lent |
| `gpt-5.6-sol` | Encore plus capable, encore plus lent |

Ne changez ce réglage que si la **qualité du dialogue** vous pose problème, pas
pour la vitesse.

### `OPENAI_REASONING_EFFORT`

Défaut `none` — aucune réflexion avant de répondre.

⚠️ **Ne le mettez pas à `medium` ou plus sans raison.** Peter « réfléchirait »
avant chaque réplique, ce qui ajoute une latence très visible en conversation
vocale. Valeurs : `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.

### `OPENAI_MAX_OUTPUT_TOKENS`

Défaut `400` (~1 400 caractères). Garde-fou contre une réponse qui s'emballe et
rend un tour sans commune mesure avec les autres. Voir l'avertissement en §2.

---

## 4. Les plafonds de charge

À régler pour une classe, pas pour un test solo. Ils protègent les services
externes d'être saturés par 25 élèves simultanés.

| Variable | Défaut | Rôle |
|---|---|---|
| `GRADIUM_MAX_CONCURRENT` | `5` | Synthèses vocales en parallèle |
| `GRADIUM_MAX_QUEUED` | `100` | File d'attente avant refus |
| `OPENAI_MAX_CONCURRENT_STREAMS` | `10` | Conversations en parallèle |
| `OPENAI_MAX_QUEUED_STREAMS` | `30` | File d'attente avant refus |
| `OPENAI_QUEUE_WAIT_TIMEOUT_MS` | `15000` | Attente max en file (15 s) |
| `OPENAI_RUN_TIMEOUT_MS` | `45000` | Temps max pour une réponse (45 s) |
| `DB_POOL_MAX` | `30` | Connexions PostgreSQL simultanées |

**Avant de monter `GRADIUM_MAX_CONCURRENT`**, vérifiez ce que votre abonnement
Gradium autorise : au-delà, vous serez limité côté fournisseur, ce qui est pire
qu'une file d'attente côté serveur.

Pour savoir si ces plafonds gênent réellement, regardez l'évènement PostHog
`server_pipeline_timing` avec `step: openai_queue_wait`. S'il est proche de zéro,
ne touchez à rien.

---

## 5. Les secrets

À renseigner une fois. **Ne les mettez jamais dans le code ni dans un commit.**

| Variable | Rôle |
|---|---|
| `OPENAI_API_KEY` | Conversation et transcription |
| `GRADIUM_API_KEY` | Synthèse vocale |
| `GRADIUM_VOICE_ID` | Voix utilisée pour Peter |
| `DEEPGRAM_API_KEY` | Transcription temps réel affichée pendant que l'élève parle |
| `DATABASE_URL` | PostgreSQL |
| `POSTHOG_API_KEY` | Analytics |
| `ADMIN_TOKEN` | Accès aux pages de diagnostic `/api/health/*` |
| `GOOGLE_SCRIPT_URL` | Synchronisation Google Sheets (optionnel) |
| `PORT` | Port d'écoute (défaut `5000`) |
| `NODE_ENV` | `production` en ligne |

---

## 5 bis. Lancer la sonde Gradium

Mesure la réactivité du service de synthèse vocale **depuis le serveur de
production**, là où la clé et le réseau existent déjà.

Ouvrez cette adresse dans votre navigateur, en remplaçant les deux morceaux :

```
https://VOTRE-DOMAINE/api/health/gradium-probe?token=VOTRE_ADMIN_TOKEN
```

`VOTRE_ADMIN_TOKEN` est la variable `ADMIN_TOKEN` dans Coolify.

Le résultat s'affiche en texte lisible : fréquence d'échantillonnage, temps
jusqu'au premier son, comparaison avec le fonctionnement actuel. Ajoutez
`&format=json` pour la version brute.

La sonde ne modifie rien — elle génère trois courtes phrases et mesure. Elle
consomme quelques crédits Gradium. Comptez une dizaine de secondes.

> ⚠️ Le verdict sur la fréquence repose sur un débit de parole supposé. S'il
> s'annonce en confiance « moyenne » ou « faible », il faut vérifier à l'oreille
> avant de s'en servir.

---

## 6. Ce qui n'est PAS réglable par variable

Utile à savoir pour ne pas chercher en vain :

- **Le texte du message d'accueil** — dans le code (`shared/welcome-audio.ts`)
- **Le prompt de Peter** — dans `docs/PROMPT_PETERBOT_V5_COMPLET.md`, recompilé
  par `npm run peter:prompt:build`
- **Le nombre d'indices (6), d'échanges (8 puis 15)** — dans
  `shared/tutorial-config.ts`
- **Les limites anti-abus** (300 requêtes / 15 min, 60 pour la voix) — en dur
- **La durée de vie des audios pré-générés** (1 min, 5 min pour l'accueil) — en dur
- **Le format audio** — WAV imposé : le MP3 renvoie un fichier vide côté Gradium

---

## 7. Variables réservées aux scripts de mesure

Elles **n'ont aucun effet sur l'application**. Les définir dans Coolify ne fait
rien — elles ne servent qu'en ligne de commande.

| Variable | Utilisée par |
|---|---|
| `GRADIUM_REGION` | `npm run probe:gradium`, `npm run bench:voice` (défaut `eu`) |
| `GRADIUM_WS_URL` | `npm run probe:gradium` |
| `RUNS` | `npm run bench:voice` |
| `BASE_URL`, `SESSIONS`, `TURNS`, `LOAD_TEST_MESSAGE` | `npm run test:load:class` |

---

## 8. Récapitulatif

| Variable | Défaut | Ce que ça change |
|---|---|---|
| `GRADIUM_PADDING_BONUS` | vide | Vitesse de diction (− rapide / + lent) |
| `TTS_PHASE1_MIN_CHARS` | `55` | Quand Peter commence à parler |
| `TTS_PHASE1_MAX_SENTENCES` | `2` | Taille du premier bloc |
| `TTS_PHASE2_EARLY_CHARS` | `220` | Régularité du débit |
| `TTS_PHASE2_EARLY_SENTENCES` | `4` | Régularité du débit |
| `OPENAI_MODEL` | `gpt-5.6-luna` | Qualité du dialogue ↔ vitesse |
| `OPENAI_REASONING_EFFORT` | `none` | ⚠️ Latence, à laisser tel quel |
| `OPENAI_MAX_OUTPUT_TOKENS` | `400` | Longueur max des réponses |
| `GRADIUM_MAX_CONCURRENT` | `5` | Voix simultanées en classe |
| `OPENAI_MAX_CONCURRENT_STREAMS` | `10` | Conversations simultanées |

---

## Si quelque chose casse

Remettez la variable à vide : elle reprend son défaut au redémarrage suivant.
Aucun réglage de ce document ne peut corrompre de données — au pire, Peter parle
mal.
