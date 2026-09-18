/**
 * Fournisseur de conversation pour Peter — Responses API + Conversations API.
 *
 * Pourquoi ce module existe
 * -------------------------
 * OpenAI a fermé l'Assistants API le 26 août 2026 : tout appel à `/v1/assistants`,
 * `/v1/threads` et `/v1/threads/runs` échoue désormais, sans mode dégradé. Toute la
 * couche conversationnelle de Peter reposait dessus.
 *
 * Correspondances avec l'ancienne implémentation :
 *
 *   Assistants API (fermée)              Responses API (ici)
 *   ─────────────────────────────────    ────────────────────────────────────────
 *   Assistant hébergé chez OpenAI        `PETER_INSTRUCTIONS` compilé dans le bundle
 *   Thread                               Conversation (`conv_...`)
 *   `runs.stream(...)`                   `responses.create({ stream: true })`
 *   `additional_instructions`            `instructions` (par tour)
 *   `thread.message.delta`               `response.output_text.delta`
 *   `thread.run.completed`               `response.completed`
 *   `runs.cancel(...)`                   `responses.cancel(...)`
 *
 * Ce module normalise les évènements OpenAI en `PeterStreamEvent`, pour que la
 * logique pédagogique des routes (découpage en phrases, TTS en deux phases,
 * détection des indices) reste inchangée.
 *
 * Invariant : ce module ne connaît RIEN du jeu. Il ne lit ni n'écrit `foundClues`,
 * ne compte pas les échanges et ne décide jamais de l'état pédagogique. Le serveur
 * et la base restent seuls juges — OpenAI ne produit que du dialogue.
 */
import OpenAI from 'openai';
import { PETER_INSTRUCTIONS, PETER_PROMPT_VERSION } from './peter-prompt.ts';

/**
 * Modèle utilisé pour Peter. Surchargeable par `OPENAI_MODEL`.
 *
 * `gpt-5.6-luna` est le plus rapide et le moins cher de la famille : Peter tient
 * une conversation pédagogique en français où la latence prime — la première
 * phrase part au TTS dès qu'elle est complète, et une classe de 25 élèves parle
 * en même temps. La qualité de dialogue attendue ne demande pas un modèle de
 * raisonnement profond : tout le cadrage pédagogique vient du prompt v5.
 */
const DEFAULT_MODEL = 'gpt-5.6-luna';

