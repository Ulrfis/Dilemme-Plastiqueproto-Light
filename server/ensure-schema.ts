/**
 * Ajoute les colonnes introduites par le code mais absentes d'une base déployée.
 *
 * Pourquoi ce module existe
 * -------------------------
 * Le schéma est appliqué à la main (`npm run db:push`) : rien ne le fait au
 * déploiement, et `drizzle-kit` est une dépendance de développement, absente de
 * l'image de production. Une colonne ajoutée au code mais pas à la base fait
 * échouer **toutes** les requêtes de session — Drizzle liste explicitement les
 * colonnes dans ses SELECT. L'application tomberait entièrement au déploiement,
 * avant même qu'on pense à lancer la migration.
 *
 * Ce garde-fou est volontairement minimal et strictement additif :
 *   - uniquement des `ADD COLUMN IF NOT EXISTS` sur des colonnes nullables ;
 *   - jamais de suppression, de renommage ni de changement de type ;
 *   - idempotent, donc sans effet sur une base déjà à jour.
 *
 * `npm run db:push` reste la voie normale pour toute évolution de schéma. Ceci
 * ne la remplace pas : ça évite qu'un oubli mette le service à terre.
 */

export interface ColumnPatch {
  table: string;
  column: string;
  /** Type SQL, sans contrainte NOT NULL : une colonne ajoutée doit être nullable. */
  type: string;
  reason: string;
}

export const REQUIRED_COLUMNS: ColumnPatch[] = [
  {
    table: 'tutorial_sessions',
    column: 'conversation_id',
    type: 'text',
    reason: "Conversation OpenAI (Responses API), remplace thread_id depuis la fermeture de l'Assistants API",
  },
];

/** Construit l'instruction additive pour une colonne. Exporté pour les tests. */
export function buildAlterStatement(patch: ColumnPatch): string {
  // Les identifiants viennent de REQUIRED_COLUMNS, jamais d'une entrée externe.
  return `ALTER TABLE "${patch.table}" ADD COLUMN IF NOT EXISTS "${patch.column}" ${patch.type}`;
}

export async function ensureSchema(): Promise<void> {
  // Import paresseux : `./db` exige DATABASE_URL au chargement du module, ce qui
  // rendrait ce fichier intestable et ferait échouer tout import indirect.
  const { pool } = await import("./db");

  for (const patch of REQUIRED_COLUMNS) {
    const sql = buildAlterStatement(patch);
    try {
      await pool.query(sql);
    } catch (error) {
      console.error(
        `[Schema] ❌ Impossible d'ajouter ${patch.table}.${patch.column} (${patch.reason})`,
        error,
      );
      // Relancer : démarrer avec un schéma incomplet ferait échouer chaque
      // requête de session, avec une erreur bien moins lisible que celle-ci.
      throw error;
    }
  }
  console.log(`[Schema] ✅ ${REQUIRED_COLUMNS.length} colonne(s) requise(s) vérifiée(s)`);
}
