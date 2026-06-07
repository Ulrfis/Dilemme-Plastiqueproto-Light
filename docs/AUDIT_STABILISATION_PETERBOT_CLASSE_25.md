# Audit de stabilisation PeterBot et préparation d'une classe de 25 élèves

Date de l'audit : 7 juin 2026
Périmètre : prompt OpenAI PeterBot, tutoriel conversationnel, détection des indices,
timeouts, reprise après erreur, jeu post-tutoriel et capacité simultanée.

## 1. Résumé exécutif

Les problèmes observés ne proviennent pas d'une seule panne. Ils résultent de règles
contradictoires entre le prompt PeterBot, le serveur et l'interface :

1. Le code autorise 15 échanges et clôt au 14e, alors que le prompt indique encore
   une clôture après 6 à 7 échanges, avec un maximum de 8.
2. À partir de 8 échanges, le prompt demande à Peter d'expliquer les indices
   manquants. Peter peut donc révéler des indices que l'élève n'a pas trouvés.
3. Le serveur analyse ensuite la réponse de Peter comme si elle constituait une
   découverte de l'élève. Une formulation comme « double hélice » peut ainsi valider
   automatiquement `ADN`.
4. La variante visible `Plastic Treaty` n'est pas reconnue par la détection serveur,
   bien qu'elle soit explicitement prévue dans le prompt.
5. Après 30 secondes, le serveur ferme la réponse HTTP mais ne garantit pas
   l'annulation du run OpenAI. Un run tardif peut continuer en arrière-plan et écrire
   dans la session après que l'interface a affiché une erreur.
6. Le bouton `Poursuivre` apparaît dès 3 indices. Le jeu suivant affiche toujours
   les six mots disponibles, ce qui donne l'impression que l'application révèle
   les indices manquants après un plantage.
7. Les améliorations récentes pour les connexions multiples protègent correctement
   Deepgram, ElevenLabs et les quotas par session, mais la concurrence OpenAI reste
   un simple compteur avec un plafond par défaut trop élevé pour constituer une
   régulation fiable.

La correction la plus importante est conceptuelle :

> Peter peut guider et confirmer verbalement, mais seul le texte produit par
> l'élève doit pouvoir modifier l'état `foundClues`.

L'état du jeu doit rester entièrement déterministe et contrôlé par l'application.
Le modèle ne doit jamais être responsable de la validation d'un indice.

## 2. Symptômes observés et causes probables

| Symptôme | Cause confirmée ou très probable | Niveau |
|---|---|---|
| Peter bloque et « mouline » | Timeout OpenAI à 30 secondes, sans annulation complète du run | Critique |
| Peter donne `ADN` sans découverte de l'élève | Prompt de clôture + détection des mots dans la réponse de Peter | Critique |
| Peter révèle les indices manquants vers l'échange 7 | Prompt toujours configuré pour 8 échanges maximum | Critique |
| Peter dit valider `Traité`, mais le badge n'apparaît pas | `Plastic Treaty` absent des variantes serveur | Élevé |
| Après `Poursuivre`, tous les mots sont visibles | Le jeu post-tutoriel affiche volontairement les six mots | Élevé |
| Des états peuvent changer après un timeout | Le run peut continuer après fermeture de la réponse client | Critique |
| Une classe entière peut subir des lenteurs | Rafale simultanée OpenAI, Whisper, Deepgram et ElevenLabs | Élevé |

## 3. État actuel utile à préserver

Les corrections de charge du 1er juin 2026 sont pertinentes et ne doivent pas être
retirées :

- quotas coûteux attribués à une session plutôt qu'à l'adresse IP partagée ;
- une connexion Deepgram active maximum par session ;
- plafond global Deepgram par processus ;
- file bornée et prioritaire pour ElevenLabs ;
- priorité aux réponses audibles sur les tâches de fond ;
- abandon des pré-générations de reprise lorsque les services sont occupés ;
- suppression d'une régénération TTS redondante ;
- endpoint admin `/api/health/load` ;
- tests unitaires de la file de concurrence et des quotas.

