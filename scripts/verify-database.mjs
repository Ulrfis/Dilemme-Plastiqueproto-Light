import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

const requiredTables = [
  "conversation_messages",
  "feedback_surveys",
  "tutorial_sessions",
];

const pool = new Pool({
  connectionString,
  max: 1,
  connectionTimeoutMillis: 10_000,
});

try {
  const metadata = await pool.query(
    "select current_database() as database, current_user as role, version()",
  );
  const tables = await pool.query(
    `select table_name
       from information_schema.tables
      where table_schema = 'public'
        and table_name = any($1::text[])
      order by table_name`,
    [requiredTables],
  );
  const accessToken = await pool.query(
    `select column_name, data_type, is_nullable
       from information_schema.columns
      where table_schema = 'public'
        and table_name = 'tutorial_sessions'
        and column_name = 'access_token'`,
  );

  const foundTables = tables.rows.map((row) => row.table_name);
  const missingTables = requiredTables.filter(
    (table) => !foundTables.includes(table),
  );

  console.log("Database:", metadata.rows[0].database);
  console.log("Role:", metadata.rows[0].role);
  console.log("Tables:", foundTables.join(", ") || "none");
  console.log("access_token:", accessToken.rowCount === 1 ? "present" : "missing");

  if (missingTables.length > 0 || accessToken.rowCount !== 1) {
    console.error(
      `Schema incomplete. Missing: ${[
        ...missingTables,
        ...(accessToken.rowCount === 1 ? [] : ["tutorial_sessions.access_token"]),
      ].join(", ")}`,
    );
    process.exitCode = 2;
  } else {
    const counts = await pool.query(
      `select 'tutorial_sessions' as table_name, count(*)::bigint as row_count
         from tutorial_sessions
       union all
       select 'conversation_messages', count(*)::bigint
         from conversation_messages
       union all
       select 'feedback_surveys', count(*)::bigint
         from feedback_surveys`,
    );

    console.table(counts.rows);
    console.log("Database verification succeeded.");
  }
} catch (error) {
  console.error(
    "Database verification failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
} finally {
  await pool.end();
}
