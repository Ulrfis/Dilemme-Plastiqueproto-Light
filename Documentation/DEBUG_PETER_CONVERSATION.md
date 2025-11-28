# Plan de Débogage - Problème de Conversation avec Peter

## Problème Signalé
Peter ne génère pas de réponse textuelle ou vocale lorsque l'utilisateur envoie un message. Une erreur se produit mais n'est pas clairement visible.

## Contexte Technique
- **Endpoint principal**: `/api/chat/stream` (SSE streaming)
- **Fallback**: `/api/chat` (non-streaming)
- **Assistant OpenAI**: `asst_P9b5PxMd1k9HjBgbyXI1Cvm9`
- **TTS**: ElevenLabs API

---

## Étape 1: Ajouter des Logs de Diagnostic

### Fichier: `server/routes.ts`

#### 1.1 Améliorer les logs de l'endpoint `/api/chat/stream` (ligne ~339)

Ajouter après la ligne `const stream = await openai.beta.threads.runs.stream(...)`:

```typescript
console.log('[Chat Stream API] Stream created successfully, starting to process events...');
```

Ajouter dans le bloc `for await (const event of stream)`:

```typescript
console.log('[Chat Stream API] Event received:', event.event);
```

#### 1.2 Ajouter un timeout et une gestion d'erreur explicite

Après la création du stream (ligne ~403), ajouter:

```typescript
// Timeout de sécurité pour détecter les streams bloqués
const streamTimeout = setTimeout(() => {
  console.error('[Chat Stream API] TIMEOUT: Stream blocked after 30 seconds');
  if (!res.writableEnded) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      message: 'Response timeout - assistant did not respond in time'
    })}\n\n`);
    res.end();
  }
}, 30000);

// Annuler le timeout à la fin du stream (ajouter avant res.end())
clearTimeout(streamTimeout);
```

---

## Étape 2: Vérifier la Validité de l'Assistant OpenAI

### Fichier: `server/routes.ts`

#### 2.1 Ajouter une vérification de l'assistant au démarrage

Ajouter après les imports (vers ligne ~10):

```typescript
// Vérifier que l'assistant existe au démarrage
async function validateAssistant() {
  const ASSISTANT_ID = 'asst_P9b5PxMd1k9HjBgbyXI1Cvm9';
  try {
    const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);
    console.log('[Server] Assistant validated:', assistant.name);
  } catch (error) {
    console.error('[Server] CRITICAL: Assistant not found or invalid!', error);
  }
}

// Appeler au démarrage (ajouter dans la fonction registerRoutes)
validateAssistant();
```

---

## Étape 3: Améliorer le Feedback d'Erreur Frontend

### Fichier: `client/src/components/TutorialScreen.tsx`

#### 3.1 Améliorer le callback onError dans processMessageStreaming (ligne ~395)

Remplacer:
```typescript
onError: (error) => {
  console.error('[TutorialScreen] Stream error:', error);
  toast({
    title: "Erreur de streaming",
    description: error,
    variant: "destructive",
  });
},
```

Par:
```typescript
onError: (error) => {
  console.error('[TutorialScreen] Stream error:', error);
  
  // Ajouter un message d'erreur visible dans la conversation
  setMessages(prev => [...prev, { 
    role: 'assistant', 
    content: `Erreur: ${error}. Veuillez réessayer.` 
  }]);
  
  toast({
    title: "Erreur de Peter",
    description: `La conversation a échoué: ${error}`,
    variant: "destructive",
    duration: 10000, // 10 secondes pour être visible
  });
  
  // Réinitialiser l'état pour permettre de réessayer
  recoverFromError();
},
```

#### 3.2 Ajouter une gestion du cas "réponse vide"

Dans `onComplete` (ligne ~362), après la mise à jour du message:

```typescript
onComplete: (finalResponse, newFoundClues, detectedClue) => {
  console.log('[TutorialScreen] Stream complete, final response length:', finalResponse.length);
  
  // Vérifier si la réponse est vide ou invalide
  if (!finalResponse || finalResponse.trim().length === 0) {
    console.error('[TutorialScreen] Empty response received from Peter');
    toast({
      title: "Réponse vide",
      description: "Peter n'a pas pu générer de réponse. Veuillez réessayer.",
      variant: "destructive",
    });
    return;
  }
  
  // ... reste du code existant
}
```

---

## Étape 4: Vérifier les Clés API

### Vérifications Manuelles

1. **OpenAI API Key**: 
   - Aller sur https://platform.openai.com/api-keys
   - Vérifier que la clé est active et a des crédits

2. **OpenAI Assistant**:
   - Aller sur https://platform.openai.com/assistants
   - Vérifier que l'assistant `asst_P9b5PxMd1k9HjBgbyXI1Cvm9` existe

3. **ElevenLabs API Key**:
   - Aller sur https://elevenlabs.io/app/settings/api-keys
   - Vérifier le quota restant

### Ajouter un endpoint de diagnostic

#### Fichier: `server/routes.ts`

Ajouter un nouvel endpoint:

```typescript
app.get('/api/health/ai', async (req, res) => {
  const results = {
    openai: { status: 'unknown', message: '' },
    assistant: { status: 'unknown', message: '' },
    elevenlabs: { status: 'unknown', message: '' },
  };

  // Test OpenAI
  try {
    const models = await openai.models.list();
    results.openai = { status: 'ok', message: `${models.data.length} models available` };
  } catch (error) {
    results.openai = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }

  // Test Assistant
  try {
    const assistant = await openai.beta.assistants.retrieve('asst_P9b5PxMd1k9HjBgbyXI1Cvm9');
    results.assistant = { status: 'ok', message: `Assistant: ${assistant.name}` };
  } catch (error) {
    results.assistant = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }

  // Test ElevenLabs
  try {
    const response = await fetch('https://api.elevenlabs.io/v1/user', {
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '' }
    });
    if (response.ok) {
      const data = await response.json();
      results.elevenlabs = { status: 'ok', message: `Characters: ${data.subscription?.character_count || 'N/A'}` };
    } else {
      results.elevenlabs = { status: 'error', message: `HTTP ${response.status}` };
    }
  } catch (error) {
    results.elevenlabs = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
  }

  res.json(results);
});
```

---

## Étape 5: Test de Validation

### 5.1 Tester l'endpoint de diagnostic

```bash
curl https://[votre-app].replit.app/api/health/ai
```

### 5.2 Tester une conversation

1. Ouvrir l'application
2. Aller jusqu'à l'écran de tutoriel
3. Envoyer un message texte "bonjour"
4. Observer:
   - Les logs serveur (workflow)
   - La console navigateur
   - Les toasts d'erreur

### 5.3 Vérifier les logs serveur

Chercher dans les logs:
- `[Chat Stream API]` - étapes de la conversation
- `TIMEOUT` - si le stream est bloqué
- `CRITICAL` - erreurs graves

---

## Résumé des Fichiers à Modifier

| Fichier | Modifications |
|---------|---------------|
| `server/routes.ts` | Logs détaillés, timeout, validation assistant, endpoint santé |
| `client/src/components/TutorialScreen.tsx` | Meilleure gestion erreurs, feedback visible |

## Priorité de Correction

1. **URGENT**: Ajouter l'endpoint `/api/health/ai` pour diagnostiquer
2. **HAUTE**: Améliorer les logs serveur pour tracer le problème
3. **MOYENNE**: Améliorer le feedback d'erreur frontend
4. **BASSE**: Ajouter le timeout de sécurité