Ces protections constituent une bonne base. Les recommandations ci-dessous les
complètent sans revenir sur leur fonctionnement.

## 4. Audit détaillé du prompt PeterBot

### 4.1 Contradictions à corriger

Le prompt attaché contient plusieurs contradictions internes ou avec le code :

| Règle actuelle | Problème |
|---|---|
| Le contexte indique `Échange X/8` | Le code utilise 15 échanges |
| « Après 6 à 7 échanges, il faut arriver à clore » | Peter commence à révéler avant la clôture applicative |
| « Après maximum 8 échanges » | Contradiction avec la clôture serveur au 14e échange |
| « Si après 8 échanges... Peter explique ceux qui manquent » | Révèle automatiquement les réponses |
| « Ne jamais mentionner les indices » | Contredit la consigne d'expliquer ceux qui manquent |
| « Si tu valides sa découverte » | Laisse croire au modèle qu'il peut valider l'état du jeu |
| Description riche de tous les indices | Augmente le risque que Peter les mentionne spontanément |

### 4.2 Séparer clairement les responsabilités

Le prompt doit expliciter trois rôles :

1. **Application** : détecte et valide les indices dans les paroles de l'élève.
2. **Bloc `[CONTEXTE DU JEU]`** : fournit à Peter l'état déjà calculé.
3. **Peter** : répond à l'élève, encourage et guide sans modifier ni inventer l'état.

Peter ne doit jamais :

- décider qu'un indice est trouvé ;
- annoncer qu'il vient de valider un indice non présent dans `Indices nouvellement
  trouvés par l'élève` ;
- révéler le nom d'un indice manquant ;
- déduire un indice depuis ses propres paroles ;
- compter les indices depuis l'historique ;
- annoncer une clôture sur la base de ses anciennes règles internes.

### 4.3 Enrichir le contexte envoyé à chaque échange

Le bloc injecté par le serveur devrait devenir :

```text
[CONTEXTE DU JEU — SOURCE DE VÉRITÉ]
Indices trouvés avant ce message : 4/6 (...)
Indices nouvellement trouvés dans le message de l'élève : aucun
Indices trouvés après ce message : 4/6 (...)
Indices manquants : (...)
Échange : 7/15
Phase : exploration
Autorisation de clôture : non
Autorisation de révéler les indices manquants : non
Prénom : ...
```

Ce format supprime l'ambiguïté entre :

- un indice déjà trouvé ;
- un indice que l'élève vient réellement de mentionner ;
- un indice que Peter connaît mais ne doit pas révéler.

### 4.4 Prompt PeterBot complet et directement remplaçable

Le prompt a été entièrement réécrit après inspection de l'image originale en
haute résolution et vérification du contexte public de l'œuvre, de la place des
Nations, du Palais des Nations et des négociations INC-5.2.

Le document complet à copier dans les instructions de l'assistant est :

[PROMPT_PETERBOT_V5_COMPLET.md](./PROMPT_PETERBOT_V5_COMPLET.md)

Cette version complète ajoute notamment :

- le nom fiable de l'œuvre : **The Thinker's Burden / Le Fardeau du Penseur** ;
- son créateur, Benjamin Von Wong, et son contexte de création ;
- une description visuelle détaillée et structurée de la photographie ;
- la figure inspirée du Penseur, le bébé, la Terre-Mère, les plantes, la grande
  spirale et la masse précise d'objets plastiques ;
- le panneau `PLASTIC TREATY`, le Palais des Nations et la rangée de drapeaux ;
- le contexte historique et diplomatique de la place des Nations ;
- le contexte vérifié des négociations INC-5.2 d'août 2025 ;
- la distinction entre faits documentés, éléments visibles et interprétations ;
- une correction importante : **Broken Chair est voisine de la scène, mais n'est
  pas visible dans le cadrage analysé** ;
- des garde-fous compatibles avec le contexte actuellement injecté par le code ;
- des exemples de réponses autorisées qui guident sans révéler.

