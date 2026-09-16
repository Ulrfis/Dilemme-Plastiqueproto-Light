/**
 * Détection du contexte d'embed (iframe) et de la Permissions Policy micro.
 *
 * Pourquoi ce module existe
 * -------------------------
 * Quand l'app est intégrée dans un autre site via `<iframe src="...">`, la
 * fonctionnalité `microphone` est **désactivée par défaut** pour l'iframe
 * cross-origin. Le site hôte doit explicitement l'autoriser :
 *
 *     <iframe src="https://proto-dilemme2.edugami.app" allow="microphone"></iframe>
 *
 * Sans cet attribut, `navigator.mediaDevices.getUserMedia({ audio: true })`
 * rejette immédiatement avec `NotAllowedError: Permission denied`, SANS jamais
 * afficher de demande de permission à l'élève. Le TTS (lecture audio) n'est pas
 * concerné : c'est exactement le symptôme "Peter parle mais le micro échoue".
 *
 * Ce blocage ne peut PAS être contourné depuis l'app embarquée — c'est une
 * garantie de sécurité du navigateur. Ce module sert donc à :
 *   1. détecter la situation AVANT que l'élève ne tape sur le micro,
 *   2. afficher un message utile (et non "permission refusée"),
 *   3. proposer l'ouverture en plein écran, où le micro fonctionne,
 *   4. remonter l'info dans PostHog pour la voir en production.
 *
 * Support navigateur de `document.featurePolicy` : Chrome / Edge / navigateurs
 * Chromium (donc Android et la majorité du parc scolaire). Firefox et Safari ne
 * l'implémentent pas → on retombe sur `'unknown'` et on classe l'erreur après
 * coup via `classifyMicError()`.
 */

export type MicPolicyStatus =
  /** La policy autorise le micro (ou on n'est pas dans une iframe). */
  | 'allowed'
  /** L'iframe hôte n'a pas `allow="microphone"` → getUserMedia échouera. */
  | 'blocked-by-embed'
  /** Le navigateur n'expose pas l'API de policy — on ne peut pas savoir d'avance. */
  | 'unknown';

export type MicErrorReason =
  /** Blocage Permissions Policy confirmé par l'API navigateur. */
  | 'embed_policy_blocked'
  /** Dans une iframe + NotAllowedError : policy manquante OU refus élève. */
  | 'embed_policy_suspected'
  /** L'élève (ou le système) a refusé l'accès au micro. */
  | 'mic_denied'
  /** Aucun micro détecté sur l'appareil. */
  | 'mic_not_found'
  /** Navigateur trop ancien / API indisponible / contexte non sécurisé. */
  | 'mic_unsupported'
  /** Erreur transitoire (micro occupé, glitch matériel) — un retry a du sens. */
  | 'transient';

/** `true` si le document tourne dans une iframe. */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    // Un accès cross-origin à window.top peut lever : c'est donc bien une iframe.
    return true;
  }
}

/**
 * `true` si la page est servie dans un contexte sécurisé (https / localhost).
 * getUserMedia est indisponible en http simple, hors localhost.
 */
export function isSecureContextForMic(): boolean {
  if (typeof window.isSecureContext === 'boolean') return window.isSecureContext;
  const { protocol, hostname } = window.location;
  return protocol === 'https:' || hostname === 'localhost' || hostname === '127.0.0.1';
}

type PolicyDocument = Document & {
  featurePolicy?: { allowsFeature: (feature: string) => boolean };
  permissionsPolicy?: { allowsFeature: (feature: string) => boolean };
};

/**
 * Interroge la Permissions Policy du document courant pour `microphone`.
 * Ne déclenche AUCUNE demande de permission et coûte quelques microsecondes :
 * c'est sûr de l'appeler au montage d'un composant.
 */
export function getMicPolicyStatus(): MicPolicyStatus {
  try {
    const doc = document as PolicyDocument;
    const policy = doc.featurePolicy ?? doc.permissionsPolicy;
    if (policy && typeof policy.allowsFeature === 'function') {
      return policy.allowsFeature('microphone') ? 'allowed' : 'blocked-by-embed';
    }
  } catch {
    // API absente ou levant une exception : on ne sait pas.
  }
  return 'unknown';
}

