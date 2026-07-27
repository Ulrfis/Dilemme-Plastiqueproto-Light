export interface DatabaseQueryable {
  query(text: string): Promise<unknown>;
}

export interface DatabaseHealth {
  ok: boolean;
  latencyMs: number;
}

export async function checkDatabaseHealth(
  database: DatabaseQueryable,
  timeoutMs = 3_000,
): Promise<DatabaseHealth> {
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await Promise.race([
      database.query("select 1"),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Database health check timed out")),
          timeoutMs,
        );
      }),
    ]);

    return { ok: true, latencyMs: Date.now() - startedAt };
  } catch {
    return { ok: false, latencyMs: Date.now() - startedAt };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