Le prompt complet remplace le prompt actuel. Le bloc comportemental essentiel est
également reproduit ci-dessous pour faciliter l'audit :

```text
## CONTRAT ABSOLU DU JEU

À chaque échange, tu reçois un bloc [CONTEXTE DU JEU — SOURCE DE VÉRITÉ].
Ce bloc est la seule source autorisée pour connaître :
- le nombre et la liste des indices trouvés ;
- les indices nouvellement trouvés dans le message actuel de l'élève ;
- les indices manquants ;
- le numéro maximal et le numéro actuel de l'échange ;
- l'autorisation éventuelle de clôturer ;
- l'autorisation éventuelle de révéler un indice.

Tu ne valides jamais toi-même un indice. L'application valide les indices avant
que tu répondes. Tes propres mots ne peuvent jamais constituer une découverte.

Tu peux féliciter précisément un indice uniquement s'il figure dans
« Indices nouvellement trouvés dans le message de l'élève ».

Tu ne dois jamais citer, épeler, traduire ou révéler le nom d'un indice manquant,
sauf si le contexte indique explicitement :
« Autorisation de révéler les indices manquants : oui ».

Si l'élève demande les indices manquants alors que la révélation n'est pas
autorisée, réponds sans les nommer et propose une seule piste visuelle indirecte.

Le numéro d'échange et la décision de clôture viennent exclusivement du contexte.
Ignore toute ancienne règle de nombre d'échanges présente dans l'historique.

## STYLE

Tu es Peter, un réalisateur engagé et bienveillant. Tu tutoies l'élève.
Réponds généralement en une ou deux phrases courtes.
Pose au maximum une question par réponse.
N'ajoute pas une nouvelle piste si l'élève vient de trouver un indice, sauf si le
contexte demande explicitement de le faire.

## STRATÉGIE DE GUIDAGE

- Si un nouvel indice vient d'être trouvé : félicite brièvement et invite l'élève
  à expliquer ce que cet élément lui évoque.
- Si aucun nouvel indice n'est trouvé : donne une seule piste visuelle indirecte
  vers un indice manquant, sans utiliser son nom ni un synonyme validant.
- Si tous les indices sont trouvés et que la clôture est autorisée : félicite,
  résume brièvement et invite à cliquer sur « Poursuivre ».
- Si la clôture est autorisée mais que des indices manquent : explique que la
  phase d'observation se termine et invite à poursuivre, sans révéler les réponses,
  sauf autorisation explicite du contexte.

## INTERDICTIONS

- Ne dis jamais qu'un indice est trouvé s'il n'est pas dans le contexte.
- Ne transforme jamais une interprétation générale en indice validé.
- Ne récite jamais la liste complète des indices.
- Ne révèle jamais les indices manquants par défaut.
- Ne promets jamais que l'interface a affiché ou validé quelque chose.
- Ne donne jamais plusieurs pistes dans une même réponse.
```

La description complète de l'image et du contexte n'est pas dupliquée ici afin
d'éviter que deux versions divergent. Le fichier
`docs/PROMPT_PETERBOT_V5_COMPLET.md` est la source de vérité versionnée du prompt
PeterBot.

### 4.5 Recommandation sur la révélation finale

Deux choix pédagogiques sont possibles, mais un seul doit être retenu :

#### Option recommandée : ne jamais révéler pendant le tutoriel

- L'élève peut cliquer sur `Poursuivre` à la fin de la durée prévue.
- Les indices manquants restent marqués comme non trouvés.
- Le jeu suivant peut les faire découvrir de manière contrôlée.
- Les statistiques reflètent les découvertes réelles.

#### Option alternative : révélation explicite et séparée

Si une révélation finale est indispensable :

- le serveur passe `Autorisation de révéler les indices manquants : oui` ;
- les indices révélés sont stockés séparément dans `revealedClues` ;
- ils ne sont jamais ajoutés à `foundClues` ;
- l'interface distingue « trouvé par l'élève » et « expliqué par Peter » ;
- le score ne compte que `foundClues`.

## 5. Corrections applicatives recommandées

