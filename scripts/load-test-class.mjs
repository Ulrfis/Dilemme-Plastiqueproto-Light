import { randomUUID } from "node:crypto";

const baseUrl = (process.env.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const sessionCount = positiveInteger(process.env.SESSIONS, 25);
const turnsPerSession = positiveInteger(process.env.TURNS, 1);
const adminToken = process.env.ADMIN_TOKEN || "";
const message =
  process.env.LOAD_TEST_MESSAGE ||
  "Je vois un grand panneau jaune Plastic Treaty devant les Nations Unies.";

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function percentile(values, ratio) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

async function requestJson(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${response.status} ${payload.error || response.statusText}`);
  }
  return payload;
}

async function createSession(index) {
  const startedAt = performance.now();
  const session = await requestJson("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userName: `LoadTest-${index + 1}`, audioMode: "text" }),
  });
  return { ...session, createMs: Math.round(performance.now() - startedAt) };
}

async function runTurn(session, turnIndex) {
  const startedAt = performance.now();
  const response = await fetch(`${baseUrl}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Session-Token": session.accessToken,
    },
    body: JSON.stringify({
      sessionId: session.id,
      accessToken: session.accessToken,
      userName: session.userName,
      userMessage: message,
      turnId: `load-${turnIndex + 1}-${randomUUID()}`,
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(`${response.status} ${payload.error || response.statusText}`);
  }

  const body = await response.text();
  const completed = body.includes('"type":"complete"');
  if (!completed) throw new Error("SSE terminé sans événement complete");
  return Math.round(performance.now() - startedAt);
}

async function readLoad() {
  if (!adminToken) return null;
  return requestJson("/api/health/load", {
    headers: { "x-admin-token": adminToken },
  });
}

console.log(
  `Test classe: ${sessionCount} sessions, ${turnsPerSession} tour(s), cible ${baseUrl}`,
);

const created = await Promise.allSettled(
  Array.from({ length: sessionCount }, (_, index) => createSession(index)),
);
const sessions = created.filter((result) => result.status === "fulfilled").map((result) => result.value);
const creationErrors = created.filter((result) => result.status === "rejected");

const turnLatencies = [];
const turnErrors = [];
for (let turnIndex = 0; turnIndex < turnsPerSession; turnIndex += 1) {
  const results = await Promise.allSettled(sessions.map((session) => runTurn(session, turnIndex)));
  for (const result of results) {
    if (result.status === "fulfilled") turnLatencies.push(result.value);
    else turnErrors.push(result.reason?.message || String(result.reason));
  }
}

const load = await readLoad().catch((error) => ({ error: error.message }));
const creationLatencies = sessions.map((session) => session.createMs);
console.log(JSON.stringify({
  sessionsRequested: sessionCount,
  sessionsCreated: sessions.length,
  sessionCreationErrors: creationErrors.length,
  turnsRequested: sessions.length * turnsPerSession,
  turnsCompleted: turnLatencies.length,
  turnErrors: turnErrors.length,
  latencyMs: {
    sessionCreateP50: percentile(creationLatencies, 0.5),
    sessionCreateP95: percentile(creationLatencies, 0.95),
    chatP50: percentile(turnLatencies, 0.5),
    chatP95: percentile(turnLatencies, 0.95),
    chatMax: turnLatencies.length ? Math.max(...turnLatencies) : null,
  },
  load,
  firstErrors: turnErrors.slice(0, 5),
}, null, 2));

if (creationErrors.length > 0 || turnErrors.length > 0) process.exitCode = 1;