/** `true` uniquement quand le blocage par l'iframe hôte est certain. */
export function isMicBlockedByEmbed(): boolean {
  return isEmbedded() && getMicPolicyStatus() === 'blocked-by-embed';
}

/**
 * Propriétés à joindre aux évènements PostHog pour diagnostiquer un échec micro
 * en production sans avoir à reproduire l'intégration du site hôte.
 */
export function getEmbedDiagnostics(): Record<string, unknown> {
  const embedded = isEmbedded();
  let referrer = '';
  try {
    // En cross-origin le referrer est souvent tronqué à l'origine : suffisant
    // pour identifier le site hôte, et ne contient pas de données élève.
    referrer = document.referrer ? new URL(document.referrer).origin : '';
  } catch {
    referrer = '';
  }
  return {
    is_embedded: embedded,
    mic_policy: getMicPolicyStatus(),
    secure_context: isSecureContextForMic(),
    embed_referrer: embedded ? referrer : '',
  };
}

/**
 * Classe une erreur `getUserMedia` en tenant compte du contexte d'embed,
 * pour choisir le bon message et la bonne action côté UI.
 */
export function classifyMicError(error: unknown): MicErrorReason {
  const err = error as Error | undefined;
  const name = err?.name ?? '';
  const message = err?.message ?? '';

  if (isMicBlockedByEmbed()) return 'embed_policy_blocked';

  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || /not found/i.test(message)) {
    return 'mic_not_found';
  }
  if (name === 'NotSupportedError' || name === 'TypeError' || !isSecureContextForMic()) {
    return 'mic_unsupported';
  }
  if (name === 'NotAllowedError' || name === 'SecurityError' || /denied|permission/i.test(message)) {
    // En iframe, un NotAllowedError vient le plus souvent d'une policy
    // manquante plutôt que d'un refus explicite — mais Firefox/Safari ne
    // permettent pas de trancher. On le signale comme "suspecté" : dans les
    // deux cas la bonne action proposée à l'élève est la même.
    return isEmbedded() ? 'embed_policy_suspected' : 'mic_denied';
  }
  return 'transient';
}

/** `true` si la cause est liée à l'intégration en iframe (certaine ou suspectée). */
export function isEmbedRelated(reason: MicErrorReason): boolean {
  return reason === 'embed_policy_blocked' || reason === 'embed_policy_suspected';
}

/** Message affiché à l'élève pour chaque cause. */
export function describeMicError(reason: MicErrorReason): string {
  switch (reason) {
    case 'embed_policy_blocked':
    case 'embed_policy_suspected':
      return "Le micro est bloqué parce que l'application est intégrée dans une autre page. Ouvrez-la en plein écran pour parler avec Peter, ou continuez en mode texte.";
    case 'mic_denied':
      return "Permission micro refusée. Autorisez le microphone dans votre navigateur, ou continuez en mode texte.";
    case 'mic_not_found':
      return "Aucun microphone détecté sur cet appareil. Utilisez le mode texte pour discuter avec Peter.";
    case 'mic_unsupported':
      return "Votre navigateur ne permet pas l'enregistrement vocal ici. Utilisez le mode texte pour discuter avec Peter.";
    case 'transient':
      return "Problème d'enregistrement. Veuillez réessayer d'appuyer sur le microphone.";
  }
}

/**
 * Ouvre l'app en haut niveau (nouvel onglet), là où la Permissions Policy de
 * l'hôte ne s'applique plus et où le micro peut être autorisé.
 *
 * Note : le stockage d'une iframe cross-origin est cloisonné par le navigateur,
 * la session en cours dans l'embed n'est donc pas reprise dans le nouvel onglet
 * — l'élève y recommence le parcours. On ne passe volontairement aucun jeton de
 * session dans l'URL (il resterait dans l'historique et les logs).
 */
export function openStandalone(): void {
  try {
    window.open(window.location.href, '_blank', 'noopener,noreferrer');
  } catch {
    // Popup bloquée : rien de mieux à tenter depuis une iframe cross-origin.
  }
}