### P0 — À corriger avant le prochain test de classe

#### 5.1 Ne détecter les indices que dans le message de l'élève

Supprimer la détection des indices dans `fullResponse` et `assistantResponse`.

État attendu :

```text
message élève -> detectClues -> mise à jour foundClues -> contexte Peter -> réponse
```

État interdit :

```text
réponse Peter -> detectClues -> mise à jour foundClues
```

Cette correction doit être appliquée aux routes streaming et non-streaming.

#### 5.2 Ajouter les variantes réellement visibles et prononcées

Ajouter au minimum :

- `plastic treaty` ;
- variantes de transcription probables comme `plastique treaty` ;
- apostrophes, accents et pluriels utiles.

Les variantes trop larges doivent être supprimées ou encadrées. Par exemple,
`traité` seul peut valider un indice dans une phrase sans rapport. `plastique` seul
valide actuellement `Déchets plastiques`, même si l'élève parle seulement d'une
bouteille ou du thème général.

Une détection plus robuste devrait :

- normaliser accents, casse, apostrophes et espaces ;
- utiliser des limites de mots plutôt que `includes` ;
- séparer variantes fortes et variantes ambiguës ;
- exiger deux termes pour certaines variantes ambiguës ;
- conserver la phrase source ayant déclenché la validation.

#### 5.3 Annuler réellement les runs après timeout ou déconnexion

Lors d'un timeout serveur ou d'une fermeture du client :

1. arrêter la lecture du stream ;
2. annuler le run OpenAI si son identifiant est connu ;
3. marquer le tour `aborted` ;
4. interdire toute écriture tardive de message, indice ou compteur ;
5. libérer immédiatement le slot de concurrence.

Ajouter un identifiant de tour unique, par exemple `turnId`, et vérifier qu'il est
toujours actif avant chaque écriture en base.

#### 5.4 Un seul tour actif par session

Maintenir un verrou par `sessionId` :

- si un tour est actif, refuser ou remplacer proprement la nouvelle demande ;
- ne jamais lancer deux runs en parallèle sur le même thread/conversation ;
- retourner une erreur explicite et récupérable au client ;
- désactiver temporairement micro et saisie pendant le traitement.

#### 5.5 Aligner toutes les règles de clôture

Définir une seule configuration partagée :

```text
CLUE_CHALLENGE_EXCHANGES
MAX_CONVERSATION_EXCHANGES
MIN_CLUES_TO_ALLOW_EARLY_EXIT
REVEAL_MISSING_CLUES_AT_END
```

Le client, le serveur et le prompt doivent tous recevoir ces mêmes valeurs. Aucun
nombre d'échanges ne doit être écrit manuellement dans le prompt permanent.

### P1 — Fiabilité et expérience utilisateur

#### 5.6 Clarifier le bouton `Poursuivre`

Le bouton apparaît actuellement dès 3 indices. Choisir explicitement :

- soit il apparaît uniquement à 6/6 ;
- soit il reste disponible avant 6/6 avec une confirmation :
  « Il reste 2 indices. Veux-tu vraiment passer à la suite ? ».

Ne jamais laisser croire que Peter a terminé ou validé les indices manquants.

#### 5.7 Revoir le jeu de phrase

Le jeu affiche les six mots, même si certains n'ont pas été trouvés. Solutions :

- présenter cet écran comme une phase d'apprentissage qui révèle volontairement
  toutes les notions ;
- ou n'afficher que les mots découverts, avec un mécanisme distinct pour les autres ;
- ou afficher un badge `trouvé` / `à découvrir` sur chaque mot.

Le texte doit expliquer clairement le changement de phase.

#### 5.8 Récupération après erreur

Après un timeout :

- conserver le texte de l'élève ;
- afficher « Peter a mis trop de temps à répondre. Ta découverte n'a pas été perdue. » ;
- proposer `Réessayer cette réponse` plutôt qu'un nouvel échange complet ;
- ne pas incrémenter le compteur tant que le tour n'est pas terminé ;
- empêcher `Poursuivre` pendant une écriture serveur encore active.

