import test from 'node:test';
import assert from 'node:assert/strict';

import type OpenAI from 'openai';
import {
  PeterConversationProvider,
  buildTurnInstructions,
  getPeterModel,
  getPeterReasoningEffort,
  type PeterStreamEvent,
} from './peter-conversation.ts';
import { PETER_INSTRUCTIONS } from './peter-prompt.ts';

/** Enregistre les appels faits au SDK pour pouvoir les inspecter. */
interface RecordedCall {
  method: string;
  args: unknown[];
}

function fakeOpenAI(options: {
  streamEvents?: unknown[];
  conversationId?: string;
  createShouldThrow?: boolean;
  deleteShouldThrow?: boolean;
  cancelShouldThrow?: boolean;
} = {}) {
  const calls: RecordedCall[] = [];
  const events = options.streamEvents ?? [];

  const client = {
    conversations: {
      create: async (...args: unknown[]) => {
        calls.push({ method: 'conversations.create', args });
        if (options.createShouldThrow) throw new Error('boom');
        return { id: options.conversationId ?? 'conv_new' };
      },
      delete: async (...args: unknown[]) => {
        calls.push({ method: 'conversations.delete', args });
        if (options.deleteShouldThrow) throw new Error('boom');
        return { id: args[0], deleted: true };
      },
    },
    responses: {
      create: async (...args: unknown[]) => {
        calls.push({ method: 'responses.create', args });
        return {
          async *[Symbol.asyncIterator]() {
            for (const event of events) yield event;
          },
        };
      },
      cancel: async (...args: unknown[]) => {
        calls.push({ method: 'responses.cancel', args });
        if (options.cancelShouldThrow) throw new Error('boom');
        return {};
      },
    },
    models: {
      retrieve: async (...args: unknown[]) => {
        calls.push({ method: 'models.retrieve', args });
        return { id: args[0] };
      },
    },
  };

  return { client: client as unknown as OpenAI, calls };
}

async function collect(events: AsyncIterable<PeterStreamEvent>): Promise<PeterStreamEvent[]> {
  const out: PeterStreamEvent[] = [];
  for await (const event of events) out.push(event);
  return out;
}

// ── Modèle ────────────────────────────────────────────────────────────────

test('getPeterModel defaults to the fastest model and honours OPENAI_MODEL', () => {
  const previous = process.env.OPENAI_MODEL;
  try {
    delete process.env.OPENAI_MODEL;
    assert.equal(getPeterModel(), 'gpt-5.6-luna');

    process.env.OPENAI_MODEL = 'gpt-5.6-sol';
    assert.equal(getPeterModel(), 'gpt-5.6-sol');
  } finally {
    if (previous === undefined) delete process.env.OPENAI_MODEL;
    else process.env.OPENAI_MODEL = previous;
  }
});

function withReasoningEffort(value: string | undefined, run: () => void) {
  const previous = process.env.OPENAI_REASONING_EFFORT;
  try {
    if (value === undefined) delete process.env.OPENAI_REASONING_EFFORT;
    else process.env.OPENAI_REASONING_EFFORT = value;
    run();
  } finally {
    if (previous === undefined) delete process.env.OPENAI_REASONING_EFFORT;
    else process.env.OPENAI_REASONING_EFFORT = previous;
  }
}

test('reasoning is disabled by default — GPT-5.6 would otherwise think at medium', () => {
  withReasoningEffort(undefined, () => {
    assert.equal(getPeterReasoningEffort(), 'none');
  });
});

test('getPeterReasoningEffort honours a valid override, case-insensitively', () => {
  withReasoningEffort('low', () => assert.equal(getPeterReasoningEffort(), 'low'));
  withReasoningEffort('  HIGH ', () => assert.equal(getPeterReasoningEffort(), 'high'));
  withReasoningEffort('xhigh', () => assert.equal(getPeterReasoningEffort(), 'xhigh'));
});

test('an unknown reasoning effort falls back instead of breaking every turn', () => {
  // Une faute de frappe dans une variable Coolify ne doit pas mettre Peter à terre.
  withReasoningEffort('fastest', () => {
    assert.equal(getPeterReasoningEffort(), 'none');
  });
  withReasoningEffort('', () => {
    assert.equal(getPeterReasoningEffort(), 'none');
  });
});

// ── Instructions ──────────────────────────────────────────────────────────

