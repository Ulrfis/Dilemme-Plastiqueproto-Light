/**
 * Sélection du format d'enregistrement micro, partagée par tous les points
 * d'entrée vocaux (tutoriel, synthèse, score, feedback).
 *
 * Pourquoi c'est centralisé
 * -------------------------
 * Chrome/Firefox/Android enregistrent en `audio/webm;codecs=opus`, mais Safari
 * (macOS et iOS) ne supporte PAS WebM en MediaRecorder : il produit du
 * `audio/mp4` (AAC). Deux pièges en découlaient :
 *
 *  1. `new MediaRecorder(stream, { mimeType: 'audio/webm' })` lève un
 *     `NotSupportedError` sur Safari si on impose le type sans le tester.
 *  2. Si le Blob envoyé à `/api/speech-to-text` est étiqueté `audio/webm` alors
 *     qu'il contient du MP4, le serveur transmet à Whisper un fichier
 *     `recording.webm` au contenu MP4 — transcription peu fiable ou en échec.
 *
 * `pickRecorderMimeType()` choisit un type réellement supporté, et
 * `fileNameForMimeType()` garantit que l'extension corresponde au contenu.
 * La liste et les extensions sont alignées sur `AUDIO_EXTENSION_BY_MIME` et
 * `AUDIO_MIME_WHITELIST` dans `server/routes.ts`.
 */

/** Par ordre de préférence : qualité/compacité d'abord, compatibilité ensuite. */
const CANDIDATE_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

const EXTENSION_BY_BASE_MIME: Record<string, string> = {
  'audio/webm': 'webm',
  'audio/mp4': 'mp4',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
};

/** Retire les paramètres de codec : `audio/webm;codecs=opus` → `audio/webm`. */
export function baseMimeType(mimeType: string): string {
  return mimeType.split(';')[0].trim().toLowerCase();
}

/**
 * Premier format supporté par ce navigateur, ou `null` si l'enregistrement
 * est impossible (l'appelant doit alors basculer en mode texte).
 *
 * Retourne `''` — chaîne vide, à passer tel quel à MediaRecorder — quand
 * `isTypeSupported` n'existe pas : on laisse alors le navigateur choisir son
 * format par défaut plutôt que de lui en imposer un qu'il refuserait.
 */
export function pickRecorderMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  if (typeof MediaRecorder.isTypeSupported !== 'function') return '';

  for (const candidate of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

/**
 * Options à passer au constructeur `MediaRecorder`.
 * On omet `mimeType` quand il est vide, sinon Safari lève une exception.
 */
export function recorderOptions(mimeType: string): MediaRecorderOptions {
  return mimeType ? { mimeType } : {};
}

/**
 * Type MIME réellement retenu par le recorder, avec repli sur celui demandé
 * puis sur `audio/webm`. `MediaRecorder.mimeType` est renseigné après `start()`
 * et reflète ce que le navigateur produit vraiment.
 */
export function effectiveMimeType(
  recorder: MediaRecorder | null,
  requested: string,
): string {
  const actual = recorder?.mimeType || requested;
  return baseMimeType(actual) || 'audio/webm';
}

/** Nom de fichier cohérent avec le contenu, pour l'upload vers Whisper. */
export function fileNameForMimeType(mimeType: string, stem = 'recording'): string {
  const extension = EXTENSION_BY_BASE_MIME[baseMimeType(mimeType)] ?? 'webm';
  return `${stem}.${extension}`;
}