#### 5.9 Réduire les réponses et le coût du prompt

Le prompt actuel contient une description longue de l'image à chaque run via
l'Assistant. Pour diminuer la latence et le risque de fuite d'indices :

- conserver des instructions comportementales courtes et prioritaires ;
- déplacer les connaissances détaillées dans une section secondaire ;
- demander une réponse de 1 à 2 phrases et un faible plafond de sortie ;
- éviter les récapitulatifs complets sauf clôture explicite ;
- supprimer les règles contradictoires et répétées.

### P2 — Architecture à moyen terme

#### 5.10 Migrer hors de l'Assistants API

Le projet utilise actuellement l'Assistants API avec threads et runs. OpenAI a
annoncé son arrêt au **26 août 2026**. Il faut planifier rapidement une migration
vers Responses API et Conversations API.

La migration doit être effectuée après les corrections P0, dans une branche et avec
des tests de non-régression :

- conserver l'état du jeu dans PostgreSQL ;
- versionner le prompt côté application ou avec les objets Prompt OpenAI ;
- utiliser une conversation par session ;
- conserver le streaming ;
- implémenter explicitement timeout, annulation et idempotence ;
- comparer latence, coût et comportement pédagogique avant bascule.

Références officielles :

- https://platform.openai.com/docs/deprecations
- https://platform.openai.com/docs/assistants/migration
- https://platform.openai.com/docs/guides/migrate-to-responses

## 6. Préparation technique pour 25 élèves simultanés

### 6.1 Charge à prévoir

Une classe de 25 élèves peut produire presque simultanément :

- 25 WebSockets Deepgram ;
- 25 uploads Whisper ;
- 25 générations OpenAI ;
- entre 25 et 75 générations ElevenLabs selon le découpage des réponses ;
- 25 flux SSE ;
- des écritures PostgreSQL et événements PostHog associés.

La difficulté principale est la rafale synchronisée : l'enseignant demande à toute
la classe de parler ou de cliquer au même moment. Une moyenne confortable ne suffit
pas ; le système doit absorber les pics.

### 6.2 Admission OpenAI recommandée

Le plafond actuel par défaut de 50 streams actifs est trop élevé pour un premier
objectif de 25 élèves. Il accepte potentiellement deux runs par élève sans file
d'attente ni protection contre les runs zombies.

Mettre en place une file OpenAI bornée similaire à la file ElevenLabs :

```env
OPENAI_MAX_CONCURRENT_STREAMS=10
OPENAI_MAX_QUEUED_STREAMS=30
OPENAI_QUEUE_WAIT_TIMEOUT_MS=15000
OPENAI_RUN_TIMEOUT_MS=45000
```

Ces valeurs sont des points de départ à mesurer, pas une garantie universelle.
La valeur de concurrence doit être ajustée selon :

- les limites RPM et TPM du projet OpenAI ;
- le modèle choisi ;
- la longueur réelle du prompt et des réponses ;
- les résultats des tests de charge.

Les limites OpenAI sont appliquées au niveau organisation/projet et varient selon
le modèle. Elles doivent être contrôlées dans le tableau de bord OpenAI avant la
séance. Référence : https://platform.openai.com/docs/guides/rate-limits

### 6.3 Réglages ElevenLabs

Conserver la file existante, puis calibrer :

```env
ELEVENLABS_MAX_CONCURRENT=5
ELEVENLABS_MAX_QUEUED=75
```

Actions recommandées :

- confirmer la limite de concurrence du contrat ElevenLabs ;
- mesurer le temps d'attente dans la file, pas seulement le temps API ;
- limiter Peter à une ou deux phrases ;
- réduire le nombre de segments TTS par réponse ;
- en cas de file trop longue, afficher le texte immédiatement et rendre l'audio
  optionnel plutôt que bloquer la conversation ;
- abandonner toutes les tâches TTS de fond pendant la séance.

### 6.4 Deepgram et Whisper

Deepgram est non bloquant pour l'expérience et doit le rester :