export function getPeterModel(): string {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

/**
 * Niveaux acceptés par l'API pour la famille GPT-5.6.
 *
 * ⚠️ Le SDK (`openai@6.8.1`) type `ReasoningEffort` comme
 * `'minimal' | 'low' | 'medium' | 'high' | null` : ses définitions sont en
 * retard sur l'API, qui accepte aussi `none`, `xhigh` et `max`. D'où le cast au
 * point d'appel — à retirer quand le SDK aura rattrapé.
 */
export type PeterReasoningEffort = 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh' | 'max';

const REASONING_EFFORTS: readonly PeterReasoningEffort[] = [
  'none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
];

/**
 * Effort de raisonnement. Surchargeable par `OPENAI_REASONING_EFFORT`.
 *
 * Défaut `none` : pas de phase de réflexion avant la réponse, donc le premier
 * token — et donc la première phrase envoyée au TTS — arrive au plus vite.
 *
 * ⚠️ Ce réglage n'est PAS optionnel pour la vitesse : sans lui, GPT-5.6 applique
 * `medium` par défaut et Peter réfléchit avant chaque réplique, ce qui ajoute
 * une latence très visible dans une conversation vocale.
 *
 * Une valeur inconnue est ignorée au profit du défaut : une faute de frappe
 * dans une variable d'environnement ne doit pas faire échouer tous les tours.
 */
const DEFAULT_REASONING_EFFORT: PeterReasoningEffort = 'none';

/**
 * Plafond de tokens de sortie. Surchargeable par `OPENAI_MAX_OUTPUT_TOKENS`.
 *
 * 400 tokens ≈ 1 400 caractères, soit largement au-dessus des « une ou deux
 * phrases courtes » que demande le prompt v5. Ce n'est pas un réglage de style :
 * c'est le garde-fou qui empêche une réponse emballée de rendre un tour
 * beaucoup plus lent que les autres.
 */
const DEFAULT_MAX_OUTPUT_TOKENS = 400;

export function getPeterMaxOutputTokens(): number {
  const raw = Number.parseInt(process.env.OPENAI_MAX_OUTPUT_TOKENS ?? '', 10);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_OUTPUT_TOKENS;
}

export function getPeterReasoningEffort(): PeterReasoningEffort {
  const raw = process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase();
  if (!raw) return DEFAULT_REASONING_EFFORT;
  const match = REASONING_EFFORTS.find(effort => effort === raw);
  if (!match) {
    console.warn(
      `[Peter] OPENAI_REASONING_EFFORT="${raw}" inconnu — repli sur "${DEFAULT_REASONING_EFFORT}"`,
    );
    return DEFAULT_REASONING_EFFORT;
  }
  return match;
}

/** Évènements normalisés consommés par les routes. */
export type PeterStreamEvent =
  | { type: 'created'; responseId: string }
  | { type: 'text_delta'; text: string }
  | { type: 'completed'; responseId: string }
  | { type: 'failed'; responseId?: string; reason: string; message: string };

export interface PeterTurnStream {
  /** Flux d'évènements normalisés. */
  events: AsyncIterable<PeterStreamEvent>;
  /** Interrompt la génération côté client (l'élève a quitté, timeout…). */
  abort(): void;
  /** Identifiant de la Response, disponible dès le premier évènement `created`. */
  getResponseId(): string;
}

export interface StreamPeterTurnInput {
  /** Conversation OpenAI de la session (`conv_...`). */
  conversationId: string;
  /** Uniquement ce que l'élève a réellement dit — l'historique reste propre. */
  userMessage: string;
  /**
   * Contexte de jeu du tour (indices trouvés/manquants, numéro d'échange).
   * Passé en `instructions`, donc jamais persisté comme message dans la
   * conversation — équivalent de l'ancien `additional_instructions`.
   */
  dynamicInstructions: string;
}

/**
 * Compose les instructions du tour : prompt permanent de Peter + contexte de jeu.
 *
 * La Responses API remplace les instructions à chaque tour (elles ne sont pas
 * héritées de la réponse précédente), il faut donc renvoyer le prompt complet
 * à chaque appel — contrairement à l'Assistants API où il vivait côté OpenAI.
 */
export function buildTurnInstructions(dynamicInstructions: string): string {
  const dynamic = dynamicInstructions.trim();
  return dynamic ? `${PETER_INSTRUCTIONS}\n\n${dynamic}` : PETER_INSTRUCTIONS;
}

export class PeterConversationProvider {
  // Champ explicite plutôt qu'une propriété de constructeur : `npm test` tourne
  // avec `node --experimental-strip-types`, qui ne les supporte pas.
  private readonly openai: OpenAI;

  constructor(openai: OpenAI) {
    this.openai = openai;
  }

  /**
   * Retourne la conversation de la session, en la créant si besoin.
   * `existingConversationId` provient de la base ; `onCreated` la persiste.
   */
  async ensureConversation(
    existingConversationId: string | null | undefined,
    onCreated: (conversationId: string) => Promise<void>,
  ): Promise<string> {
    if (existingConversationId) return existingConversationId;

    const conversation = await this.openai.conversations.create();
    await onCreated(conversation.id);
    return conversation.id;
  }

  /**
   * Crée une conversation jetable, sans persistance côté session.
   * Utilisée pour les générations isolées (message de reprise) qui ne doivent
   * jamais polluer l'historique de l'élève.
   */
  async createEphemeralConversation(): Promise<string> {
    const conversation = await this.openai.conversations.create();
    return conversation.id;
  }

  /** Supprime une conversation jetable. Silencieux en cas d'échec : c'est du ménage. */
  async deleteConversation(conversationId: string): Promise<void> {
    try {
      await this.openai.conversations.delete(conversationId);
    } catch {
      // Une conversation orpheline chez OpenAI n'affecte pas l'élève.
    }
  }

  /** Lance un tour de Peter en streaming. */
  async streamTurn(input: StreamPeterTurnInput): Promise<PeterTurnStream> {
    const controller = new AbortController();
    let responseId = '';

    const stream = await this.openai.responses.create(
      {
        model: getPeterModel(),
        conversation: input.conversationId,
        input: [{ role: 'user', content: input.userMessage }],
        instructions: buildTurnInstructions(input.dynamicInstructions),
        // Sans ce champ, GPT-5.6 raisonne en `medium` par défaut et retarde
        // le premier token. Cast : voir PeterReasoningEffort (types SDK en retard).
        reasoning: { effort: getPeterReasoningEffort() as 'minimal' },
        // Le prompt de Peter fait ~7 000 tokens, identiques à chaque tour et pour
        // tous les élèves. Une clé stable par conversation demande à OpenAI de
        // router les tours d'une même session vers la même machine, ce qui rend
        // les succès de cache — et donc le délai avant le premier token — plus
        // réguliers d'un tour à l'autre.
        prompt_cache_key: input.conversationId,
        // Garde-fou matériel, pas un outil de style : le prompt demande une ou
        // deux phrases courtes, mais rien ne l'imposait. Une réponse qui
        // s'emballe faisait un tour beaucoup plus lent que les autres. Le
        // plafond est large — il n'écourte pas une réponse normale, il coupe
        // seulement les cas pathologiques. Une réponse tronquée arrive en
        // `response.incomplete`, que les routes savent déjà jouer telle quelle.
        max_output_tokens: getPeterMaxOutputTokens(),
        stream: true,
      },
      { signal: controller.signal },
    );

    async function* normalize(): AsyncGenerator<PeterStreamEvent> {
      for await (const event of stream) {
        switch (event.type) {
          case 'response.created':
            responseId = event.response.id;
            yield { type: 'created', responseId };
            break;

          case 'response.output_text.delta':
            if (event.delta) yield { type: 'text_delta', text: event.delta };
            break;

          case 'response.completed':
            yield { type: 'completed', responseId: event.response.id };
            break;

          case 'response.failed':
            yield {
              type: 'failed',
              responseId: event.response.id,
              reason: 'response.failed',
              message: event.response.error?.message ?? 'Response failed',
            };
            return;

          case 'response.incomplete':
            // Réponse tronquée (limite de tokens, filtre de contenu). Le texte
            // déjà émis reste valide : on le signale sans le jeter.
            yield {
              type: 'failed',
              responseId: event.response.id,
              reason: 'response.incomplete',
              message: event.response.incomplete_details?.reason ?? 'Response incomplete',
            };
            return;

          case 'error':
            yield {
              type: 'failed',
              reason: 'stream.error',
              message: event.message ?? 'Stream error',
            };
            return;

          default:
            // Les autres évènements (item ajouté, annotations, usage…) ne
            // concernent pas le pipeline texte → TTS.
            break;
        }
      }
    }

    return {
      events: normalize(),
      abort: () => controller.abort(),
      getResponseId: () => responseId,
    };
  }

  /**
   * Demande l'annulation d'une Response côté OpenAI, en complément de `abort()`
   * qui coupe déjà le transport. Best-effort et volontairement silencieux :
   * une réponse déjà terminée, ou non annulable dans son état courant, renvoie
   * une erreur qui n'a aucune conséquence pour l'élève.
   */
  async cancelResponse(responseId: string): Promise<void> {
    if (!responseId) return;
    try {
      await this.openai.responses.cancel(responseId);
    } catch {
      // Déjà terminée ou déjà annulée — rien à faire.
    }
  }

  /**
   * Vérifie que le modèle configuré est accessible avec la clé courante.
   * Remplace l'ancien `validateAssistant()`, qui interrogeait un objet Assistant
   * aujourd'hui inexistant.
   */
  async validateModel(): Promise<{ ok: boolean; model: string; message: string }> {
    const model = getPeterModel();
    try {
      const retrieved = await this.openai.models.retrieve(model);
      return {
        ok: true,
        model,
        message: `Modèle ${retrieved.id} accessible — raisonnement "${getPeterReasoningEffort()}", prompt Peter v${PETER_PROMPT_VERSION}`,
      };
    } catch (error) {
      return {
        ok: false,
        model,
        message: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
