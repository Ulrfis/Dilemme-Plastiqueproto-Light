# Correction du Stockage du Questionnaire

## Problème Identifié

**Date**: 28 novembre 2025

Le questionnaire de feedback (20 questions) ne stockait pas les réponses dans la base de données car la table `feedback_surveys` n'avait jamais été créée.

### Symptômes
- Les réponses au questionnaire étaient perdues
- Aucune erreur visible pour l'utilisateur
- Google Sheets ne recevait pas les données

### Cause
Le schéma Drizzle définissait la table dans `shared/schema.ts`, mais la migration `npm run db:push` n'avait pas été exécutée pour créer la table dans PostgreSQL.

---

## Solution Appliquée

### 1. Création de la table

```bash
npm run db:push
```

Résultat : Table `feedback_surveys` créée avec succès.

### 2. Structure de la table

| Colonne | Type | Description |
|---------|------|-------------|
| id | varchar (UUID) | Identifiant unique |
| session_id | varchar | Lien vers tutorialSessions |
| user_name | text | Nom de l'utilisateur |
| scenario_* | integer (1-6) | 3 questions scénario |
| gameplay_* | integer (1-6) | 3 questions gameplay |
| feeling_* | integer (1-6) | 3 questions feeling |
| motivation_* | integer (1-6) | 3 questions motivation |
| interface_* | integer (1-6) | 3 questions interface |
| overall_rating | integer (1-6) | Note globale |
| improvements | text | Suggestions d'amélioration |
| wants_updates | boolean | Veut être contacté |
| update_email | text | Email de contact |
| would_recommend | boolean | Recommanderait le jeu |
| wants_in_school | boolean | Veut le jeu à l'école |
| created_at | timestamp | Date de création |

### 3. Relation avec l'utilisateur

Les réponses sont liées à l'utilisateur via :
- `session_id` → référence vers `tutorial_sessions.id`
- `user_name` → copie du nom saisi au début

---

## Flux de données

```
┌─────────────────────────────────────────────────────────────────┐
│                     QUESTIONNAIRE FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Utilisateur complète le questionnaire (20 questions)        │
│                          ↓                                       │
│  2. Frontend envoie POST /api/feedback                          │
│                          ↓                                       │
│  3. Backend valide avec Zod (insertFeedbackSurveySchema)        │
│                          ↓                                       │
│  4. Insertion dans PostgreSQL (feedback_surveys)                │
│                          ↓                                       │
│  5. Sync asynchrone vers Google Sheets (appendFeedback)         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Vérification

### Tester l'API

```bash
curl -X POST http://localhost:5000/api/feedback \
  -H "Content-Type: application/json" \
  -d '{
    "sessionId": "test-123",
    "userName": "Test",
    "overallRating": 5
  }'
```

### Vérifier la base de données

```sql
SELECT id, session_id, user_name, overall_rating, created_at 
FROM feedback_surveys 
ORDER BY created_at DESC 
LIMIT 10;
```

### Vérifier les logs Google Sheets

Chercher dans les logs serveur :
```
[GoogleSheets] ✅ Feedback appended
```

---

## Fichiers concernés

| Fichier | Rôle |
|---------|------|
| `shared/schema.ts` | Définition du schéma Drizzle |
| `server/storage.ts` | Méthodes createFeedback, getFeedbackBySession |
| `server/routes.ts` | Endpoints POST/GET /api/feedback |
| `server/google-sheets-sync.ts` | appendFeedback() pour sync Google |
| `client/src/components/FeedbackSurvey.tsx` | Interface utilisateur |

---

## Status

✅ **Corrigé** - Les réponses au questionnaire sont maintenant :
1. Stockées dans PostgreSQL (`feedback_surveys`)
2. Liées à l'utilisateur via `sessionId` et `userName`
3. Synchronisées vers Google Sheets
