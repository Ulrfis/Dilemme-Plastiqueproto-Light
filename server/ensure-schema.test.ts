import test from 'node:test';
import assert from 'node:assert/strict';

import { REQUIRED_COLUMNS, buildAlterStatement } from './ensure-schema.ts';

/**
 * `ensureSchema` tourne au démarrage, avant que le serveur accepte du trafic, sur
 * la base de production. Ces tests verrouillent son caractère strictement additif :
 * une entrée destructive ajoutée un jour par mégarde détruirait des données
 * d'élèves sans qu'aucune relecture ne l'arrête.
 */

test('every patch is a nullable column addition', () => {
  for (const patch of REQUIRED_COLUMNS) {
    assert.ok(patch.table.length > 0, 'table manquante');
    assert.ok(patch.column.length > 0, 'colonne manquante');
    assert.ok(patch.reason.length > 0, `raison manquante pour ${patch.column}`);
    assert.doesNotMatch(
      patch.type,
      /not\s+null/i,
      `${patch.column}: une colonne ajoutée à une table peuplée doit être nullable`,
    );
  }
});

test('identifiers stay simple — no SQL smuggled through a patch entry', () => {
  // Les identifiants sont interpolés dans l'ALTER TABLE : ils doivent rester des
  // noms nus, jamais une expression.
  for (const patch of REQUIRED_COLUMNS) {
    assert.match(patch.table, /^[a-z_][a-z0-9_]*$/);
    assert.match(patch.column, /^[a-z_][a-z0-9_]*$/);
    assert.match(patch.type, /^[a-z0-9 ()]+$/i);
  }
});

test('the OpenAI conversation column is covered', () => {
  // Sans elle, toute requête de session échoue après un déploiement sur une base
  // qui n'a pas reçu `npm run db:push`.
  const patch = REQUIRED_COLUMNS.find(
    c => c.table === 'tutorial_sessions' && c.column === 'conversation_id',
  );
  assert.ok(patch, 'conversation_id doit être garanti au démarrage');
  assert.equal(patch!.type, 'text');
});

test('generated statements are ADD COLUMN IF NOT EXISTS only', () => {
  for (const patch of REQUIRED_COLUMNS) {
    const sql = buildAlterStatement(patch);
    assert.match(sql, /^ALTER TABLE "[a-z_]+" ADD COLUMN IF NOT EXISTS "[a-z_]+" /);
    assert.doesNotMatch(sql, /DROP|RENAME|ALTER COLUMN|TRUNCATE|DELETE/i);
  }
});
