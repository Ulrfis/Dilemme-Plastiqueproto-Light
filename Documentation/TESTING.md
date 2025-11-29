# Guide de Test - Mécanique Complète

## Configuration

### Variables d'environnement requises
```bash
OPENAI_API_KEY=<votre_clé_api>
ELEVENLABS_API_KEY=<votre_clé_api>
```

### Configuration OpenAI
- **Organisation**: org-z0AK8zYLTeapGaiDZFQ5co2N
- **Assistant ID**: asst_P9b5PxMd1k9HjBgbyXI1Cvm9
- **Model Speech-to-Text**: whisper-1

### Configuration ElevenLabs
- **Voice ID**: CBP9p4KAWPqrMHTDtWPR (Peter mai 2025 FR)
- **Model**: eleven_multilingual_v2

## Flux Complet

### 1. Speech to Text (OpenAI Whisper)
**Endpoint**: `POST /api/speech-to-text`

**Input**: Fichier audio (WebM)
**Output**: Texte transcrit en français

**Logs à vérifier**:
```
[API] Transcription request received
```

### 2. Traitement par l'Assistant OpenAI
**Endpoint**: `POST /api/chat`

**Process**:
1. Détection des indices dans le message utilisateur
2. Création d'un thread OpenAI
3. Ajout du contexte (indices trouvés + historique)
4. Exécution de l'assistant avec polling (max 30s)
5. Récupération de la réponse

**Logs à vérifier**:
```
[Chat API] Request received
[Chat API] Session found
[Chat API] Clue detection
[Chat API] Using OpenAI Assistant: asst_P9b5PxMd1k9HjBgbyXI1Cvm9
[Chat API] Creating thread...
[Chat API] Thread created
[Chat API] Adding message to thread...
[Chat API] Running assistant...
[Chat API] Run started
[Chat API] Polling run status (attempt X)
[Chat API] Run completed successfully
[Chat API] Assistant response received
[Chat API] Sending response to client
```

### 3. Text to Speech (ElevenLabs)
**Endpoint**: `POST /api/text-to-speech`

**Input**: Texte de la réponse de l'assistant
**Output**: Audio MP3

**Logs à vérifier**:
```
[TTS API] Request received
[TTS API] Using voice: CBP9p4KAWPqrMHTDtWPR
[TTS API] Calling ElevenLabs API...
[TTS API] Audio generated successfully
```

## Test Manuel

### Démarrage du serveur
```bash
npm run dev
```

### Test de la conversation
1. Ouvrir l'application dans le navigateur
2. Passer l'écran titre et la vidéo
3. Entrer un nom
4. Dans l'écran tutorial:
   - Autoriser le microphone
   - Cliquer sur le bouton micro
   - Parler (mentionner un indice: ADN, bébé, penseur, plastique)
   - Vérifier dans la console serveur les logs détaillés
   - Attendre la réponse vocale de Peter

### Indicateurs de succès
✅ La transcription apparaît à l'écran
✅ Le message est envoyé à l'assistant
✅ L'assistant répond (logs montrent "Run completed successfully")
✅ La voix de Peter se fait entendre (français naturel)
✅ Les indices détectés apparaissent dans l'UI

### Erreurs possibles et solutions

#### "Chat failed"
- Vérifier les logs serveur pour voir l'étape qui échoue
- Vérifier que OPENAI_API_KEY est configurée
- Vérifier que l'assistant ID existe et est accessible

#### "Speech generation failed"
- Vérifier que ELEVENLABS_API_KEY est configurée
- Vérifier que le voice ID CBP9p4KAWPqrMHTDtWPR existe

#### "Assistant run timeout"
- L'assistant prend trop de temps (>30s)
- Vérifier les instructions de l'assistant dans OpenAI

#### "Assistant run failed"
- Vérifier les logs pour voir le statut exact
- L'assistant peut avoir besoin de configuration supplémentaire dans OpenAI

## Validation Finale

Avant de pusher:
- [ ] Build réussi sans erreurs
- [ ] Test vocal complet fonctionne
- [ ] Les 4 indices peuvent être détectés
- [ ] La voix française est claire et naturelle
- [ ] Les logs montrent toutes les étapes sans erreur
