import test from 'node:test';
import assert from 'node:assert/strict';

import {
  baseMimeType,
  effectiveMimeType,
  fileNameForMimeType,
  pickRecorderMimeType,
  recorderOptions,
} from './audioRecording.ts';

/**
 * Installe un faux `MediaRecorder` global qui n'accepte que les types donnés,
 * pour simuler Chrome (WebM), Safari (MP4) ou un navigateur sans MediaRecorder.
 */
function withMediaRecorder(supported: string[] | null, run: () => void) {
  const globalScope = globalThis as Record<string, unknown>;
  const previous = globalScope.MediaRecorder;
  if (supported === null) {
    delete globalScope.MediaRecorder;
  } else {
    globalScope.MediaRecorder = {
      isTypeSupported: (type: string) => supported.includes(type),
    };
  }
  try {
    run();
  } finally {
    if (previous === undefined) delete globalScope.MediaRecorder;
    else globalScope.MediaRecorder = previous;
  }
}

test('baseMimeType strips codec parameters', () => {
  assert.equal(baseMimeType('audio/webm;codecs=opus'), 'audio/webm');
  assert.equal(baseMimeType('audio/mp4'), 'audio/mp4');
  assert.equal(baseMimeType('AUDIO/WEBM; codecs=opus'), 'audio/webm');
});

test('pickRecorderMimeType prefers webm/opus when available (Chrome, Android)', () => {
  withMediaRecorder(['audio/webm;codecs=opus', 'audio/webm'], () => {
    assert.equal(pickRecorderMimeType(), 'audio/webm;codecs=opus');
  });
});

test('pickRecorderMimeType falls back to mp4 on Safari', () => {
  withMediaRecorder(['audio/mp4'], () => {
    assert.equal(pickRecorderMimeType(), 'audio/mp4');
  });
});

test('pickRecorderMimeType returns null when no audio format is supported', () => {
  withMediaRecorder([], () => {
    assert.equal(pickRecorderMimeType(), null);
  });
  withMediaRecorder(null, () => {
    assert.equal(pickRecorderMimeType(), null);
  });
});

test('pickRecorderMimeType defers to the browser when isTypeSupported is missing', () => {
  const globalScope = globalThis as Record<string, unknown>;
  const previous = globalScope.MediaRecorder;
  globalScope.MediaRecorder = {};
  try {
    assert.equal(pickRecorderMimeType(), '');
  } finally {
    if (previous === undefined) delete globalScope.MediaRecorder;
    else globalScope.MediaRecorder = previous;
  }
});

test('recorderOptions omits mimeType when empty so Safari does not throw', () => {
  assert.deepEqual(recorderOptions(''), {});
  assert.deepEqual(recorderOptions('audio/mp4'), { mimeType: 'audio/mp4' });
});

test('effectiveMimeType reports what the recorder actually produces', () => {
  // Safari peut renvoyer un type différent de celui demandé.
  const safariRecorder = { mimeType: 'audio/mp4' } as MediaRecorder;
  assert.equal(effectiveMimeType(safariRecorder, 'audio/webm;codecs=opus'), 'audio/mp4');

  // Les paramètres de codec sont retirés : la whitelist serveur (multer)
  // n'accepte que les types de base.
  const chromeRecorder = { mimeType: 'audio/webm;codecs=opus' } as MediaRecorder;
  assert.equal(effectiveMimeType(chromeRecorder, ''), 'audio/webm');

  // Repli sur le type demandé, puis sur audio/webm.
  assert.equal(effectiveMimeType(null, 'audio/ogg'), 'audio/ogg');
  assert.equal(effectiveMimeType(null, ''), 'audio/webm');
});

test('fileNameForMimeType keeps the extension consistent with the content', () => {
  assert.equal(fileNameForMimeType('audio/webm'), 'recording.webm');
  assert.equal(fileNameForMimeType('audio/mp4'), 'recording.mp4');
  assert.equal(fileNameForMimeType('audio/ogg', 'synthesis'), 'synthesis.ogg');
  // Type inconnu : repli sur webm plutôt qu'une extension inventée.
  assert.equal(fileNameForMimeType('audio/flac'), 'recording.webm');
});
