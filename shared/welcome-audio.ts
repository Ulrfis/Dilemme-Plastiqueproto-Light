const WELCOME_MESSAGE_BODY =
  "dans cette courte expérience. Tente de trouver 6 indices dans cette image pendant les 8 premiers échanges, en racontant ce que tu vois et ce qui attire ton attention sur l'impact du plastique sur la santé. Ensuite, tu pourras continuer à chercher et à discuter avec Peter jusqu'à 15 échanges au total.";

export interface WelcomePayload {
  welcomeMessage: string;
  welcomeAudioToken: string;
}

export function getWelcomeMessage(userName: string): string {
  const normalizedName = userName.trim().replace(/\s+/g, " ");
  return normalizedName
    ? `Bienvenue ${normalizedName} ${WELCOME_MESSAGE_BODY}`
    : `Bienvenue ${WELCOME_MESSAGE_BODY}`;
}

export function buildWelcomePayload(userName: string, welcomeAudioToken: string): WelcomePayload {
  return {
    welcomeMessage: getWelcomeMessage(userName),
    welcomeAudioToken,
  };
}
