# Intégrer Dilemme Plastique dans un autre site (iframe)

> **En une ligne** : l'iframe doit porter `allow="microphone"`, sinon le micro
> est bloqué par le navigateur et seule la voix de Peter fonctionne.

## Le code à donner au site hôte

```html
<iframe
  src="https://proto-dilemme2.edugami.app"
  allow="microphone; autoplay; fullscreen"
  width="100%"
  height="800"
  style="border: 0"
  title="Dilemme Plastique"
></iframe>
```

| Permission   | À quoi elle sert                                        | Si elle manque                                        |
|--------------|---------------------------------------------------------|-------------------------------------------------------|
| `microphone` | Enregistrer la voix de l'élève (STT Whisper + Deepgram) | **Le micro ne marche pas du tout** — l'app bascule en mode texte |
| `autoplay`   | Lancer la voix de Peter sans nouveau clic               | Peter parle quand même, mais parfois après un clic de plus |
| `fullscreen` | Bouton plein écran de l'image                           | L'image ne peut pas passer en plein écran             |

Trois conditions supplémentaires, indépendantes de l'attribut `allow` :

- **Le site hôte doit être en HTTPS.** Le micro est refusé sur une page servie
  en `http://` (sauf `localhost`).
- **Pas d'attribut `sandbox` restrictif.** Si le site hôte en met un, il doit
  contenir au minimum `allow-scripts allow-same-origin allow-popups`.
- **Chaque élève doit autoriser le micro une fois**, dans la fenêtre de
  permission du navigateur. Avec `allow="microphone"`, cette fenêtre s'affiche
  ; sans lui, elle ne s'affiche jamais.

## Pourquoi ce n'est pas réparable depuis l'application

C'est une garantie de sécurité des navigateurs, pas un bug : une page ne peut
pas s'accorder à elle-même l'accès au micro depuis une iframe. La fonctionnalité
`microphone` est régie par la *Permissions Policy*, dont la valeur par défaut est
`self` — elle ne s'applique donc qu'au document de premier niveau. Une iframe
d'une autre origine ne l'obtient que si la page qui l'intègre la lui délègue
explicitement avec `allow="microphone"`.

Concrètement, sans cet attribut :

```js
await navigator.mediaDevices.getUserMedia({ audio: true });
// -> NotAllowedError: Permission denied
// ... sans jamais afficher de demande de permission à l'élève
```

La **lecture** audio (la voix de Peter) n'est pas concernée par cette policy.
D'où le symptôme caractéristique : **Peter parle, mais le micro échoue**.

L'autorisation doit donc venir du site hôte. Il n'existe aucun contournement
côté application — et c'est voulu, sinon n'importe quel site pourrait écouter
ses visiteurs via une iframe cachée.

## Ce que fait l'application quand elle est bloquée

Plutôt que d'échouer avec un message trompeur (« permission refusée »), l'app
détecte le cas et s'adapte, dans `client/src/lib/embedContext.ts` :

1. **Détection au montage de l'écran tutoriel**, via
   `document.featurePolicy.allowsFeature('microphone')`. C'est instantané et
   cela ne déclenche aucune demande de permission.
2. **Bascule automatique en mode texte** avant même que l'élève ne touche au
   micro — il n'est jamais bloqué, il peut écrire à Peter.
3. **Message explicite** : « Le micro est bloqué parce que l'application est
   intégrée dans une autre page. »
4. **Bouton « Plein écran »** dans la notification, qui rouvre l'app dans un
   nouvel onglet où le micro fonctionne.

> ⚠️ **Le parcours redémarre en plein écran.** Le stockage d'une iframe
> cross-origin est cloisonné par le navigateur : la session ouverte dans l'embed
> n'est pas reprise dans le nouvel onglet. Aucun jeton de session n'est passé
> dans l'URL (il resterait dans l'historique et les logs du site hôte).

### Limite de la détection selon le navigateur

`document.featurePolicy` n'existe que sur les navigateurs Chromium (Chrome,
Edge, Android — la majorité du parc scolaire).

| Navigateur          | Détection avant l'erreur | Cause remontée            |
|---------------------|--------------------------|---------------------------|
| Chrome / Edge / Android | Oui, dès le chargement | `embed_policy_blocked`    |
| Firefox / Safari    | Non                      | `embed_policy_suspected` (après l'échec du micro) |

Sur Firefox et Safari, `embed_policy_suspected` couvre deux cas indiscernables
(policy manquante *ou* refus de l'élève). Le message et le bouton « Plein
écran » proposés sont les mêmes, car l'action utile est identique dans les deux
cas.

## Diagnostiquer une intégration en production

Chaque évènement micro envoyé à PostHog embarque le contexte d'embed :

| Propriété          | Valeurs                                            |
|--------------------|----------------------------------------------------|
| `is_embedded`      | `true` si l'app tourne dans une iframe             |
| `mic_policy`       | `allowed` / `blocked-by-embed` / `unknown`         |
| `secure_context`   | `false` si le site hôte est en `http://`           |
| `embed_referrer`   | origine du site hôte (sans chemin ni paramètres)   |
| `mic_error_reason` | `embed_policy_blocked`, `embed_policy_suspected`, `mic_denied`, `mic_not_found`, `mic_unsupported`, `transient` |

Évènements utiles :

- `fallback_mode_activated` avec `reason: 'mic_blocked_in_embed'` → une classe
  entière est bloquée par une intégration mal configurée.
- `embed_open_standalone_clicked` → des élèves ont utilisé le bouton plein écran.
- `microphone_permission` avec `outcome: 'unavailable'` → à croiser avec
  `mic_policy` pour distinguer un embed d'un navigateur trop ancien.

### Vérifier une intégration à la main

Dans la console du navigateur, sur la page du site hôte :

```js
document.querySelector('iframe').allow;
// Doit contenir "microphone"
```

Ou depuis la console de l'iframe elle-même (menu contextuel → « Cette
image/frame » → inspecter) :

```js
document.featurePolicy.allowsFeature('microphone');
// false  -> l'attribut allow manque côté site hôte
// true   -> l'intégration est correcte ; l'échec vient d'ailleurs
```

## Alternative : lien direct

Si le site hôte ne peut pas modifier son iframe (CMS verrouillé, LMS sans accès
au HTML), publiez un lien vers l'app plutôt qu'une intégration :

```html
<a href="https://proto-dilemme2.edugami.app" target="_blank" rel="noopener">
  Lancer Dilemme Plastique
</a>
```

L'expérience vocale complète y fonctionne sans configuration.
