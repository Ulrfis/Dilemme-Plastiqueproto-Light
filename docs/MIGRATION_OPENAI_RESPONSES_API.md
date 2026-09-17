# Migration OpenAI : Assistants API vers Responses API

Date du plan : 7 juin 2026
Échéance annoncée de l'Assistants API : 26 août 2026
**Statut : migration effectuée le 17 septembre 2026.**

> ## Ce qui s'est réellement passé
>
> L'Assistants API a été fermée le 26 août 2026, sans période de grâce : tout
> appel à `/v1/assistants`, `/v1/threads` et `/v1/threads/runs` échoue. La
> conversation avec Peter est restée cassée en production pendant trois semaines
> (le message d'accueil, en playback statique, continuait de fonctionner et
> masquait la panne).
>
> **Le déploiement progressif décrit plus bas n'a pas pu être suivi.** Shadow,
> canary et retour arrière supposent tous que l'ancienne API réponde encore :
> il n'y avait plus rien vers quoi revenir, donc plus de filet. La bascule a été
> directe, sans variable `OPENAI_CONVERSATION_PROVIDER` ni double fournisseur —
> cet échafaudage n'avait plus d'objet.
>
> ### Implémentation retenue
>
> | Élément | Emplacement |
> |---|---|
> | Fournisseur Responses + Conversations | `server/peter-conversation.ts` |
> | Prompt Peter v5 compilé dans le bundle | `server/peter-prompt.ts` (généré) |
> | Générateur du prompt | `scripts/build-peter-prompt.mjs` (`npm run peter:prompt:build`) |
> | Colonne de session | `conversation_id` (`thread_id` conservé en lecture seule) |
> | Garde-fou de schéma au démarrage | `server/ensure-schema.ts` |
> | Modèle | `OPENAI_MODEL`, défaut `gpt-5.6-terra` |
>
> Le prompt ne peut pas être lu depuis `docs/` au runtime : l'image Docker ne
> copie que `dist/` et `attached_assets/`. Il est donc compilé dans le bundle,
> le Markdown restant la source de vérité relue par les humains, avec un test
> qui échoue si les deux divergent.
>
> ### Conséquence sur les sessions existantes
>
> Les `thread_id` en base pointent vers des threads supprimés. Les sessions
> commencées avant la fermeture ont perdu leur historique côté OpenAI ; elles
> repartent sur une nouvelle conversation au premier message. Aucune donnée
> pédagogique n'est touchée : indices, score et synthèses vivent en base.
>
> Le reste de ce document est conservé tel quel, comme trace du plan initial.

---

## Objectif

Migrer PeterBot vers Responses API et Conversations API sans modifier la
mécanique pédagogique, la détection serveur des indices, le streaming vers le
client, le TTS ni la capacité attendue pour une classe.

La base de données et le serveur restent la source de vérité. OpenAI produit le
dialogue, mais ne valide jamais un indice et ne décide jamais de l'état du jeu.

## Correspondances

| Assistants API actuelle | Cible Responses API |
|---|---|
| Assistant configuré dans OpenAI | Prompt versionné et instructions applicatives |
| Thread | Conversation API |
| `runs.stream(...)` | création d'une Response en streaming |
| `additional_instructions` | instructions dynamiques de la Response |
| `threadId` | `conversationId` |
| événements `thread.message.delta` | événements texte normalisés Responses |
| `runs.cancel(...)` | annulation de la Response ou du stream |

## Préparation sans rupture

1. Ajouter une colonne nullable `conversation_id` à `tutorial_sessions` et
   conserver `thread_id` pendant toute la transition.
2. Extraire l'appel OpenAI derrière une interface interne :

```ts
interface PeterConversationProvider {
  streamTurn(input: {
    sessionId: string;
    userMessage: string;
    dynamicInstructions: string;
    signal: AbortSignal;
  }): AsyncIterable<PeterStreamEvent>;
}
```

3. Implémenter `AssistantsPeterProvider`, puis `ResponsesPeterProvider`.
4. Déployer d'abord avec `OPENAI_CONVERSATION_PROVIDER=assistants`.
5. Attacher le fournisseur choisi à chaque session afin qu'une conversation
   déjà commencée ne change jamais de fournisseur en cours de route.

## Responsabilités du fournisseur Responses

- créer ou reprendre une Conversation liée à la session ;
- transmettre uniquement le vrai message utilisateur ;
- passer le contexte dynamique du jeu sans le persister comme message ;
- convertir les événements OpenAI vers les événements internes normalisés ;
- respecter l'`AbortSignal` et annuler toute génération devenue inutile ;
- ne jamais écrire dans `foundClues` ;
- retourner l'identifiant OpenAI utilisé pour l'observabilité.

```ts
type PeterStreamEvent =
  | { type: "text_delta"; text: string }
  | { type: "completed"; responseId: string }
  | { type: "failed"; responseId?: string; message: string };
```

## Déploiement progressif

1. **Tests locaux et staging** : tests unitaires du fournisseur et parcours
   complets texte/voix.
2. **Shadow hors séance** : rejouer des messages anonymisés vers Responses sans
   présenter ni persister sa réponse.
3. **Canary nouvelles sessions** : 5 %, puis 25 %, 50 % et 100 %.
4. **Retrait** : supprimer Assistants uniquement après une période stable et
   une restauration testée.

Ne jamais activer le shadow ou changer de fournisseur pendant une séance de
classe.

## Critères de passage à 100 %

- zéro faux indice ajouté par Peter ;
- zéro écriture tardive après timeout ou annulation ;
- taux de succès au moins égal à Assistants ;
- p95 du premier texte sans régression supérieure à 10 % ;
- prompt PeterBot v5 utilisé ;
- test synchronisé de 25 sessions réussi ;
- retour arrière testé.

## Observabilité requise

Pour chaque tour, journaliser :

- fournisseur et modèle ;
- `sessionId`, `turnId`, `conversationId` et `responseId` ;
- attente dans la file ;
- latence du premier delta et durée totale ;
- statut final : succès, annulé, timeout ou erreur.

## Retour arrière

Le retour arrière consiste à remettre
`OPENAI_CONVERSATION_PROVIDER=assistants` pour les **nouvelles sessions**
uniquement. Les sessions existantes restent attachées à leur fournisseur
d'origine.

## À ne pas faire

- supprimer `thread_id` avant la fin de la période de retour arrière ;
- déplacer l'état pédagogique dans OpenAI ;
- effectuer la migration en même temps que le passage multi-processus ;
- augmenter la concurrence avant d'avoir validé les quotas Responses.

## Références officielles

- [Guide de migration Assistants](https://platform.openai.com/docs/assistants/migration)
- [Migration vers Responses API](https://platform.openai.com/docs/guides/migrate-to-responses)
- [Dépréciations OpenAI](https://platform.openai.com/docs/deprecations)
