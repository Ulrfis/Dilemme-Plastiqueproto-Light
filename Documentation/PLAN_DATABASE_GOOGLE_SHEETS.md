# Plan d'implémentation : Base de données + Google Sheets

> **Date de création** : 2025-11-28  
> **Statut** : 📋 Planifié  
> **Priorité** : Haute

---

## 📌 Objectifs

### Objectifs fonctionnels
1. **Persister les données utilisateur** dans une base de données PostgreSQL
2. **Synchroniser en temps réel** avec Google Sheets pour l'analyse des usages
3. **Afficher une page finale** listant les phrases de synthèse avec système d'upvote

### Données à stocker
| Donnée | Description | Moment de capture |
|--------|-------------|-------------------|
| `userName` | Nom de l'utilisateur | Après visionnage vidéo, début expérience |
| `foundClues` | Liste des indices trouvés | Pendant la conversation |
| `clueCount` | Nombre d'indices trouvés | Calculé à partir de foundClues |
| `messageCount` | Nombre d'échanges user↔Peter | Incrémenté à chaque message |
| `finalSynthesis` | Phrase de synthèse finale | Quand Peter demande le résumé |
| `upvotes` | Nombre de votes positifs | Page finale (autres utilisateurs) |

---

## 🏗️ Architecture cible

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (React)                              │
├─────────────────────────────────────────────────────────────────────┤
│  TutorialScreen          │  EndPage (nouvelle)                      │
│  - Capture userName      │  - Liste des synthèses                   │
│  - Envoie messages       │  - Système d'upvote                      │
│  - Soumet synthèse       │  - Affichage userName + phrase           │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Express)                             │
├─────────────────────────────────────────────────────────────────────┤
│  routes.ts               │  PostgresStorage      │  GoogleSheetsSync │
│  - /api/sessions         │  - CRUD sessions      │  - Append on save │
│  - /api/syntheses        │  - Messages count     │  - Real-time sync │
│  - /api/upvote           │  - Upvote logic       │                   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    ▼                               ▼
            ┌──────────────┐               ┌──────────────┐
            │  PostgreSQL  │               │ Google Sheets│
            │  (Primary)   │               │  (Analytics) │
            └──────────────┘               └──────────────┘
