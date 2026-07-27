# Migration PostgreSQL Replit → Coolify

Ce guide est la procédure opérationnelle retenue pour Dilemme.

## Décision

L'application utilise une base créée et administrée par Replit, sans compte
Neon autonome. Une base de développement Replit récente peut utiliser Helium et
son `DATABASE_URL` est alors limité à l'application Replit. Il ne faut pas
supposer que cette URL fonctionnera depuis Coolify.

La cible retenue est donc PostgreSQL géré par Coolify. Le serveur utilise le
pilote PostgreSQL standard `pg`, compatible avec Replit, Neon et Coolify.

## 1. Identifier la base réellement utilisée

Dans le projet Replit :

1. Ouvrir **Database**.
2. Sélectionner **Production** et relever le nombre de lignes des tables.
3. Ouvrir **Settings** et identifier le type d'URL sans copier sa valeur dans
   un document ou un chat :
   - hôte contenant `neon.tech` : base de production Neon gérée par Replit ;
   - hôte contenant `helium` : base Replit à accès restreint.
4. Comparer avec **Development** pour déterminer où se trouvent les vraies
   sessions.
5. Dans **Publishing → Adjust settings → Secrets**, vérifier que le déploiement
   utilise bien la base sélectionnée.

La source de migration est celle qui contient les données réelles, généralement
**Production**. Ne jamais choisir uniquement d'après le nom de la base.

## 2. Créer un dump depuis Replit

L'export doit être lancé dans un environnement ayant accès à la base source.
Pour une URL Replit restreinte, utiliser le Shell du projet ou un terminal de
déploiement Replit :

```bash
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --verbose \
  --file=dilemme-replit-production.dump
```

Vérifier le fichier :

```bash
ls -lh dilemme-replit-production.dump
pg_restore --list dilemme-replit-production.dump | sed -n '1,30p'
```

Télécharger ensuite `dilemme-replit-production.dump` sur un poste sécurisé.
Ne jamais ajouter le dump au dépôt Git.

Si le Shell pointe vers Development alors que les données sont dans Production,
utiliser l'URL de Production affichée par **Database → Production → Settings**
uniquement dans ce Shell, sans l'enregistrer dans le code.

## 3. Créer PostgreSQL dans Coolify

1. Dans le même projet et le même environnement que l'application, sélectionner
   **New Resource → PostgreSQL**.
2. Utiliser PostgreSQL 16 ou une version au moins égale à celle de la source.
3. Attendre que la base soit `Running`.
4. Conserver l'URL interne fournie par Coolify.
5. Ne pas exposer la base publiquement sauf besoin temporaire explicite.

## 4. Importer le dump

Dans la ressource PostgreSQL Coolify :

1. Ouvrir **Configuration → Import Backups**.
2. Charger `dilemme-replit-production.dump`.
3. Utiliser l'import `pg_restore` pour le format custom.
4. Lancer l'import et conserver le journal.

Ne pas exécuter `drizzle-kit push` avant l'import complet : le dump contient le
schéma et les données. Exécuter ensuite `npm run db:verify`, puis seulement
`npm run db:push` si le contrôle montre qu'une évolution du schéma est requise.

## 5. Vérifier la destination

Avec l'URL de la base Coolify disponible dans `DATABASE_URL` :

```bash
npm run db:verify
```

Le contrôle exige :

- `tutorial_sessions` ;
- `conversation_messages` ;
- `feedback_surveys` ;
- `tutorial_sessions.access_token`.

Il affiche aussi le nombre de lignes des trois tables. Ces nombres doivent
correspondre à la source, hors nouvelles écritures effectuées entre-temps.

## 6. Configurer l'application Coolify

Définir comme variable d'exécution :

```env
DATABASE_URL=<URL interne PostgreSQL Coolify>
DB_POOL_MAX=30
```

L'application et PostgreSQL doivent être sur le même réseau Coolify.

## 7. Bascule finale

1. Mettre l'application Replit en maintenance ou arrêter les nouvelles
   écritures.
2. Créer un dump final.
3. Réimporter ce dump dans une base Coolify vide, ou nettoyer la base de test
   avant le nouvel import.
4. Refaire `npm run db:verify`.
5. Déployer l'application Coolify.
6. Vérifier `GET /api/health` : HTTP 200 avec `database: "ok"`.
7. Créer une session test, la recharger, ajouter un message et soumettre un
   questionnaire.
8. Garder Replit et le dump final sans suppression pendant au moins sept jours.

## Retour arrière

En cas d'échec avant la reprise des écritures dans Coolify, remettre le domaine
sur Replit et redémarrer l'application Replit. La base Replit reste intacte.

Après des écritures en production dans Coolify, ne revenir vers Replit qu'après
avoir défini comment réimporter ces nouvelles données. Éviter absolument deux
bases acceptant simultanément des écritures de production.