- une connexion maximum par session ;
- fermeture immédiate à la fin de l'enregistrement ;
- fallback Whisper si Deepgram échoue ;
- ne jamais empêcher l'envoi du message à cause d'un échec Deepgram.

Pour Whisper :

- mesurer taille des uploads et temps de transcription ;
- conserver une limite de taille stricte ;
- ajouter timeout et annulation ;
- contrôler la limite OpenAI audio du projet ;
- éviter une retranscription inutile lorsque le texte Deepgram final est suffisamment
  fiable, si cela est validé pédagogiquement.

### 6.5 Infrastructure de départ

Pour un test de 25 élèves :

| Élément | Recommandation initiale |
|---|---|
| Processus Node | 1 |
| CPU | 4 cœurs minimum |
| RAM | 8 GB |
| Réseau serveur | 100 Mbit/s minimum |
| Base | PostgreSQL/Neon surveillé |
| Reverse proxy | Timeout SSE/WebSocket supérieur au timeout applicatif |
| Déploiement | Aucun redéploiement pendant une séance |

Conserver un seul processus tant que les stores audio et les tokens sont en mémoire.
Avant toute réplication horizontale, déplacer vers Redis ou stockage partagé :

- verrous de session ;
- tokens et promesses TTS, ou remplacement par objets stockés ;
- état de file distribué si nécessaire ;
- éventuels caches de reprise.

### 6.6 Dégradation contrôlée

Le système doit rester utilisable même si un fournisseur ralentit :

| Fournisseur indisponible ou lent | Comportement attendu |
|---|---|
| Deepgram | Continuer avec Whisper ou saisie texte |
| Whisper | Permettre la saisie texte et conserver l'enregistrement pour réessai |
| OpenAI | Message clair, réessai idempotent, aucune mutation tardive |
| ElevenLabs | Afficher le texte immédiatement, audio désactivé pour ce tour |
| PostHog | Ne jamais bloquer l'expérience |
| Google Sheets | Synchronisation différée, jamais dans le chemin critique |

### 6.7 Objectifs mesurables de service

Avant une séance de classe, viser :

| Mesure | Objectif |
|---|---|
| Taux de tours terminés sans erreur | >= 98 % |
| Premier texte Peter p50 | < 3 s |
| Premier texte Peter p95 | < 8 s |
| Premier audio p50 | < 6 s |
| Premier audio p95 | < 12 s |
| Timeout OpenAI | < 1 % des tours |
| Erreurs TTS | < 2 % des tours |
| Sessions bloquées après erreur | 0 |
| Faux indices validés | 0 |
| Runs simultanés par session | <= 1 |
| Perte d'un message utilisateur | 0 |

## 7. Plan de tests avant une classe de 25 élèves

### 7.1 Tests automatisés indispensables

Ajouter des tests unitaires pour :

- `Plastic Treaty` valide `Traité plastique` ;
- une réponse Peter contenant `ADN` ne modifie jamais `foundClues` ;
- une phrase ambiguë ne valide pas un indice par accident ;
- un indice déjà trouvé n'est pas dupliqué ;
- le compteur n'est pas incrémenté après timeout ;
- aucune écriture n'est effectuée après annulation ;
- deux requêtes simultanées sur une session ne lancent pas deux runs ;
- un tour réessayé ne crée pas de doublon ;
- client et serveur utilisent les mêmes règles de clôture.

Ajouter des tests d'intégration simulant :

- stream normal ;
- stream vide ;
- premier delta tardif ;
- timeout avant le premier delta ;
- timeout après une réponse partielle ;
- déconnexion navigateur ;
- erreur OpenAI ;
- erreur ElevenLabs ;
- navigation vers `Poursuivre` pendant un tour actif.

### 7.2 Tests de charge progressifs

Ne pas commencer directement avec 25 élèves réels.

#### Palier A — 5 sessions

- Valider les parcours et l'observabilité.
- Provoquer volontairement un timeout.
- Vérifier qu'aucune mutation tardive n'apparaît.

#### Palier B — 10 sessions synchronisées

