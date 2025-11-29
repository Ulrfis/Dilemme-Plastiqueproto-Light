# Structure Unifiée des Sessions - Dilemme Plastique

## Date: 29 novembre 2025

## Objectif

Toutes les données d'une session sont maintenant **ABSOLUMENT liées** au nom de l'utilisateur et stockées dans une structure unifiée, puis exportées sur **UNE SEULE LIGNE** dans Google Sheets.

---

## Schéma de Base de Données

### Table `tutorial_sessions` (unifiée)

La table `tutorial_sessions` contient maintenant TOUTES les données d'une session, incluant les réponses au questionnaire.

| Colonne | Type | Description |
|---------|------|-------------|
| **Identité** | | |
| id | varchar (UUID) | Identifiant unique de session |
| user_name | text | **Nom de l'utilisateur (clé principale)** |
| **Timestamps** | | |
| started_at | timestamp | Début de l'expérience |
| completed_at | timestamp | Fin (4 indices trouvés) |
| feedback_completed_at | timestamp | Fin du questionnaire |
| created_at | timestamp | Date de création |
| **Progression** | | |
| found_clues | jsonb | Liste des indices trouvés |
| score | integer | Score |
| message_count | integer | Nombre de messages |
| audio_mode | text | Mode audio (voice/text) |
| completed | integer | Tutoriel complété (0/1) |
| thread_id | text | ID thread OpenAI |
| final_synthesis | text | Phrase de synthèse |
| upvotes | integer | Votes communautaires |
| **Questionnaire - Scénario (1-6)** | | |
| scenario_comprehension | integer | L'histoire est facile à comprendre |
| scenario_objectives | integer | Les objectifs sont clairs |
| scenario_clue_link | integer | Lien indices/pollution |
| **Questionnaire - Gameplay (1-6)** | | |
| gameplay_explanation | integer | Principe bien expliqué |
| gameplay_simplicity | integer | Simple à comprendre |
| gameplay_bot_responses | integer | Peter répond bien |
| **Questionnaire - Feeling (1-6)** | | |
| feeling_originality | integer | Principe original |
| feeling_pleasant | integer | Principe plaisant |
| feeling_interesting | integer | Jeu intéressant |
| **Questionnaire - Motivation (1-6)** | | |
| motivation_continue | integer | Donne envie de continuer |
| motivation_gameplay | integer | Gameplay motivant |
| motivation_ecology | integer | Thème écologique motivant |
| **Questionnaire - Interface (1-6)** | | |
| interface_visual_beauty | integer | Contenu visuel joli |
| interface_visual_clarity | integer | Contenu visuel clair |
| interface_voice_chat | integer | Discussion vocale agréable |
| **Questionnaire - Note globale** | | |
| overall_rating | integer (1-6) | Note globale du tutoriel |
| improvements | text | Suggestions d'amélioration |
| **Questionnaire - Oui/Non** | | |
| wants_updates | boolean | Veut être contacté |
| update_email | text | Email de contact |
| would_recommend | boolean | Recommanderait le jeu |
| wants_in_school | boolean | Veut le jeu à l'école |

---

## Flux de Données

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     FLUX UNIFIÉ DES SESSIONS                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                           │
│  1. CRÉATION DE SESSION (Welcome Screen)                                 │
│     POST /api/sessions { userName: "Marie" }                             │
│     → Insert tutorial_sessions avec started_at                           │
│     → Google Sheets: NOUVELLE LIGNE (userName en colonne A)              │
│                                                                           │
│  2. PROGRESSION (Tutorial Screen)                                        │
│     PUT /api/sessions/:id { foundClues, messageCount, etc. }             │
│     → Update tutorial_sessions                                           │
│     → Google Sheets: MISE À JOUR même ligne                              │
│                                                                           │
│  3. COMPLÉTION (4/4 indices)                                             │
│     PUT /api/sessions/:id { completed: 1, completedAt, finalSynthesis }  │
│     → Update tutorial_sessions                                           │
│     → Google Sheets: MISE À JOUR même ligne                              │
│                                                                           │
│  4. QUESTIONNAIRE (Feedback Survey)                                      │
│     POST /api/feedback { sessionId, scenarioComprehension, ... }         │
│     → Update tutorial_sessions avec toutes les réponses                  │
│     → Google Sheets: MISE À JOUR même ligne (colonnes M-AG)              │
│                                                                           │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Google Sheets - Structure (35 colonnes)

### Une ligne par utilisateur/session

| Col | Champ | Description |
|-----|-------|-------------|
| A | userName | **Nom de l'utilisateur** |
| B | sessionId | ID de session |
| C | startedAt | Début de l'expérience |
| D | completedAt | Fin (4 indices) |
| E | feedbackCompletedAt | Fin questionnaire |
| F | foundClues | JSON des indices |
| G | clueCount | Nombre d'indices |
| H | messageCount | Nombre de messages |
| I | finalSynthesis | Phrase de synthèse |
| J | upvotes | Votes |
| K | audioMode | voice/text |
| L | score | Score |
| M-O | Scénario | 3 questions (1-6) |
| P-R | Gameplay | 3 questions (1-6) |
| S-U | Feeling | 3 questions (1-6) |
| V-X | Motivation | 3 questions (1-6) |
| Y-AA | Interface | 3 questions (1-6) |
| AB | overallRating | Note globale |
| AC | improvements | Suggestions texte |
| AD | wantsUpdates | Oui/Non |
| AE | updateEmail | Email |
| AF | wouldRecommend | Oui/Non |
| AG | wantsInSchool | Oui/Non |

---

## API Endpoints

### Création de session
```bash
POST /api/sessions
Body: { "userName": "Marie", "audioMode": "voice" }
```

### Mise à jour de session
```bash
PUT /api/sessions/:id
Body: { "foundClues": ["ADN", "bébé"], "messageCount": 5 }
```

### Soumission du questionnaire
```bash
POST /api/feedback
Body: {
  "sessionId": "uuid-xxx",
  "scenarioComprehension": 5,
  "scenarioObjectives": 4,
  ...
  "overallRating": 5,
  "improvements": "Super jeu!"
}
```

Le feedback est automatiquement enregistré dans la session (même ligne).

---

## Fichiers Modifiés

| Fichier | Changements |
|---------|-------------|
| `shared/schema.ts` | Ajout des champs questionnaire dans tutorialSessions |
| `server/storage.ts` | Nouvelle méthode saveFeedbackToSession() |
| `server/google-sheets-sync.ts` | upsertSessionRow() avec 35 colonnes |

---

## Avantages

1. **Intégrité des données** - Tout est lié par userName
2. **Traçabilité complète** - Une ligne = une expérience complète
3. **Analyse facile** - Filtrer/trier par nom d'utilisateur
4. **Pas de doublons** - upsert garantit une seule ligne par session
5. **Timestamps complets** - startedAt, completedAt, feedbackCompletedAt