test('buildTurnInstructions sends the full Peter prompt on every turn', () => {
  // La Responses API n'hérite pas des instructions du tour précédent : le prompt
  // complet doit repartir à chaque appel, contrairement à l'Assistants API où il
  // était hébergé côté OpenAI.
  const instructions = buildTurnInstructions('CONTEXTE DE JEU');
  assert.ok(instructions.startsWith(PETER_INSTRUCTIONS));
  assert.ok(instructions.includes('CONTEXTE DE JEU'));
});

test('buildTurnInstructions tolerates an empty game context', () => {
  assert.equal(buildTurnInstructions(''), PETER_INSTRUCTIONS);
  assert.equal(buildTurnInstructions('   '), PETER_INSTRUCTIONS);
});

// ── Conversation ──────────────────────────────────────────────────────────

test('ensureConversation reuses the session conversation without calling OpenAI', async () => {
  const { client, calls } = fakeOpenAI();
  const provider = new PeterConversationProvider(client);

  let persisted: string | null = null;
  const id = await provider.ensureConversation('conv_existing', async (created) => {
    persisted = created;
  });

  assert.equal(id, 'conv_existing');
  assert.equal(persisted, null, 'aucune réécriture inutile en base');
  assert.equal(calls.length, 0, 'aucun appel réseau quand la conversation existe');
});

test('ensureConversation creates and persists a conversation when missing', async () => {
  const { client, calls } = fakeOpenAI({ conversationId: 'conv_abc' });
  const provider = new PeterConversationProvider(client);

  const persisted: string[] = [];
  const id = await provider.ensureConversation(null, async (created) => {
    persisted.push(created);
  });

  assert.equal(id, 'conv_abc');
  assert.deepEqual(persisted, ['conv_abc']);
  assert.equal(calls.filter(c => c.method === 'conversations.create').length, 1);
});

test('deleteConversation never throws — cleanup must not break a turn', async () => {
  const { client } = fakeOpenAI({ deleteShouldThrow: true });
  const provider = new PeterConversationProvider(client);
  await provider.deleteConversation('conv_x');
});

// ── Streaming ─────────────────────────────────────────────────────────────

test('streamTurn normalises a successful OpenAI stream', async () => {
  const { client, calls } = fakeOpenAI({
    streamEvents: [
      { type: 'response.created', response: { id: 'resp_1' } },
      { type: 'response.in_progress', response: { id: 'resp_1' } },
      { type: 'response.output_text.delta', delta: 'Salut ' },
      { type: 'response.output_text.delta', delta: 'Ulrich !' },
      { type: 'response.output_text.done', text: 'Salut Ulrich !' },
      { type: 'response.completed', response: { id: 'resp_1' } },
    ],
  });
  const provider = new PeterConversationProvider(client);

  const turn = await provider.streamTurn({
    conversationId: 'conv_1',
    userMessage: 'Bonjour',
    dynamicInstructions: 'CONTEXTE',
  });
  const events = await collect(turn.events);

  assert.deepEqual(events, [
    { type: 'created', responseId: 'resp_1' },
    { type: 'text_delta', text: 'Salut ' },
    { type: 'text_delta', text: 'Ulrich !' },
    { type: 'completed', responseId: 'resp_1' },
  ]);
  assert.equal(turn.getResponseId(), 'resp_1');

  const params = calls.find(c => c.method === 'responses.create')!.args[0] as Record<string, any>;
  assert.equal(params.conversation, 'conv_1');
  assert.equal(params.stream, true);
  // Le champ doit toujours être envoyé : omis, l'API raisonne en `medium`.
  assert.deepEqual(params.reasoning, { effort: 'none' });
});

test('the game context travels in instructions, never in conversation history', async () => {
  // Invariant pédagogique : seul le vrai message de l'élève entre dans
  // l'historique. Le contexte de jeu (indices trouvés/manquants) est rejoué à
  // chaque tour et ne doit jamais s'y sédimenter.
  const { client, calls } = fakeOpenAI({ streamEvents: [] });
  const provider = new PeterConversationProvider(client);

  await provider.streamTurn({
    conversationId: 'conv_1',
    userMessage: 'Je vois des bouteilles',
    dynamicInstructions: 'INDICES TROUVÉS: ADN',
  });

  const params = calls.find(c => c.method === 'responses.create')!.args[0] as Record<string, any>;
  assert.deepEqual(params.input, [{ role: 'user', content: 'Je vois des bouteilles' }]);
  assert.ok(params.instructions.includes('INDICES TROUVÉS: ADN'));
  assert.equal(
    JSON.stringify(params.input).includes('INDICES TROUVÉS'),
    false,
    'le contexte de jeu ne doit pas être envoyé comme message',
  );
});