- Tous les clients démarrent l'enregistrement ensemble.
- Tous envoient leur message dans une fenêtre de 2 secondes.
- Observer files OpenAI et ElevenLabs, CPU, RAM et latences p95.

#### Palier C — 25 sessions synchronisées

- Réaliser au moins 5 échanges par session.
- Mélanger voix, texte, timeout et navigation.
- Durée minimale : 20 minutes.
- Répéter le test au moins trois fois.

#### Palier D — Marge de sécurité à 30 sessions

- Vérifier que le système ralentit proprement sans planter.
- Les requêtes excédentaires doivent attendre ou recevoir une réponse récupérable.

### 7.3 Critères de validation du test à 25

La séance est autorisée uniquement si :

- aucun processus ne redémarre ;
- aucun état d'indice n'est créé depuis une réponse Peter ;
- aucune session ne reste bloquée après timeout ;
- les files restent bornées ;
- le p95 respecte les objectifs définis ;
- les erreurs sont visibles dans PostHog avec `session_id`, service et contexte ;
- un rapport de test liste les limites fournisseurs observées.

## 8. Observabilité et alertes

### 8.1 Étendre `/api/health/load`

Ajouter :

- file OpenAI : actifs, attente, rejets, temps d'attente p50/p95 ;
- nombre de runs annulés et expirés ;
- nombre de sessions verrouillées ;
- âge du plus ancien tour actif ;
- nombre de réponses HTTP fermées avec traitement encore actif ;
- latence PostgreSQL ;
- taux d'erreur par fournisseur ;
- état du mode dégradé.

### 8.2 Événements PostHog supplémentaires

Ajouter :

- `openai_queue_wait` ;
- `openai_run_cancelled` ;
- `openai_run_late_completion_blocked` ;
- `session_turn_conflict` ;
- `clue_detection_candidate` avec source `user` uniquement ;
- `clue_revealed_by_assistant` comme alerte de qualité ;
- `degraded_mode_activated` avec fournisseur et raison ;
- `continue_with_missing_clues`.

### 8.3 Alertes avant et pendant la séance

Configurer des alertes :

- p95 premier texte > 8 secondes ;
- timeout OpenAI > 1 % ;
- file OpenAI > 20 ;
- file ElevenLabs > 40 ;
- erreur fournisseur > 5 % sur 5 minutes ;
- mémoire > 75 % ;
- redémarrage du processus ;
- apparition d'un `clue_revealed_by_assistant`.

## 9. Procédure opérationnelle pour une séance

### La veille

- vérifier les crédits, quotas et limites OpenAI, ElevenLabs et Deepgram ;
- exécuter un test synchronisé à 25 ;
- vérifier les dashboards et alertes ;
- figer la version déployée ;
- noter le commit exact et les variables de concurrence.

### Quinze minutes avant

- vérifier `/api/health/load` et `/api/health/ai` ;
- vérifier CPU, RAM, base et réseau ;
- lancer deux parcours complets de contrôle ;
- confirmer qu'aucun déploiement automatique n'est prévu ;
- préparer une URL de secours ou le mode texte.

### Pendant

- surveiller files, p95, timeouts et mémoire ;
- ne pas modifier les variables ou redéployer sans nécessité critique ;
- en cas de saturation TTS, passer temporairement en texte plutôt que relancer ;
- conserver les identifiants des sessions en erreur pour analyse.

### Après

- exporter les métriques de la fenêtre de séance ;
- analyser les sessions ayant timeout ;
- vérifier les faux positifs d'indices ;
- documenter les p50/p95 et les limites fournisseurs ;
- ne relever les plafonds qu'après compréhension des résultats.

## 10. Ordre d'implémentation recommandé

### Lot 1 — Intégrité pédagogique et état

1. Supprimer la détection dans les réponses Peter.
2. Ajouter et tester `Plastic Treaty`.
3. Aligner la clôture prompt/code/client.
4. Déployer le prompt PeterBot v5.
5. Clarifier `Poursuivre` et le jeu suivant.

### Lot 2 — Timeouts et concurrence

