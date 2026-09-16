import test from 'node:test';
import assert from 'node:assert/strict';

import {
  classifyMicError,
  describeMicError,
  getEmbedDiagnostics,
  getMicPolicyStatus,
  isEmbedRelated,
  isEmbedded,
  isMicBlockedByEmbed,
  isSecureContextForMic,
} from './embedContext.ts';

type FakeEnv = {
  /** `true` pour simuler une iframe. */
  embedded?: boolean;
  /**
   * Résultat de `document.featurePolicy.allowsFeature('microphone')`.
   * `undefined` simule Firefox/Safari, qui n'exposent pas l'API.
   */
  micAllowed?: boolean;
  secure?: boolean;
  referrer?: string;
};

/** Monte un faux `window`/`document` le temps d'un test. */
function withEnv(env: FakeEnv, run: () => void) {
  const globalScope = globalThis as Record<string, unknown>;
  const previousWindow = globalScope.window;
  const previousDocument = globalScope.document;

  const top = {};
  const self = env.embedded ? {} : top;
  const fakeWindow: Record<string, unknown> = {
    self,
    top,
    isSecureContext: env.secure ?? true,
    location: { href: 'https://proto-dilemme2.example/app', protocol: 'https:', hostname: 'proto-dilemme2.example' },
  };
  const fakeDocument: Record<string, unknown> = {
    referrer: env.referrer ?? '',
  };
  if (env.micAllowed !== undefined) {
    fakeDocument.featurePolicy = {
      allowsFeature: (feature: string) => (feature === 'microphone' ? env.micAllowed! : true),
    };
  }

  globalScope.window = fakeWindow;
  globalScope.document = fakeDocument;
  try {
    run();
  } finally {
    if (previousWindow === undefined) delete globalScope.window;
    else globalScope.window = previousWindow;
    if (previousDocument === undefined) delete globalScope.document;
    else globalScope.document = previousDocument;
  }
}

const notAllowed = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' });
const notFound = Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' });
const notSupported = Object.assign(new Error('mimeType not supported'), { name: 'NotSupportedError' });

test('isEmbedded distinguishes top-level from iframe', () => {
  withEnv({ embedded: false }, () => assert.equal(isEmbedded(), false));
  withEnv({ embedded: true }, () => assert.equal(isEmbedded(), true));
});

test('getMicPolicyStatus reads the Permissions Policy when available', () => {
  withEnv({ embedded: true, micAllowed: false }, () => {
    assert.equal(getMicPolicyStatus(), 'blocked-by-embed');
  });
  withEnv({ embedded: true, micAllowed: true }, () => {
    assert.equal(getMicPolicyStatus(), 'allowed');
  });
});

test('getMicPolicyStatus reports unknown on browsers without the API', () => {
  // Firefox et Safari n'exposent pas document.featurePolicy.
  withEnv({ embedded: true }, () => {
    assert.equal(getMicPolicyStatus(), 'unknown');
  });
});

test('isMicBlockedByEmbed is true only when the block is certain', () => {
  withEnv({ embedded: true, micAllowed: false }, () => {
    assert.equal(isMicBlockedByEmbed(), true);
  });
  // Iframe correctement configurée avec allow="microphone".
  withEnv({ embedded: true, micAllowed: true }, () => {
    assert.equal(isMicBlockedByEmbed(), false);
  });
  // Hors iframe, la policy hôte ne s'applique pas.
  withEnv({ embedded: false, micAllowed: false }, () => {
    assert.equal(isMicBlockedByEmbed(), false);
  });
  // API absente : on ne peut pas affirmer le blocage.
  withEnv({ embedded: true }, () => {
    assert.equal(isMicBlockedByEmbed(), false);
  });
});

test('classifyMicError identifies a confirmed embed block', () => {
  withEnv({ embedded: true, micAllowed: false }, () => {
    assert.equal(classifyMicError(notAllowed), 'embed_policy_blocked');
    // Même quand l'erreur remontée est d'un autre type, la policy prime :
    // rien ne pourra fonctionner tant que l'hôte n'autorise pas le micro.
    assert.equal(classifyMicError(notFound), 'embed_policy_blocked');
  });
});

test('classifyMicError suspects the embed when the policy API is unavailable', () => {
  withEnv({ embedded: true }, () => {
    assert.equal(classifyMicError(notAllowed), 'embed_policy_suspected');
  });
});

test('classifyMicError reports a plain denial outside an iframe', () => {
  withEnv({ embedded: false }, () => {
    assert.equal(classifyMicError(notAllowed), 'mic_denied');
    assert.equal(classifyMicError(notFound), 'mic_not_found');
    assert.equal(classifyMicError(notSupported), 'mic_unsupported');
  });
});

test('classifyMicError treats an insecure context as unsupported', () => {
  withEnv({ embedded: false, secure: false }, () => {
    assert.equal(classifyMicError(new Error('boom')), 'mic_unsupported');
  });
});

test('classifyMicError keeps unknown failures retryable', () => {
  withEnv({ embedded: false }, () => {
    assert.equal(classifyMicError(new Error('device busy')), 'transient');
  });
});

test('isEmbedRelated covers both confirmed and suspected embed blocks', () => {
  assert.equal(isEmbedRelated('embed_policy_blocked'), true);
  assert.equal(isEmbedRelated('embed_policy_suspected'), true);
  assert.equal(isEmbedRelated('mic_denied'), false);
  assert.equal(isEmbedRelated('transient'), false);
});

test('describeMicError returns a message for every reason', () => {
  const reasons = [
    'embed_policy_blocked',
    'embed_policy_suspected',
    'mic_denied',
    'mic_not_found',
    'mic_unsupported',
    'transient',
  ] as const;
  for (const reason of reasons) {
    const message = describeMicError(reason);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0, `message manquant pour ${reason}`);
  }
  // Un blocage d'iframe ne doit pas être présenté comme un refus de l'élève.
  assert.match(describeMicError('embed_policy_blocked'), /intégrée/);
});

test('getEmbedDiagnostics reduces the referrer to its origin', () => {
  withEnv(
    { embedded: true, micAllowed: false, referrer: 'https://site-hote.example/cours/plastique?eleve=42' },
    () => {
      const diagnostics = getEmbedDiagnostics();
      assert.equal(diagnostics.is_embedded, true);
      assert.equal(diagnostics.mic_policy, 'blocked-by-embed');
      // Pas de chemin ni de query : aucune donnée élève ne part dans PostHog.
      assert.equal(diagnostics.embed_referrer, 'https://site-hote.example');
    },
  );
});

test('getEmbedDiagnostics omits the referrer outside an iframe', () => {
  withEnv({ embedded: false, micAllowed: true, referrer: 'https://google.com/' }, () => {
    const diagnostics = getEmbedDiagnostics();
    assert.equal(diagnostics.is_embedded, false);
    assert.equal(diagnostics.embed_referrer, '');
  });
});

test('isSecureContextForMic follows window.isSecureContext', () => {
  withEnv({ secure: true }, () => assert.equal(isSecureContextForMic(), true));
  withEnv({ secure: false }, () => assert.equal(isSecureContextForMic(), false));
});
