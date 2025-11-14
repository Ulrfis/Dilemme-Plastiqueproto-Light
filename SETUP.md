# Guide de Configuration Rapide

## Problème Actuel

Si vous voyez l'erreur suivante :
```
OpenAIError: Missing credentials. Please pass an `apiKey`, or set the `OPENAI_API_KEY` environment variable.
```

C'est parce que les variables d'environnement ne sont pas configurées.

## Solution

### 1. Créer le fichier .env

À la racine du projet, créez un fichier nommé `.env` :

```bash
# Dans le terminal, à la racine du projet
touch .env
```

### 2. Ajouter vos clés API

Éditez le fichier `.env` et ajoutez vos clés API :

```env
# OpenAI Configuration
OPENAI_API_KEY=sk-proj-VOTRE_CLE_ICI

# ElevenLabs Configuration
ELEVENLABS_API_KEY=VOTRE_CLE_ICI
```

### 3. Obtenir les clés API

#### OpenAI
1. Allez sur https://platform.openai.com/api-keys
2. Créez une nouvelle clé API
3. Copiez-la dans le `.env`

**Important**: L'assistant utilisé (`asst_P9b5PxMd1k9HjBgbyXI1Cvm9`) doit exister dans votre organisation OpenAI (`org-z0AK8zYLTeapGaiDZFQ5co2N`).

#### ElevenLabs
1. Allez sur https://elevenlabs.io/app/settings/api-keys
2. Créez ou copiez votre clé API
3. Ajoutez-la dans le `.env`

**Important**: La voix `CBP9p4KAWPqrMHTDtWPR` (Peter mai 2025 FR) doit exister dans votre compte ElevenLabs.

### 4. Vérifier la configuration

```bash
# Vérifiez que le fichier .env existe
ls -la .env

# Vérifiez son contenu (sans révéler les clés complètes)
grep "OPENAI_API_KEY" .env
grep "ELEVENLABS_API_KEY" .env
```

### 5. Redémarrer le serveur

```bash
# Arrêter le serveur s'il tourne (Ctrl+C)
# Puis redémarrer
npm run dev
```

## Vérification du Bon Fonctionnement

Si tout est bien configuré, vous devriez voir :

```
> rest-express@1.0.0 dev
> NODE_ENV=development tsx server/index.ts

Server running on http://localhost:5000
Vite dev server started
```

Et **PAS** d'erreur `OpenAIError: Missing credentials`.

## Configuration des Services IA

### Organisation OpenAI
- **ID**: `org-z0AK8zYLTeapGaiDZFQ5co2N`
- **Assistant**: `asst_P9b5PxMd1k9HjBgbyXI1Cvm9`

### Voice ElevenLabs
- **ID**: `CBP9p4KAWPqrMHTDtWPR`
- **Nom**: Peter mai 2025 FR

### Flux Complet

1. **User parle** → Enregistrement audio
2. **Speech-to-Text** → OpenAI Whisper transcrit
3. **Chat** → OpenAI Assistant répond (avec votre assistant ID)
4. **Text-to-Speech** → ElevenLabs génère l'audio (avec votre voice ID)
5. **Lecture** → L'audio est joué à l'utilisateur

## Dépannage

### L'erreur persiste après avoir créé le .env

1. Vérifiez que le fichier s'appelle exactement `.env` (pas `.env.txt`)
2. Vérifiez qu'il est bien à la racine du projet
3. Vérifiez qu'il n'y a pas d'espaces autour du `=`:
   - ✅ `OPENAI_API_KEY=sk-...`
   - ❌ `OPENAI_API_KEY = sk-...`

### "Chat failed" après l'envoi d'un message

Consultez les logs serveur pour voir l'erreur exacte :
- Logs détaillés avec `[Chat API]` pour le chat
- Logs détaillés avec `[TTS API]` pour le text-to-speech

Causes possibles :
- L'assistant ID n'existe pas dans votre organisation
- L'organisation n'a pas accès aux Assistants API
- La voix ElevenLabs n'existe pas

### Fichier .env ignoré par Git

C'est normal ! Le `.env` est dans `.gitignore` pour ne pas exposer vos clés.
Utilisez `.env.example` comme référence.

## Besoin d'aide ?

Consultez :
- **TESTING.md** pour les tests détaillés
- **README.md** pour la documentation complète
- Les logs serveur pour les erreurs spécifiques
