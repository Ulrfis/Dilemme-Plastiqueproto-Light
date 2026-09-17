/**
 * Message d'accueil de Peter — le seul texte de l'application où le prénom de
 * l'élève est injecté.
 *
 * Il est découpé en trois phrases pour une raison de latence, pas de rédaction :
 * seule la PREMIÈRE contient le prénom. Les deux suivantes sont identiques pour
 * tout le monde, donc générées une fois au démarrage du serveur et servies
 * depuis le cache. Le premier son ne dépend plus que d'une phrase courte au lieu
 * des ~22 secondes de parole que fait le message entier.
 *
 * Les coupures tombent sur des frontières de phrase naturelles : l'enchaînement
 * reste inaudible. Ne déplacez pas ces frontières sans écouter le résultat.
 */

/** Ouverture — contient le prénom, donc régénérée pour chaque élève. */
const WELCOME_OPENING_SUFFIX = "dans cette courte expérience.";

/**
 * Corps invariable. Épinglé en cache TTS au démarrage du serveur
 * (`warmWelcomeSegments` dans `server/routes.ts`) : plus jamais généré ensuite.
 */
export const WELCOME_BODY_SENTENCES: readonly string[] = [
  "Tente de trouver 6 indices dans cette image pendant les 8 premiers échanges, en racontant ce que tu vois et ce qui attire ton attention sur l'impact du plastique sur la santé.",
  "Ensuite, tu pourras continuer à chercher et à discuter avec Peter jusqu'à 15 échanges au total.",
];

function normalizeName(userName: string): string {
  return userName.trim().replace(/\s+/g, " ");
}

/**
 * Les segments du message d'accueil, dans l'ordre de lecture.
 * Le premier est propre à l'élève ; les suivants sont `WELCOME_BODY_SENTENCES`.
 */
export function getWelcomeSegments(userName: string): string[] {
  const normalizedName = normalizeName(userName);
  const opening = normalizedName
    ? `Bienvenue ${normalizedName} ${WELCOME_OPENING_SUFFIX}`
    : `Bienvenue ${WELCOME_OPENING_SUFFIX}`;
  return [opening, ...WELCOME_BODY_SENTENCES];
}

/**
 * Le message affiché à l'écran. C'est exactement la concaténation des segments —
 * un test verrouille cette égalité, pour que le texte lu et le texte lu à voix
 * haute ne puissent jamais diverger.
 */
export function getWelcomeMessage(userName: string): string {
  return getWelcomeSegments(userName).join(" ");
}