test('streamTurn maps a failed response and stops the stream', async () => {
  const { client } = fakeOpenAI({
    streamEvents: [
      { type: 'response.created', response: { id: 'resp_2' } },
      { type: 'response.failed', response: { id: 'resp_2', error: { message: 'model overloaded' } } },
      { type: 'response.completed', response: { id: 'resp_2' } },
    ],
  });
  const provider = new PeterConversationProvider(client);

  const turn = await provider.streamTurn({
    conversationId: 'conv_1', userMessage: 'x', dynamicInstructions: '',
  });
  const events = await collect(turn.events);

  assert.deepEqual(events[1], {
    type: 'failed',
    responseId: 'resp_2',
    reason: 'response.failed',
    message: 'model overloaded',
  });
  assert.equal(events.length, 2, 'rien n\'est émis après un échec');
});

test('streamTurn reports a truncated response, keeping the text already emitted', async () => {
  const { client } = fakeOpenAI({
    streamEvents: [
      { type: 'response.created', response: { id: 'resp_3' } },
      { type: 'response.output_text.delta', delta: 'Regarde bien' },
      {
        type: 'response.incomplete',
        response: { id: 'resp_3', incomplete_details: { reason: 'max_output_tokens' } },
      },
    ],
  });
  const provider = new PeterConversationProvider(client);

  const turn = await provider.streamTurn({
    conversationId: 'conv_1', userMessage: 'x', dynamicInstructions: '',
  });
  const events = await collect(turn.events);

  assert.deepEqual(events[1], { type: 'text_delta', text: 'Regarde bien' });
  assert.equal(events[2].type, 'failed');
  assert.equal((events[2] as { reason: string }).reason, 'response.incomplete');
  assert.equal((events[2] as { message: string }).message, 'max_output_tokens');
});

test('streamTurn maps a transport-level error event', async () => {
  const { client } = fakeOpenAI({
    streamEvents: [{ type: 'error', message: 'connection reset' }],
  });
  const provider = new PeterConversationProvider(client);

  const turn = await provider.streamTurn({
    conversationId: 'conv_1', userMessage: 'x', dynamicInstructions: '',
  });
  const events = await collect(turn.events);

  assert.deepEqual(events, [
    { type: 'failed', reason: 'stream.error', message: 'connection reset' },
  ]);
});

test('unknown stream events are ignored rather than crashing the turn', async () => {
  const { client } = fakeOpenAI({
    streamEvents: [
      { type: 'response.output_item.added', item: {} },
      { type: 'response.some_future_event' },
      { type: 'response.output_text.delta', delta: 'ok' },
    ],
  });
  const provider = new PeterConversationProvider(client);

  const turn = await provider.streamTurn({
    conversationId: 'conv_1', userMessage: 'x', dynamicInstructions: '',
  });
  assert.deepEqual(await collect(turn.events), [{ type: 'text_delta', text: 'ok' }]);
});

// ── Annulation ────────────────────────────────────────────────────────────

test('cancelResponse skips the call when no response has started', async () => {
  const { client, calls } = fakeOpenAI();
  const provider = new PeterConversationProvider(client);

  await provider.cancelResponse('');
  assert.equal(calls.length, 0);
});

test('cancelResponse never throws — an already finished response is not an error', async () => {
  const { client, calls } = fakeOpenAI({ cancelShouldThrow: true });
  const provider = new PeterConversationProvider(client);

  await provider.cancelResponse('resp_9');
  assert.equal(calls.filter(c => c.method === 'responses.cancel').length, 1);
});

// ── Validation du modèle ──────────────────────────────────────────────────

test('validateModel reports the configured model as reachable', async () => {
  const { client } = fakeOpenAI();
  const provider = new PeterConversationProvider(client);

  const result = await provider.validateModel();
  assert.equal(result.ok, true);
  assert.equal(result.model, getPeterModel());
  assert.match(result.message, /accessible/);
});

test('validateModel surfaces the real error instead of throwing', async () => {
  const failing = {
    models: { retrieve: async () => { throw new Error('model_not_found'); } },
  } as unknown as OpenAI;
  const provider = new PeterConversationProvider(failing);

  const result = await provider.validateModel();
  assert.equal(result.ok, false);
  assert.equal(result.message, 'model_not_found');
});
