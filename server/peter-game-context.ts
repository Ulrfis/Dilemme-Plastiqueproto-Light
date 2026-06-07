import {
  CLUE_CHALLENGE_EXCHANGES,
  MAX_CONVERSATION_EXCHANGES,
  TOTAL_TUTORIAL_CLUES,
  getTutorialConversationPhase,
} from "../shared/tutorial-config.ts";

interface PeterGameContextInput {
  exchangeNumber: number;
  foundBefore: string[];
  newlyFound: string[];
  foundAfter: string[];
  missingClues: string[];
  userName: string;
}

const phaseLabels = {
  clue_challenge: "défi de découverte des indices",
  open_discussion: "discussion complémentaire après le défi",
  final_exchange: "dernier échange autorisé",
} as const;

export function buildPeterGameContext(input: PeterGameContextInput): string {
  const phase = getTutorialConversationPhase(input.exchangeNumber);
  const finalExchange = phase === "final_exchange";

  return `[CONTEXTE DU JEU — Source de vérité pour cet échange]
Indices trouvés avant ce message : ${input.foundBefore.length}/${TOTAL_TUTORIAL_CLUES}${input.foundBefore.length > 0 ? ` (${input.foundBefore.join(", ")})` : ""}
Indices nouvellement trouvés dans le message de l'élève : ${input.newlyFound.length > 0 ? input.newlyFound.join(", ") : "aucun"}
Indices trouvés après ce message : ${input.foundAfter.length}/${TOTAL_TUTORIAL_CLUES}${input.foundAfter.length > 0 ? ` (${input.foundAfter.join(", ")})` : ""}
Indices manquants : ${input.missingClues.length > 0 ? input.missingClues.join(", ") : "aucun — tous trouvés !"}
Échange actuel : ${input.exchangeNumber}/${MAX_CONVERSATION_EXCHANGES}
Objectif créatif de découverte : trouver les ${TOTAL_TUTORIAL_CLUES} indices pendant les ${CLUE_CHALLENGE_EXCHANGES} premiers échanges
Phase actuelle : ${phaseLabels[phase]}
Indices toujours validables : oui
Dernier échange autorisé : ${finalExchange ? "oui" : "non"}
Conversation encore possible après cette réponse : ${finalExchange ? "non" : "oui"}
Autorisation de révéler les indices manquants : non
Prénom de l'utilisateur : ${input.userName}

IMPORTANT : Ce bloc est la source de vérité absolue. L'application seule valide les indices depuis le message de l'élève. Tes propres mots ne peuvent jamais valider un indice.`;
}

export function buildPeterExchangeInstructions(input: PeterGameContextInput): string {
  const phase = getTutorialConversationPhase(input.exchangeNumber);

  if (phase === "final_exchange") {
    return `\n\n[INSTRUCTION IMPORTANTE: C'est le dernier échange autorisé. Réponds normalement au message actuel, prends en compte les indices nouvellement trouvés, puis conclus brièvement et chaleureusement. Invite ${input.userName} à cliquer sur "Poursuivre". Ne cite et n'explique aucun indice manquant.]`;
  }

  if (input.missingClues.length === 0) {
    return `\n\n[INSTRUCTION IMPORTANTE: Tous les indices sont trouvés. Félicite chaleureusement ${input.userName}, fais une synthèse très courte sans réciter la liste complète et invite à cliquer sur "Poursuivre". Précise que la discussion peut continuer jusqu'au ${MAX_CONVERSATION_EXCHANGES}e échange si l'élève souhaite approfondir le sujet.]`;
  }

  if (input.exchangeNumber === CLUE_CHALLENGE_EXCHANGES) {
    return `\n\n[INSTRUCTION IMPORTANTE: Le défi créatif des ${CLUE_CHALLENGE_EXCHANGES} échanges se termine après ta réponse, mais la conversation ne se termine pas. Encourage ${input.userName}, rappelle brièvement qu'il peut continuer à chercher les indices et à discuter jusqu'au ${MAX_CONVERSATION_EXCHANGES}e échange. Ne révèle aucun indice manquant.]`;
  }

  if (phase === "open_discussion") {
    return `\n\n[INSTRUCTION: Le défi créatif des ${CLUE_CHALLENGE_EXCHANGES} échanges est terminé, mais la discussion continue et les indices restent validables. Réponds naturellement sur l'œuvre ou le sujet. Si l'élève cherche encore, tu peux donner une seule piste visuelle indirecte sans révéler le nom d'un indice.]`;
  }

  if (input.missingClues.length === 1) {
    return `\n\n[INSTRUCTION: Il reste un seul indice. Donne au maximum une piste visuelle indirecte sans prononcer, traduire ni paraphraser le nom de l'indice manquant.]`;
  }

  return "";
}