1. Annulation réelle OpenAI.
2. Verrou d'un tour actif par session.
3. Idempotence par `turnId`.
4. File OpenAI bornée.
5. Mode texte immédiat en cas de saturation TTS.

### Lot 3 — Validation classe

1. Tests automatisés de non-régression.
2. Dashboards et alertes supplémentaires.
3. Tests synchronisés à 5, 10, 25 puis 30 sessions.
4. Rapport de capacité et réglages finaux.

### Lot 4 — Pérennité

1. Migration Assistants API vers Responses API et Conversations API.
2. Externalisation Redis avant réplication.
3. Test de bascule et déploiement sans interruption.

## 11. Définition de « terminé »

La stabilisation peut être considérée terminée lorsque :

- un indice ne peut être ajouté que depuis un message utilisateur ;
- prompt, serveur et client partagent les mêmes règles ;
- `Plastic Treaty` est reconnu ;
- un timeout annule le traitement et interdit toute écriture tardive ;
- une session ne peut avoir qu'un tour actif ;
- la navigation après erreur est compréhensible ;
- le test synchronisé à 25 respecte les objectifs de service ;
- les métriques permettent d'expliquer chaque échec ;
- un plan daté de migration hors Assistants API est validé.

## 12. État d'implémentation au 7 juin 2026

### Implémenté dans l'application

- validation des indices uniquement depuis le message de l'élève ;
- aucune mutation pédagogique depuis la réponse de Peter ;
- détection normalisée et reconnaissance de `Plastic Treaty` ;
- constantes partagées pour les 6 indices, les 15 échanges et la clôture ;
- contexte dynamique enrichi : trouvés, nouveaux, manquants et autorisations ;
- instructions explicites interdisant à Peter de révéler ou valider un indice ;
- `turnId`, un seul tour actif ou en attente par session et file OpenAI bornée ;
- annulation sur déconnexion/timeout et blocage des écritures tardives ;
- compteur client avancé uniquement après confirmation serveur ;
- suppression du fallback automatique pouvant créer un double tour ;
- confirmation avant `Poursuivre` lorsqu'il manque des indices ;
- explication claire du jeu de phrase suivant ;
- métriques de file OpenAI et alerte `clue_revealed_by_assistant` ;
- tests unitaires de détection et de contrôle des tours ;
- script reproductible `npm run test:load:class`.

### À réaliser au déploiement

1. Configurer les variables OpenAI documentées dans
   [DEPLOYMENT_COOLIFY.md](./DEPLOYMENT_COOLIFY.md).
2. Vérifier les quotas réels OpenAI, ElevenLabs et Deepgram du compte.
3. Créer les alertes PostHog documentées.
4. Exécuter les tests synchronisés à 5, 10, 25 puis 30 sessions sur staging.
5. Reporter les p50/p95, erreurs et réglages retenus avant la séance.

### Migration OpenAI

La procédure progressive et le retour arrière sont détaillés dans
[MIGRATION_OPENAI_RESPONSES_API.md](./MIGRATION_OPENAI_RESPONSES_API.md).

## 13. Règle conversationnelle mise à jour au 7 juin 2026

La limite pédagogique et la limite technique sont désormais distinctes :

- échanges 1 à 8 : défi créatif pour tenter de trouver les 6 indices ;
- échanges 9 à 14 : discussion complémentaire, avec indices toujours validables ;
- échange 15 : dernier message traité normalement, puis conclusion ;
- après 15 échanges terminés : nouvelle demande refusée côté serveur.

Trouver les 6 indices ne ferme plus la conversation. Peter propose `Poursuivre`,
mais l'élève peut continuer à discuter. Le serveur transmet la phase et les deux
seuils dans le contexte dynamique.

Le prompt correspondant est
[PROMPT_PETERBOT_V5_COMPLET.md](./PROMPT_PETERBOT_V5_COMPLET.md). Pour le
synchroniser avec l'assistant OpenAI :

```bash
OPENAI_API_KEY=... npm run openai:update-peter-prompt
```
