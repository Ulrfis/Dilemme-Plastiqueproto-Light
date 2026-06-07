export const TOTAL_TUTORIAL_CLUES = 6;
export const CLUE_CHALLENGE_EXCHANGES = 8;
export const MAX_CONVERSATION_EXCHANGES = 15;
export const MIN_CLUES_FOR_EARLY_EXIT = 3;

export type TutorialConversationPhase = "clue_challenge" | "open_discussion" | "final_exchange";

export function getTutorialConversationPhase(exchangeNumber: number): TutorialConversationPhase {
  if (exchangeNumber <= CLUE_CHALLENGE_EXCHANGES) return "clue_challenge";
  if (exchangeNumber < MAX_CONVERSATION_EXCHANGES) return "open_discussion";
  return "final_exchange";
}

export function canStartTutorialExchange(completedExchanges: number): boolean {
  return completedExchanges < MAX_CONVERSATION_EXCHANGES;
}
