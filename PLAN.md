# Plan : Correction du registre vocal ElevenLabs + Optimisation latence

## Diagnostic

### Problème 1 : Changement de registre vocal entre les phrases
**Cause racine confirmée** : Le système envoie le texte **phrase par phrase** à ElevenLabs (architecture Phase 2 streaming). Chaque phrase génère un appel API TTS indépendant :

```
Phrase 1 → API ElevenLabs → Audio 1 (registre X)
Phrase 2 → API ElevenLabs → Audio 2 (registre Y)  ← Changement !
Phrase 3 → API ElevenLabs → Audio 3 (registre Z)  ← Changement !
```

Chaque appel n'a aucun contexte des phrases précédentes/suivantes, donc ElevenLabs génère chaque segment avec une prosodie/intonation potentiellement différente.

**Fichiers impliqués** :
- `server/routes.ts:723-756` — Détection des fins de phrase + envoi SSE phrase par phrase
- `client/src/components/TutorialScreen.tsx:398-456` — Callback `onSentence` → TTS par phrase
- `client/src/hooks/useAudioQueue.ts` — Queue audio par phrase

### Problème 2 : Latence trop élevée
Pipeline actuel : Parole utilisateur → STT Whisper (~2s) → LLM GPT-4o-mini (~2-3s streaming) → TTS par phrase (~1-2s par phrase)

---

## Solution proposée

### Étape 1 : Envoyer le texte complet à ElevenLabs en une seule fois

**Principe** : Attendre la réponse complète du LLM, puis envoyer TOUT le texte en un seul appel à ElevenLabs streaming. L'audio sera streamé en retour avec une prosodie cohérente.

**Modifications serveur (`server/routes.ts`)** :

1. **Modifier `/api/chat/stream`** : Continuer à streamer les phrases via SSE pour l'affichage texte progressif dans l'UI (UX conservée), mais ne plus déclencher de TTS côté client à chaque phrase.

2. **Ajouter un nouvel endpoint `/api/chat/respond`** (ou modifier le flow) qui :
   - Reçoit le message utilisateur
   - Streame le texte du LLM via SSE (pour l'UI progressive)
   - À la fin du stream LLM, génère le TTS avec le texte COMPLET en un seul appel
   - Streame l'audio complet au client via un événement SSE `audio_ready` contenant l'URL ou le blob

**Alternative plus simple** : Garder l'architecture SSE actuelle mais changer le comportement côté client :

**Modifications client (`TutorialScreen.tsx`)** :

1. **`onSentence` callback** : Ne plus appeler `textToSpeechStreaming()` par phrase. Simplement accumuler le texte et mettre à jour l'UI.

2. **`onComplete` callback** : Une fois la réponse complète reçue :
   - Envoyer le texte COMPLET à `/api/text-to-speech/stream`
   - Recevoir l'audio en un seul bloc
   - Jouer l'audio complet (plus besoin de queue)

**Modifications `useAudioQueue.ts`** :
- Simplifier : plus besoin de gestion multi-phrases, un seul blob audio par réponse

### Étape 2 : Optimiser la latence sur les autres segments du pipeline

#### 2a. Paralléliser LLM stream + préparation audio
- Pendant que le LLM streame, préparer l'élément audio (warm up Audio element, pré-créer l'objet URL)
- Réduire les délais d'initialisation audio

#### 2b. Streamer l'audio ElevenLabs vers le client pendant la génération
- Au lieu d'attendre tout le blob audio, streamer les chunks audio directement au client
- Utiliser `MediaSource` API côté client pour commencer la lecture dès les premiers chunks audio reçus
- Cela compense la latence ajoutée par l'attente du texte complet

**Flow optimisé** :
```
t=0s:     Utilisateur finit de parler
t=0-1.5s: STT Whisper
t=1.5-4s: LLM streame les phrases (UI texte s'affiche progressivement)
t=4s:     LLM terminé → texte complet envoyé à ElevenLabs
t=4-4.5s: Premier chunk audio reçu d'ElevenLabs → LECTURE COMMENCE
t=4.5-8s: Audio continue à streamer + jouer en continu
```

#### 2c. Optimiser les paramètres ElevenLabs
- Augmenter `optimize_streaming_latency` de 2 à 3 (compromis acceptable pour réactivité)
- Tester le modèle `eleven_turbo_v2_5` qui est plus rapide que `eleven_multilingual_v2` (si la qualité française est acceptable)

#### 2d. Réduire la latence STT
- Envoyer l'audio dès la fin de l'enregistrement sans délai
- Compresser l'audio avant envoi si possible (réduire taille upload)

---

## Fichiers à modifier

| Fichier | Modification |
|---------|-------------|
| `server/routes.ts` | Endpoint TTS stream - supporter texte long, optimiser params |
| `client/src/components/TutorialScreen.tsx` | `onSentence` : UI only, `onComplete` : TTS texte complet |
| `client/src/hooks/useAudioQueue.ts` | Simplifier pour single-audio, ou supprimer |
| `client/src/lib/api.ts` | Adapter `textToSpeechStreaming` pour texte complet |
| `client/src/hooks/useVoiceInteraction.ts` | Optimiser playback audio streaming |

## Risques et compromis

- **Latence perçue** : Le texte s'affiche toujours progressivement (UX conservée), mais l'audio commence ~1-2s plus tard qu'avant. Compensé par le streaming audio continu sans coupures.
- **Expérience audio** : Nettement améliorée — voix continue, naturelle, sans changements de registre.
- **Fallback** : Garder l'endpoint TTS non-streaming en backup.