```

---

## 📊 Phase 1 : Mise à jour du schéma de base de données

### 1.1 Modifications du schéma (`shared/schema.ts`)

**Champs à ajouter à `tutorialSessions` :**

```typescript
// Nouveaux champs
finalSynthesis: text("final_synthesis"),           // Phrase de synthèse finale
messageCount: integer("message_count").default(0), // Nombre d'échanges
upvotes: integer("upvotes").default(0),            // Votes positifs
completedAt: timestamp("completed_at"),            // Date de complétion
```

### 1.2 Schéma complet après modification

```typescript
export const tutorialSessions = pgTable("tutorial_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userName: text("user_name").notNull(),
  foundClues: jsonb("found_clues").$type<string[]>().default([]).notNull(),
  score: integer("score").default(0).notNull(),
  audioMode: text("audio_mode").$type<'voice' | 'text'>().default('voice').notNull(),
  completed: integer("completed").default(0).notNull(),
  threadId: text("thread_id"),
  
  // NOUVEAUX CHAMPS
  finalSynthesis: text("final_synthesis"),
  messageCount: integer("message_count").default(0).notNull(),
  upvotes: integer("upvotes").default(0).notNull(),
  completedAt: timestamp("completed_at"),
  
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
```

### 1.3 Fichiers à modifier
- [ ] `shared/schema.ts` - Ajouter les nouveaux champs
- [ ] `server/storage.ts` - Mettre à jour MemStorage et types

---

## 🗄️ Phase 2 : PostgreSQL Storage

### 2.1 Configuration requise

**Variable d'environnement :**
```bash
DATABASE_URL=postgresql://user:password@host:5432/database
```

**Providers recommandés :**
- [Neon](https://neon.tech) - Gratuit, serverless
- [Supabase](https://supabase.com) - Gratuit, inclut dashboard
- [Railway](https://railway.app) - Simple, payant

### 2.2 Nouveau fichier : `server/postgres-storage.ts`

```typescript
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { tutorialSessions, conversationMessages } from '@shared/schema';
import { eq } from 'drizzle-orm';
import type { IStorage } from './storage';

export class PostgresStorage implements IStorage {
  private db;

  constructor(connectionString: string) {
    const pool = new Pool({ connectionString });
    this.db = drizzle(pool);
  }

  // ... implémentation des méthodes CRUD
}
```

### 2.3 Migrations Drizzle

```bash
# Générer la migration
npx drizzle-kit generate:pg

# Appliquer la migration
npx drizzle-kit push:pg
```

### 2.4 Fichiers à créer/modifier
- [ ] `server/postgres-storage.ts` - Nouvelle implémentation PostgreSQL
- [ ] `server/storage.ts` - Exporter conditionnellement selon DATABASE_URL
- [ ] `drizzle.config.ts` - Configuration Drizzle Kit
- [ ] `package.json` - Ajouter dépendances pg, drizzle-kit

---

## 📤 Phase 3 : Synchronisation Google Sheets

### 3.1 Configuration Google Cloud

**Étapes de configuration :**
1. Créer un projet sur [Google Cloud Console](https://console.cloud.google.com)
2. Activer l'API Google Sheets
3. Créer un compte de service (Service Account)
4. Télécharger la clé JSON
5. Partager le Google Sheet avec l'email du service account

**Variables d'environnement :**
```bash
GOOGLE_SHEETS_ID=1abc...xyz
GOOGLE_SERVICE_ACCOUNT_EMAIL=bot@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

### 3.2 Structure du Google Sheet

| Colonne | Contenu |
|---------|---------|
| A | `timestamp` - Date/heure ISO |
| B | `sessionId` - ID unique |
| C | `userName` - Nom utilisateur |
| D | `foundClues` - Indices (JSON array) |
| E | `clueCount` - Nombre d'indices |
| F | `messageCount` - Nombre d'échanges |
| G | `finalSynthesis` - Phrase de synthèse |
| H | `upvotes` - Nombre de votes |
| I | `completedAt` - Date de fin |

### 3.3 Nouveau fichier : `server/google-sheets-sync.ts`

```typescript
import { google } from 'googleapis';

export class GoogleSheetsSync {
  private sheets;
  private spreadsheetId: string;

  constructor() {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      },
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = process.env.GOOGLE_SHEETS_ID!;
  }

  async appendSession(session: TutorialSession): Promise<void> {
    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: 'Sheet1!A:I',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toISOString(),
          session.id,
          session.userName,
          JSON.stringify(session.foundClues),
          session.foundClues.length,
          session.messageCount,
          session.finalSynthesis || '',
          session.upvotes,
          session.completedAt?.toISOString() || '',
        ]],
      },
    });
  }

  async updateSessionRow(sessionId: string, updates: Partial<TutorialSession>): Promise<void> {
    // Trouver la ligne et mettre à jour
    // ... logique de recherche et mise à jour
  }
}
```

### 3.4 Intégration avec Storage

```typescript
// Dans PostgresStorage ou MemStorage
async createSession(session: InsertTutorialSession): Promise<TutorialSession> {
  const created = await this._createSession(session);

  // Sync vers Google Sheets (fire and forget)
  this.googleSheets?.appendSession(created).catch(console.error);

  return created;
}

async updateSession(id: string, updates: Partial<TutorialSession>): Promise<TutorialSession | undefined> {
  const updated = await this._updateSession(id, updates);

  // Sync vers Google Sheets
  if (updated) {
    this.googleSheets?.updateSessionRow(id, updates).catch(console.error);
  }

  return updated;
}
```

### 3.5 Fichiers à créer/modifier
- [ ] `server/google-sheets-sync.ts` - Service de synchronisation
- [ ] `server/storage.ts` - Intégrer le sync dans les opérations
- [ ] `package.json` - Ajouter `googleapis`

---

## 🔌 Phase 4 : Nouveaux endpoints API

### 4.1 Endpoints à ajouter

| Méthode | Route | Description |
|---------|-------|-------------|
| `POST` | `/api/sessions/:id/synthesis` | Enregistrer la phrase de synthèse finale |
| `GET` | `/api/syntheses` | Lister toutes les synthèses (page finale) |
| `POST` | `/api/syntheses/:id/upvote` | Ajouter un upvote à une synthèse |
| `GET` | `/api/sessions/:id/stats` | Stats de la session (messageCount, etc.) |

### 4.2 Implémentation dans `routes.ts`

```typescript
// POST /api/sessions/:id/synthesis
app.post('/api/sessions/:id/synthesis', async (req, res) => {
  const { id } = req.params;
  const { finalSynthesis } = req.body;

  const session = await storage.updateSession(id, {
    finalSynthesis,
    completedAt: new Date(),
    completed: 1,
  });

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json(session);
});

// GET /api/syntheses
app.get('/api/syntheses', async (req, res) => {
  const { sort = 'recent', limit = 50 } = req.query;

  const syntheses = await storage.getCompletedSessions({
    sort: sort as 'recent' | 'upvotes',
    limit: Number(limit),
  });

  res.json(syntheses);
});

// POST /api/syntheses/:id/upvote
app.post('/api/syntheses/:id/upvote', async (req, res) => {
  const { id } = req.params;

  const session = await storage.incrementUpvote(id);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  res.json({ upvotes: session.upvotes });
});
```

### 4.3 Nouvelles méthodes Storage

```typescript
interface IStorage {
  // ... méthodes existantes

  // Nouvelles méthodes
  getCompletedSessions(options: { sort: 'recent' | 'upvotes', limit: number }): Promise<TutorialSession[]>;
  incrementUpvote(id: string): Promise<TutorialSession | undefined>;
  incrementMessageCount(sessionId: string): Promise<void>;
}
```

---

## 🖥️ Phase 5 : Frontend - Page finale

### 5.1 Nouvelle page : `client/src/pages/Syntheses.tsx`

```typescript
// Structure de la page
export default function SynthesesPage() {
  const [syntheses, setSyntheses] = useState<TutorialSession[]>([]);
  const [sortBy, setSortBy] = useState<'recent' | 'upvotes'>('recent');

  return (
    <div className="syntheses-page">
      <h1>Ce que les autres ont compris</h1>

      <SortToggle value={sortBy} onChange={setSortBy} />

      <div className="syntheses-list">
        {syntheses.map(s => (
          <SynthesisCard
            key={s.id}
            userName={s.userName}
            synthesis={s.finalSynthesis}
            upvotes={s.upvotes}
            clueCount={s.foundClues.length}
            onUpvote={() => handleUpvote(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
```

### 5.2 Composant `SynthesisCard`

```typescript
interface SynthesisCardProps {
  userName: string;
  synthesis: string;
  upvotes: number;
  clueCount: number;
  onUpvote: () => void;
}

function SynthesisCard({ userName, synthesis, upvotes, clueCount, onUpvote }: SynthesisCardProps) {
  return (
    <div className="synthesis-card">
      <div className="card-header">
        <span className="user-name">{userName}</span>
        <span className="clue-count">{clueCount}/4 indices</span>
      </div>

      <blockquote className="synthesis-text">
        "{synthesis}"
      </blockquote>

      <button className="upvote-btn" onClick={onUpvote}>
        ▲ {upvotes}
      </button>
    </div>
  );
}
```

### 5.3 Fichiers à créer
- [ ] `client/src/pages/Syntheses.tsx` - Page des synthèses
- [ ] `client/src/components/SynthesisCard.tsx` - Carte de synthèse
- [ ] `client/src/lib/api.ts` - Ajouter fonctions API

---

## 📝 Phase 6 : Capture de la phrase de synthèse

### 6.1 Détecter la demande de synthèse par Peter

Peter doit demander à l'utilisateur de résumer sa compréhension. Il faut détecter cette demande dans la réponse de l'IA et marquer le mode "synthèse".

**Options :**
1. **Instruction dans le prompt** : Demander à GPT d'inclure un marqueur `[SYNTHESIS_REQUEST]`
2. **Analyse côté serveur** : Détecter des mots-clés ("résume", "qu'as-tu compris", etc.)
3. **Compteur d'indices** : Quand 4 indices trouvés → mode synthèse

### 6.2 Capturer la réponse de synthèse

```typescript
// Dans TutorialScreen.tsx
const [isSynthesisMode, setIsSynthesisMode] = useState(false);

// Quand tous les indices sont trouvés ou Peter demande le résumé
useEffect(() => {
  if (foundClues.length === 4 && !isSynthesisMode) {
    setIsSynthesisMode(true);
  }
}, [foundClues]);

// Lors de la réponse utilisateur en mode synthèse
const handleUserMessage = async (message: string) => {
  if (isSynthesisMode) {
    // Enregistrer comme synthèse finale
    await saveFinalSynthesis(sessionId, message);
  }
  // ... continuer avec le chat normal
};
```

---

## ✅ Checklist d'implémentation

### Pré-requis
- [ ] Compte PostgreSQL configuré (Neon/Supabase/Railway)
- [ ] Projet Google Cloud avec API Sheets activée
- [ ] Service Account Google créé
- [ ] Google Sheet créé et partagé avec le service account

### Phase 1 : Schéma
- [ ] Mettre à jour `shared/schema.ts`
- [ ] Mettre à jour types dans `server/storage.ts`
- [ ] Mettre à jour `MemStorage` pour les nouveaux champs

### Phase 2 : PostgreSQL
- [ ] Installer dépendances (`pg`, `drizzle-kit`)
- [ ] Créer `drizzle.config.ts`
- [ ] Créer `server/postgres-storage.ts`
- [ ] Configurer switch MemStorage/PostgresStorage
- [ ] Tester les migrations

### Phase 3 : Google Sheets
- [ ] Installer `googleapis`
- [ ] Créer `server/google-sheets-sync.ts`
- [ ] Intégrer dans Storage
- [ ] Tester la synchronisation

### Phase 4 : API
- [ ] Endpoint POST `/api/sessions/:id/synthesis`
- [ ] Endpoint GET `/api/syntheses`
- [ ] Endpoint POST `/api/syntheses/:id/upvote`
- [ ] Méthodes Storage associées

### Phase 5 : Frontend
- [ ] Page `Syntheses.tsx`
- [ ] Composant `SynthesisCard.tsx`
- [ ] Route dans `App.tsx`
- [ ] Fonctions API

### Phase 6 : Intégration
- [ ] Logique de détection mode synthèse
- [ ] Capture et envoi de la phrase finale
- [ ] Tests end-to-end

---

## 📅 Estimation de temps

| Phase | Durée estimée |
|-------|---------------|
| Phase 1 : Schéma | 30 min |
| Phase 2 : PostgreSQL | 2-3h |
| Phase 3 : Google Sheets | 2-3h |
| Phase 4 : API | 1-2h |
| Phase 5 : Frontend | 3-4h |
| Phase 6 : Intégration | 2-3h |
| **Total** | **10-16h** |

---

## 🔗 Ressources

- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [Google Sheets API v4](https://developers.google.com/sheets/api/reference/rest)
- [Neon PostgreSQL](https://neon.tech/docs)
- [Service Account Setup](https://cloud.google.com/iam/docs/service-accounts-create)

