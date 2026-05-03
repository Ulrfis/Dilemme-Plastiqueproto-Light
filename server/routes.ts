import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage, type InsertTutorialSessionWithToken } from "./storage";
import { attachDeepgramRelay } from "./deepgramRelay";
import multer from "multer";
import OpenAI from "openai";
import { z } from "zod";
import { insertTutorialSessionSchema, insertConversationMessageSchema, insertFeedbackSurveySchema } from "@shared/schema";
import crypto from "crypto";
import { elevenLabsFetch, getPoolStats, getPoolHistory, POOL_HISTORY_CAPACITY, POOL_SAMPLE_INTERVAL_MS } from "./elevenlabs-agent";
import { captureServerError, captureServerEvent } from "./posthog";

const AUDIO_MIME_WHITELIST = new Set([
  "audio/webm",
  "audio/ogg",
  "audio/wav",
  "audio/mpeg",
  "audio/mp3",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 2 * 1024 * 1024, // 2 MB max to limiter le DoS
  },
  fileFilter: (_req, file, cb) => {
    if (AUDIO_MIME_WHITELIST.has(file.mimetype)) {
      return cb(null, true);
    }
    return cb(new Error(`Unsupported file type: ${file.mimetype}`));
  },
});

type RateEntry = { count: number; resetAt: number };
function createRateLimiter(maxRequests: number, windowMs: number) {
  const buckets = new Map<string, RateEntry>();
  let lastPurge = Date.now();

  return function rateLimiter(req: any, res: any, next: any) {
    const key = req.ip || req.headers["x-forwarded-for"] || "unknown";
    const now = Date.now();

    // Purge expired entries every 5 minutes to prevent unbounded memory growth
    if (now - lastPurge > 5 * 60 * 1000) {
      for (const [k, v] of buckets) {
        if (now > v.resetAt) buckets.delete(k);
      }
      lastPurge = now;
    }

    const entry = buckets.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + windowMs;
    }

    entry.count += 1;
    buckets.set(key, entry);

    if (entry.count > maxRequests) {
      const retryAfter = Math.max(0, Math.ceil((entry.resetAt - now) / 1000));
      res.set("Retry-After", retryAfter.toString());
      return res.status(429).json({ error: "Rate limit exceeded" });
    }

    next();
  };
}

const generalLimiter = createRateLimiter(200, 15 * 60 * 1000); // 200 req / 15 min / IP
const ttsLimiter = createRateLimiter(60, 15 * 60 * 1000); // plus strict pour endpoints coûteux
const sttLimiter = createRateLimiter(60, 15 * 60 * 1000);

// Track failed session-token verification attempts per IP+sessionId to block
// brute-force guessing of access tokens. Max 10 failures per minute per
// (IP, sessionId) pair. Once exceeded, further attempts return 429 until the
// window expires.
type AuthFailureEntry = { count: number; resetAt: number };
const sessionAuthFailures = new Map<string, AuthFailureEntry>();
const SESSION_AUTH_MAX_FAILURES = 10;
const SESSION_AUTH_WINDOW_MS = 60 * 1000;
let lastAuthFailurePurge = Date.now();

function getAuthFailureKey(req: any, sessionId: string): string {
  const ip = req.ip || req.headers["x-forwarded-for"] || "unknown";
  return `${ip}::${sessionId}`;
}

// Visibility into unauthorized session-token attempts. Keeps an in-memory
// counter and a bounded ring buffer of recent events so the admin dashboard
// can surface curious students probing other UUIDs / wrong tokens.
// Reset on server restart by design (no persistence).
type UnauthorizedEvent = {
  timestamp: number;
  sessionId: string;
  ip: string;
  reason: 'token-mismatch' | 'session-not-found' | 'missing-token';
};
const UNAUTHORIZED_EVENT_CAPACITY = 50;
const unauthorizedEvents: UnauthorizedEvent[] = [];
const unauthorizedCounts = {
  total: 0,
  tokenMismatch: 0,
  sessionNotFound: 0,
  missingToken: 0,
};
const UNAUTHORIZED_BY_SESSION_CAPACITY = 500;
const unauthorizedBySession = new Map<string, number>();

function recordUnauthorizedAccess(req: any, sessionId: string, reason: UnauthorizedEvent['reason']): void {
  const ip = String(req.ip || req.headers["x-forwarded-for"] || "unknown");
  unauthorizedCounts.total += 1;
  if (reason === 'token-mismatch') unauthorizedCounts.tokenMismatch += 1;
  else if (reason === 'session-not-found') unauthorizedCounts.sessionNotFound += 1;
  else if (reason === 'missing-token') unauthorizedCounts.missingToken += 1;
  // Bounded LRU-ish: when at capacity and adding a new key, evict the oldest insertion.
  if (!unauthorizedBySession.has(sessionId) && unauthorizedBySession.size >= UNAUTHORIZED_BY_SESSION_CAPACITY) {
    const oldestKey = unauthorizedBySession.keys().next().value as string | undefined;
    if (oldestKey) unauthorizedBySession.delete(oldestKey);
  }
  unauthorizedBySession.set(sessionId, (unauthorizedBySession.get(sessionId) || 0) + 1);
  unauthorizedEvents.push({ timestamp: Date.now(), sessionId, ip, reason });
  if (unauthorizedEvents.length > UNAUTHORIZED_EVENT_CAPACITY) {
    unauthorizedEvents.splice(0, unauthorizedEvents.length - UNAUTHORIZED_EVENT_CAPACITY);
  }
}

function isSessionAuthBlocked(req: any, sessionId: string): { blocked: boolean; retryAfter: number } {
  const now = Date.now();
  if (now - lastAuthFailurePurge > 5 * 60 * 1000) {
    for (const [k, v] of sessionAuthFailures) {
      if (now > v.resetAt) sessionAuthFailures.delete(k);
    }
    lastAuthFailurePurge = now;
  }
  const key = getAuthFailureKey(req, sessionId);
  const entry = sessionAuthFailures.get(key);
  if (!entry || now > entry.resetAt) return { blocked: false, retryAfter: 0 };
  if (entry.count >= SESSION_AUTH_MAX_FAILURES) {
    return { blocked: true, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
  }
  return { blocked: false, retryAfter: 0 };
}

function recordSessionAuthFailure(req: any, sessionId: string): void {
  const now = Date.now();
  const key = getAuthFailureKey(req, sessionId);
  const entry = sessionAuthFailures.get(key);
  if (!entry || now > entry.resetAt) {
    sessionAuthFailures.set(key, { count: 1, resetAt: now + SESSION_AUTH_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function requireAdmin(req: any, res: any): boolean {
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken) {
    // No token configured: never expose the endpoint regardless of environment
    res.status(404).json({ error: 'Not found' });
    return false;
  }

  if (req.headers['x-admin-token'] !== adminToken) {
    res.status(403).json({ error: 'Forbidden' });
    return false;
  }
  return true;
}

// PHASE 1 OPTIMIZATION: TTS Response Cache
// Cache TTS audio by text hash to avoid regenerating identical responses
const ttsCache = new Map<string, Buffer>();
const TTS_CACHE_MAX_SIZE = 100; // Limit cache to 100 entries to prevent memory issues

// PHASE 3 OPTIMIZATION: Pre-generated TTS store
// Stores TTS generation promises by token so the server can start generating
// TTS as soon as the LLM finishes, before the client requests it.
interface TtsRequest {
  promise: Promise<Buffer>;
  createdAt: number;
  // Task #34: carry session context so /api/tts/play error captures can
  // populate session_id + user_name in PostHog.
  sessionId?: string | null;
  userName?: string | null;
}
const ttsRequestStore = new Map<string, TtsRequest>();
const TTS_REQUEST_TTL = 60000; // 60 seconds TTL for pre-generated audio

// Cleanup expired TTS requests every 30 seconds
setInterval(() => {
  const now = Date.now();
  ttsRequestStore.forEach((req, token) => {
    if (now - req.createdAt > TTS_REQUEST_TTL) {
      ttsRequestStore.delete(token);
    }
  });
}, 30000);

// TASK #30: Pre-generated resume message store.
// After each chat exchange, the server silently generates the next resume
// message so it is instantly available when the user navigates back.
// Keyed by sessionId; one slot per session (newest generation overwrites).
//
// Stores the resolved audio Buffer — NOT a ttsRequestStore token — so lifetime
// is independent of TTS_REQUEST_TTL (60s). A fresh ttsRequestStore entry is
// only created at the moment the client calls GET /resume-token, resetting the
// 60s clock exactly when needed.
interface PregenResume {
  text: string;
  audioBuffer: Buffer;
  createdAt: number;
}
const pregenResumeStore = new Map<string, PregenResume>();
const PREGEN_RESUME_TTL = 5 * 60 * 1000; // 5 minutes — covers typical session-switch time

// Cleanup stale pregen resume entries every minute
setInterval(() => {
  const now = Date.now();
  pregenResumeStore.forEach((entry, sid) => {
    if (now - entry.createdAt > PREGEN_RESUME_TTL) {
      pregenResumeStore.delete(sid);
    }
  });
}, 60_000);

// Helper: Generate TTS audio from ElevenLabs (returns Buffer)
// previousText: text spoken before this segment, used by ElevenLabs to maintain prosody continuity
// quality: 'fast' uses eleven_flash_v2_5 for lowest latency (Phase 1)
//          'quality' uses eleven_multilingual_v2 for best prosody continuity (Phase 2)
async function generateTtsAudio(text: string, previousText?: string, quality: 'fast' | 'quality' = 'quality'): Promise<Buffer> {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
  const VOICE_ID = 'R8IjtpeRZsjoJfq1wwj3';

  if (!ELEVENLABS_API_KEY) {
    throw new Error('ElevenLabs API key not configured');
  }

  // Cache key includes text + quality level to avoid cross-phase cache pollution
  // (flash model audio should not be returned when quality model is requested and vice-versa)
  const textHash = crypto.createHash('md5').update(`${quality}:${text}`).digest('hex');
  if (!previousText && ttsCache.has(textHash)) {
    console.log('[TTS] Cache HIT:', textHash.substring(0, 8), `(${quality})`);
    return ttsCache.get(textHash)!;
  }

  // Phase 1 (fast): eleven_flash_v2_5, latency opt 3 → fast first audio without heavy compression artifacts
  // Phase 2 (quality): eleven_multilingual_v2, latency opt 2 → natural prosody for bulk of response
  const modelId = quality === 'fast' ? 'eleven_flash_v2_5' : 'eleven_multilingual_v2';
  const latencyOpt = quality === 'fast' ? 3 : 2;  // Was 4 for fast — level 4 causes compression artifacts on loud phonemes

  console.log('[TTS]', quality.toUpperCase(), 'mode — generating', text.length, 'chars', previousText ? `(with ${previousText.length} chars context)` : '', `[${modelId}]`);
  const body: Record<string, unknown> = {
    text,
    model_id: modelId,
    voice_settings: {
      stability: 0.75,          // Was 0.70 — slightly more stable, reduces amplitude spikes on "!"
      similarity_boost: 0.75,
      style: 0.0,               // Was 0.2 — neutral on flash model; expressivity on flash amplifies clipping on "!"
      use_speaker_boost: false  // Was true — speaker boost artificially amplifies peaks, causing saturation on exclamations
    },
    optimize_streaming_latency: latencyOpt,
  };

  if (previousText) {
    body.previous_text = previousText;
  }

  const response = await elevenLabsFetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
    method: 'POST',
    headers: {
      'Accept': 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': ELEVENLABS_API_KEY
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
  }

  const chunks: Buffer[] = [];
  if (response.body) {
    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
  }

  const audioBuffer = Buffer.concat(chunks);
  if (audioBuffer.byteLength === 0) {
    throw new Error('Received empty audio from ElevenLabs');
  }

  // Cache the result
  if (ttsCache.size >= TTS_CACHE_MAX_SIZE) {
    const firstKey = ttsCache.keys().next().value as string;
    if (firstKey) ttsCache.delete(firstKey);
  }
  ttsCache.set(textHash, audioBuffer);
  console.log('[TTS] Audio generated and cached:', audioBuffer.byteLength, 'bytes');

  return audioBuffer;
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  organization: 'org-z0AK8zYLTeapGaiDZFQ5co2N',
});

const ASSISTANT_ID = 'asst_P9b5PxMd1k9HjBgbyXI1Cvm9';

// Vérifier que l'assistant existe au démarrage
async function validateAssistant() {
  try {
    const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);
    console.log('[Server] ✅ Assistant validated:', assistant.name);
  } catch (error) {
    console.error('[Server] ❌ CRITICAL: Assistant not found or invalid!', error);
  }
}

// Appeler au démarrage
validateAssistant();

const TARGET_CLUES = [
  { keyword: "Déchets plastiques", variants: ["déchets plastiques", "dechets plastiques", "plastique", "pollution plastique", "déchets", "ordures plastiques"] },
  { keyword: "ADN", variants: ["adn", "acide désoxyribonucléique", "génétique", "double hélice", "hélice adn"] },
  { keyword: "Traité plastique", variants: ["traité plastique", "traite plastique", "traité", "accord plastique", "convention plastique"] },
  { keyword: "Végétation", variants: ["végétation", "végétaux", "algues", "algue", "végétation marine", "plantes marines", "végétaux marins", "plantes", "verdure"] },
  { keyword: "Homme", variants: ["homme", "penseur", "rodin", "sculpture homme", "figure masculine", "personnage masculin"] },
  { keyword: "Femme", variants: ["femme", "figure féminine", "personnage féminin", "sculpture femme", "mère", "terre-mère"] }
];

function detectClues(text: string, alreadyFound: string[]): string[] {
  const textLower = text.toLowerCase();
  const foundClues: string[] = [];

  for (const clue of TARGET_CLUES) {
    // Skip if already found
    if (alreadyFound.includes(clue.keyword)) continue;

    // Check all variants for this clue
    for (const variant of clue.variants) {
      if (textLower.includes(variant)) {
        foundClues.push(clue.keyword);
        break; // Move to next clue (avoid duplicates)
      }
    }
  }

  return foundClues;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Rate-limit global API
  app.use('/api', generalLimiter);

  // Counter + recent events for unauthorized session access attempts.
  // Useful in a school setting to spot students probing other UUIDs / wrong tokens.
  app.get('/api/health/unauthorized', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const topSessions = Array.from(unauthorizedBySession.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([sessionId, count]) => ({ sessionId, count }));
    res.json({
      timestamp: Date.now(),
      counts: unauthorizedCounts,
      capacity: UNAUTHORIZED_EVENT_CAPACITY,
      recent: [...unauthorizedEvents].reverse(),
      topSessions,
    });
  });

  // Minimal HTML admin dashboard. Token is supplied via ?token=... and sent
  // back as the x-admin-token header on the health calls.
  app.get('/admin', async (_req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Admin dashboard</title>
<meta name="viewport" content="width=device-width,initial-scale=1" />
<style>
  body { font-family: system-ui, sans-serif; margin: 0; padding: 24px; background: #0b0d10; color: #e6e8eb; }
  h1 { font-size: 20px; margin: 0 0 16px; }
  h2 { font-size: 15px; margin: 24px 0 8px; color: #9aa4ad; text-transform: uppercase; letter-spacing: .04em; }
  .card { background: #14181d; border: 1px solid #1f2630; border-radius: 6px; padding: 16px; margin-bottom: 16px; }
  .row { display: flex; gap: 16px; flex-wrap: wrap; }
  .stat { flex: 1 1 140px; background: #0f1418; border: 1px solid #1f2630; border-radius: 6px; padding: 12px; }
  .stat .label { font-size: 11px; color: #9aa4ad; text-transform: uppercase; letter-spacing: .04em; }
  .stat .value { font-size: 24px; font-weight: 600; margin-top: 4px; }
  .stat.warn .value { color: #f0a14a; }
  .stat.bad .value { color: #ef6b6b; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #1f2630; font-family: ui-monospace, monospace; }
  th { color: #9aa4ad; font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  .reason-token-mismatch { color: #ef6b6b; }
  .reason-session-not-found { color: #f0a14a; }
  .reason-missing-token { color: #9aa4ad; }
  input[type=password] { background: #0f1418; color: #e6e8eb; border: 1px solid #1f2630; border-radius: 4px; padding: 6px 8px; font-size: 13px; }
  button { background: #2563eb; color: white; border: 0; border-radius: 4px; padding: 6px 12px; font-size: 13px; cursor: pointer; }
  button:hover { background: #1d4fd1; }
  .muted { color: #9aa4ad; font-size: 12px; }
  .empty { color: #9aa4ad; font-style: italic; padding: 12px; text-align: center; }
</style>
</head>
<body>
<h1>Admin dashboard</h1>
<div class="card">
  <form id="auth-form" onsubmit="return setToken(event)">
    <label class="muted" for="token">Admin token</label><br/>
    <input id="token" type="password" placeholder="x-admin-token" autocomplete="off" />
    <button type="submit">Connect</button>
    <span id="auth-status" class="muted" style="margin-left:8px;"></span>
  </form>
</div>

<h2>Unauthorized session access</h2>
<div class="card">
  <div class="row">
    <div class="stat bad"><div class="label">Total attempts</div><div class="value" id="u-total">—</div></div>
    <div class="stat bad"><div class="label">Token mismatch (403)</div><div class="value" id="u-mismatch">—</div></div>
    <div class="stat warn"><div class="label">Unknown session (404)</div><div class="value" id="u-notfound">—</div></div>
    <div class="stat"><div class="label">Missing token</div><div class="value" id="u-missing">—</div></div>
  </div>
  <p class="muted" style="margin-top:12px;">Counters reset when the server restarts. Auto-refreshes every 5s.</p>
</div>

<h2>Top targeted sessions</h2>
<div class="card">
  <table id="top-sessions"><thead><tr><th>Session ID</th><th>Attempts</th></tr></thead><tbody></tbody></table>
  <div id="top-sessions-empty" class="empty">No unauthorized attempts yet.</div>
</div>

<h2>Recent attempts (latest first)</h2>
<div class="card">
  <table id="recent"><thead><tr><th>Time</th><th>Reason</th><th>IP</th><th>Session ID</th></tr></thead><tbody></tbody></table>
  <div id="recent-empty" class="empty">No unauthorized attempts yet.</div>
</div>

<script>
  const urlObj = new URL(location.href);
  const urlToken = urlObj.searchParams.get('token');
  let adminToken = sessionStorage.getItem('adminToken') || urlToken || '';
  if (urlToken) {
    // Avoid leaking token via browser history / referrers.
    sessionStorage.setItem('adminToken', urlToken);
    urlObj.searchParams.delete('token');
    history.replaceState(null, '', urlObj.toString());
  }
  if (adminToken) document.getElementById('token').value = adminToken;

  function setToken(e) {
    e.preventDefault();
    adminToken = document.getElementById('token').value.trim();
    sessionStorage.setItem('adminToken', adminToken);
    refresh();
    return false;
  }

  function fmtTime(ts) {
    const d = new Date(ts);
    return d.toLocaleTimeString() + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }

  async function refresh() {
    const status = document.getElementById('auth-status');
    if (!adminToken) { status.textContent = 'Enter the admin token to load data.'; return; }
    try {
      const r = await fetch('/api/health/unauthorized', { headers: { 'x-admin-token': adminToken } });
      if (r.status === 403 || r.status === 404) {
        status.textContent = 'Invalid or missing admin token.';
        return;
      }
      const data = await r.json();
      status.textContent = 'Last update: ' + new Date(data.timestamp).toLocaleTimeString();
      document.getElementById('u-total').textContent = data.counts.total;
      document.getElementById('u-mismatch').textContent = data.counts.tokenMismatch;
      document.getElementById('u-notfound').textContent = data.counts.sessionNotFound;
      document.getElementById('u-missing').textContent = data.counts.missingToken;

      function cell(text, className) {
        const td = document.createElement('td');
        td.textContent = text == null ? '' : String(text);
        if (className) td.className = className;
        return td;
      }

      const tsBody = document.querySelector('#top-sessions tbody');
      tsBody.replaceChildren();
      document.getElementById('top-sessions-empty').style.display = data.topSessions.length ? 'none' : 'block';
      document.getElementById('top-sessions').style.display = data.topSessions.length ? 'table' : 'none';
      for (const row of data.topSessions) {
        const tr = document.createElement('tr');
        tr.appendChild(cell(row.sessionId));
        tr.appendChild(cell(row.count));
        tsBody.appendChild(tr);
      }

      const allowedReasons = { 'token-mismatch': 1, 'session-not-found': 1, 'missing-token': 1 };
      const rBody = document.querySelector('#recent tbody');
      rBody.replaceChildren();
      document.getElementById('recent-empty').style.display = data.recent.length ? 'none' : 'block';
      document.getElementById('recent').style.display = data.recent.length ? 'table' : 'none';
      for (const ev of data.recent) {
        const tr = document.createElement('tr');
        const reasonClass = allowedReasons[ev.reason] ? 'reason-' + ev.reason : '';
        tr.appendChild(cell(fmtTime(ev.timestamp)));
        tr.appendChild(cell(ev.reason, reasonClass));
        tr.appendChild(cell(ev.ip));
        tr.appendChild(cell(ev.sessionId));
        rBody.appendChild(tr);
      }
    } catch (err) {
      status.textContent = 'Error: ' + err.message;
    }
  }

  refresh();
  setInterval(refresh, 5000);
</script>
</body>
</html>`);
  });

  // Snapshot of the undici connection pool used for ElevenLabs (point-in-time).
  app.get('/api/health/connections', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    res.json({
      timestamp: Date.now(),
      stats: getPoolStats(),
    });
  });

  // Time-series of recent pool snapshots (one per connection-warming tick,
  // ~every 30s, capped at the last POOL_HISTORY_CAPACITY samples).
  app.get('/api/health/connections/history', async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const samples = getPoolHistory();
    res.json({
      capacity: POOL_HISTORY_CAPACITY,
      count: samples.length,
      intervalMs: POOL_SAMPLE_INTERVAL_MS,
      samples,
    });
  });

  // Endpoint de diagnostic pour vérifier les services AI
  app.get('/api/health/ai', async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const results: Record<string, { status: string; message: string }> = {
      openai: { status: 'unknown', message: '' },
      assistant: { status: 'unknown', message: '' },
      elevenlabs: { status: 'unknown', message: '' },
    };

    // Test OpenAI
    try {
      const models = await openai.models.list();
      results.openai = { status: 'ok', message: `${models.data.length} models available` };
    } catch (error) {
      results.openai = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Test Assistant
    try {
      const assistant = await openai.beta.assistants.retrieve(ASSISTANT_ID);
      results.assistant = { status: 'ok', message: `Assistant: ${assistant.name}` };
    } catch (error) {
      results.assistant = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Test ElevenLabs
    try {
      const response = await elevenLabsFetch('https://api.elevenlabs.io/v1/user', {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY || '' }
      });
      if (response.ok) {
        const data = await response.json() as { subscription?: { character_count?: number } };
        results.elevenlabs = { status: 'ok', message: `Characters: ${data.subscription?.character_count || 'N/A'}` };
      } else {
        results.elevenlabs = { status: 'error', message: `HTTP ${response.status}` };
      }
    } catch (error) {
      results.elevenlabs = { status: 'error', message: error instanceof Error ? error.message : 'Unknown error' };
    }

    res.json(results);
  });

  // Endpoint de diagnostic pour Google Sheets
  app.get('/api/health/sheets', async (req, res) => {
    if (!requireAdmin(req, res)) return;

    const result: { status: string; message: string; details?: any } = {
      status: 'unknown',
      message: '',
    };

    try {
      // Vérifier les variables d'environnement
      const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
      const hasReplIdentity = !!process.env.REPL_IDENTITY;
      const hasWebReplRenewal = !!process.env.WEB_REPL_RENEWAL;

      result.details = {
        REPLIT_CONNECTORS_HOSTNAME: hostname ? 'SET' : 'NOT SET',
        REPL_IDENTITY: hasReplIdentity ? 'SET' : 'NOT SET',
        WEB_REPL_RENEWAL: hasWebReplRenewal ? 'SET' : 'NOT SET',
      };

      if (!hostname) {
        result.status = 'error';
        result.message = 'REPLIT_CONNECTORS_HOSTNAME not set - Not running on Replit?';
        return res.json(result);
      }

      if (!hasReplIdentity && !hasWebReplRenewal) {
        result.status = 'error';
        result.message = 'No Replit token available (REPL_IDENTITY or WEB_REPL_RENEWAL)';
        return res.json(result);
      }

      // Tester la connexion au connecteur
      const xReplitToken = hasReplIdentity
        ? 'repl ' + process.env.REPL_IDENTITY
        : 'depl ' + process.env.WEB_REPL_RENEWAL;

      const url = 'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=google-sheet';
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'X_REPLIT_TOKEN': xReplitToken
        }
      });

      if (!response.ok) {
        result.status = 'error';
        result.message = `Connector API error: ${response.status} ${response.statusText}`;
        return res.json(result);
      }

      const data = await response.json();
      const connector = data.items?.[0];

      if (!connector) {
        result.status = 'error';
        result.message = 'No Google Sheet connector found. Please add Google Sheets connection in Replit panel.';
        result.details.connectorCount = data.items?.length || 0;
        return res.json(result);
      }

      result.details.connectorName = connector.connector_name;
      result.details.hasAccessToken = !!(connector.settings?.access_token || connector.settings?.oauth?.credentials?.access_token);
      result.details.settingsKeys = Object.keys(connector.settings || {});
      result.details.spreadsheetId = connector.settings?.spreadsheet_id || 'NOT SET (will use hardcoded)';

      if (!result.details.hasAccessToken) {
        result.status = 'error';
        result.message = 'Google Sheet connector found but no access token';
        return res.json(result);
      }

      result.status = 'ok';
      result.message = 'Google Sheets connection is configured correctly';

    } catch (error) {
      result.status = 'error';
      result.message = error instanceof Error ? error.message : 'Unknown error';
    }

    res.json(result);
  });

  // Endpoint de TEST complet pour Google Sheets (essaie vraiment d'écrire)
  app.get('/api/health/sheets/test', async (req, res) => {
    if (!requireAdmin(req, res)) return;

    try {
      const { testGoogleSheetsConnection } = await import('./google-sheets-sync');
      const result = await testGoogleSheetsConnection();
      res.json(result);
    } catch (error) {
      res.json({
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * Verify that the request carries the correct access token for the given session.
   * Returns the session on success, or sends a 401/403/404 response and returns null.
   */
  async function verifySessionToken(
    sessionId: string,
    req: import('express').Request,
    res: import('express').Response
  ): Promise<import('@shared/schema').TutorialSession | null> {
    // Throttle brute-force attempts: if this (IP, sessionId) has already
    // failed too many times in the current window, refuse immediately
    // without touching storage or comparing tokens.
    const blockState = isSessionAuthBlocked(req, sessionId);
    if (blockState.blocked) {
      res.set('Retry-After', blockState.retryAfter.toString());
      res.status(429).json({ error: 'Too many failed attempts' });
      return null;
    }

    const session = await storage.getSession(sessionId);
    if (!session) {
      recordSessionAuthFailure(req, sessionId);
      recordUnauthorizedAccess(req, sessionId, 'session-not-found');
      res.status(404).json({ error: 'Session not found' });
      return null;
    }
    const provided =
      (req.headers['x-session-token'] as string | undefined) ||
      (req.body?.accessToken as string | undefined);
    if (!provided || provided !== session.accessToken) {
      recordSessionAuthFailure(req, sessionId);
      recordUnauthorizedAccess(req, sessionId, provided ? 'token-mismatch' : 'missing-token');
      res.status(403).json({ error: 'Forbidden' });
      return null;
    }
    return session;
  }

  /**
   * Remove `accessToken` from a session object before sending it to the client.
   * The token is only ever sent once: in the POST /api/sessions creation response.
   */
  function sanitizeSession<T extends { accessToken?: string | null }>(session: T): Omit<T, 'accessToken'> {
    const { accessToken: _removed, ...rest } = session;
    return rest as Omit<T, 'accessToken'>;
  }

  app.post('/api/sessions', async (req, res) => {
    try {
      const data = insertTutorialSessionSchema.parse(req.body);
      const accessToken = crypto.randomBytes(16).toString('hex');
      const sessionData: InsertTutorialSessionWithToken = { ...data, accessToken };
      const session = await storage.createSession(sessionData);

      // Pre-generate welcome message TTS in background so TutorialScreen can play it immediately
      // without waiting for an on-demand ElevenLabs call after navigation.
      const welcomeText = `Bienvenue ${data.userName} dans cette courte expérience. Il faut que tu trouves 6 indices dans cette image, en me racontant ce que tu vois, ce qui attire ton attention, en relation avec la problématique de l'impact du plastique sur la santé. Tu as maximum 8 échanges pour y parvenir !`;
      const welcomeAudioToken = crypto.randomUUID();
      const welcomePromise = generateTtsAudio(welcomeText, undefined, 'quality');
      // Capture silent welcome-TTS pregen failures (otherwise they only surface
      // if /api/tts/play is ever called for this token).
      welcomePromise.catch((err) => {
        captureServerError(
          '/api/sessions',
          session.id,
          err,
          { context: 'welcome_pregen_tts' },
          data.userName,
        );
      });
      ttsRequestStore.set(welcomeAudioToken, {
        promise: welcomePromise,
        createdAt: Date.now(),
        sessionId: session.id,
        userName: data.userName,
      });
      console.log('[Session Create] Pre-generating welcome TTS in background, token:', welcomeAudioToken.substring(0, 8));

      // Return accessToken once so the client can persist it; also include welcomeAudioToken
      res.json({ ...session, welcomeAudioToken });
    } catch (error) {
      console.error('Error creating session:', error);
      res.status(400).json({ error: 'Invalid session data' });
    }
  });

  app.get('/api/sessions/:id', async (req, res) => {
    try {
      const session = await verifySessionToken(req.params.id, req, res);
      if (!session) return;
      res.json(sanitizeSession(session));
    } catch (error) {
      console.error('Error fetching session:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.patch('/api/sessions/:id', async (req, res) => {
    try {
      const verified = await verifySessionToken(req.params.id, req, res);
      if (!verified) return;

      const updateSchema = z.object({
        foundClues: z.array(z.string()).optional(),
        score: z.number().int().min(0).max(4).optional(),
        audioMode: z.enum(['voice', 'text']).optional(),
        completed: z.number().int().min(0).max(1).optional(),
        threadId: z.string().optional().nullable(),
      });

      const updates = updateSchema.parse(req.body);
      const session = await storage.updateSession(req.params.id, updates);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json(sanitizeSession(session));
    } catch (error) {
      console.error('Error updating session:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid update data', details: error.errors });
      }
      res.status(500).json({ error: 'Server error' });
    }
  });

  // Feedback survey endpoints
  app.post('/api/feedback', async (req, res) => {
    try {
      const data = insertFeedbackSurveySchema.parse(req.body);
      const feedback = await storage.createFeedback(data);
      res.json(feedback);
    } catch (error) {
      console.error('Error creating feedback:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid feedback data', details: error.errors });
      }
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.get('/api/feedback/:sessionId', async (req, res) => {
    try {
      const verified = await verifySessionToken(req.params.sessionId, req, res);
      if (!verified) return;

      const feedback = await storage.getFeedbackBySession(req.params.sessionId);
      if (!feedback) {
        return res.status(404).json({ error: 'Feedback not found' });
      }
      res.json(feedback);
    } catch (error) {
      console.error('Error fetching feedback:', error);
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.patch('/api/sessions/:id/feedback', async (req, res) => {
    try {
      const sessionId = req.params.id;

      const verified = await verifySessionToken(sessionId, req, res);
      if (!verified) return;

      const feedbackSchema = z.object({
        scenarioComprehension: z.number().int().min(1).max(6).optional(),
        scenarioObjectives: z.number().int().min(1).max(6).optional(),
        scenarioClueLink: z.number().int().min(1).max(6).optional(),
        gameplayExplanation: z.number().int().min(1).max(6).optional(),
        gameplaySimplicity: z.number().int().min(1).max(6).optional(),
        gameplayBotResponses: z.number().int().min(1).max(6).optional(),
        gameplayVoiceChat: z.number().int().min(1).max(6).optional(),
        feelingOriginality: z.number().int().min(1).max(6).optional(),
        feelingPleasant: z.number().int().min(1).max(6).optional(),
        feelingInteresting: z.number().int().min(1).max(6).optional(),
        motivationContinue: z.number().int().min(1).max(6).optional(),
        motivationGameplay: z.number().int().min(1).max(6).optional(),
        motivationEcology: z.number().int().min(1).max(6).optional(),
        interfaceVisualBeauty: z.number().int().min(1).max(6).optional(),
        interfaceVisualClarity: z.number().int().min(1).max(6).optional(),
        interfaceVoiceChat: z.number().int().min(1).max(6).optional(),
        overallRating: z.number().int().min(1).max(6).optional(),
        improvements: z.string().max(2000).optional(),
        wantsUpdates: z.boolean().optional(),
        updateEmail: z.string().email().max(254).optional().nullable(),
        wouldRecommend: z.boolean().optional(),
        wantsInSchool: z.boolean().optional(),
        feedbackCompletedAt: z.string().optional(),
      });

      const partialFeedback = feedbackSchema.parse(req.body);

      console.log('[API] Partial feedback update for session:', sessionId, '- fields:', Object.keys(partialFeedback).join(', '));

      const session = await storage.updatePartialFeedback(sessionId, partialFeedback);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      res.json({ success: true, session: sanitizeSession(session) });
    } catch (error) {
      console.error('Error updating partial feedback:', error);
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: 'Invalid feedback data', details: error.errors });
      }
      res.status(500).json({ error: 'Server error' });
    }
  });

  app.post('/api/speech-to-text', sttLimiter, upload.single('audio'), async (req: Express.Request, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No audio file provided' });
      }

      const audioBuffer = req.file.buffer;
      const audioFile = new File([audioBuffer], 'audio.webm', { type: 'audio/webm' });

      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-1',
        language: 'fr',
      });

      res.json({ text: transcription.text });
    } catch (error) {
      console.error('Error transcribing audio:', error);
      const sttBody = (req as unknown as { body?: { sessionId?: string; userName?: string } }).body;
      captureServerError(
        '/api/speech-to-text',
        sttBody?.sessionId ?? null,
        error,
        { context: 'whisper_transcription' },
        sttBody?.userName ?? null,
      );
      res.status(500).json({ error: 'Transcription failed' });
    }
  });

  // PHASE 3 OPTIMIZATION: GET endpoint for pre-generated TTS audio
  // The server starts TTS generation as soon as the LLM finishes (before client requests it).
  // Client sets audio.src to this URL for native streaming playback.
  app.get('/api/tts/play/:token', async (req, res) => {
    const { token } = req.params;
    const ttsRequest = ttsRequestStore.get(token);

    if (!ttsRequest) {
      return res.status(404).json({ error: 'TTS token not found or expired' });
    }

    try {
      const audioBuffer = await ttsRequest.promise;

      // Clean up the token after use
      ttsRequestStore.delete(token);

      res.set('Content-Type', 'audio/mpeg');
      res.set('Content-Length', String(audioBuffer.byteLength));
      res.set('Accept-Ranges', 'bytes');
      res.set('Cache-Control', 'no-cache');
      res.send(audioBuffer);
    } catch (error) {
      console.error('[TTS Play] Error:', error);
      captureServerError(
        '/api/tts/play',
        ttsRequest.sessionId ?? null,
        error,
        { context: 'tts_play_token' },
        ttsRequest.userName ?? null,
      );
      ttsRequestStore.delete(token);
      res.status(500).json({
        error: 'TTS generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // PHASE 2 OPTIMIZATION: Streaming TTS endpoint
  // Uses ElevenLabs streaming to send audio chunks as they're generated
  app.post('/api/text-to-speech/stream', ttsLimiter, async (req, res) => {
    try {
      console.log('[TTS Stream API] Request received:', { textLength: req.body.text?.length });
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }

      // PHASE 1: Still check cache first for instant response
      const textHash = crypto.createHash('md5').update(text).digest('hex');
      if (ttsCache.has(textHash)) {
        console.log('[TTS Stream API] Cache HIT - streaming cached audio:', textHash.substring(0, 8));
        const cachedBuffer = ttsCache.get(textHash)!;
        res.set('Content-Type', 'audio/mpeg');
        res.set('X-Cache', 'HIT');
        res.send(cachedBuffer);
        return;
      }

      console.log('[TTS Stream API] Cache MISS - streaming from ElevenLabs:', textHash.substring(0, 8));

      const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
      const VOICE_ID = 'R8IjtpeRZsjoJfq1wwj3'; // Peter - nouveau workspace

      if (!ELEVENLABS_API_KEY) {
        console.error('[TTS Stream API] ElevenLabs API key not configured');
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      console.log('[TTS Stream API] Calling ElevenLabs streaming API...');

      // Call ElevenLabs with optimized settings for French diction quality
      // Full text is sent in a single call to maintain consistent voice register
      const response = await elevenLabsFetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2', // Best quality for French diction
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: false  // Disabled — causes saturation/clipping on exclamations
          },
          optimize_streaming_latency: 3,
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TTS Stream API] ElevenLabs API error:', response.status, errorText);
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      // Set streaming headers
      res.set('Content-Type', 'audio/mpeg');
      res.set('Transfer-Encoding', 'chunked');
      res.set('X-Cache', 'MISS');

      // Collect chunks for caching while streaming to client
      const chunks: Buffer[] = [];

      console.log('[TTS Stream API] Streaming audio chunks to client...');

      // Stream response body to client
      if (response.body) {
        const reader = response.body.getReader();
        let chunkCount = 0;

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            chunkCount++;
            const chunk = Buffer.from(value);
            chunks.push(chunk);

            // Stream chunk to client immediately
            res.write(chunk);

            if (chunkCount === 1) {
              console.log('[TTS Stream API] First audio chunk sent (', chunk.length, 'bytes)');
            }
          }

          console.log('[TTS Stream API] Stream complete -', chunkCount, 'chunks sent');
        } catch (streamError) {
          console.error('[TTS Stream API] Error during streaming:', streamError);
          throw streamError;
        }
      }

      // End the response
      res.end();

      // Cache the complete audio
      const completeAudio = Buffer.concat(chunks);
      if (completeAudio.byteLength > 0) {
        // Implement LRU-style eviction if cache is full
        if (ttsCache.size >= TTS_CACHE_MAX_SIZE) {
          const firstKey = ttsCache.keys().next().value as string;
          if (firstKey) ttsCache.delete(firstKey);
          console.log('[TTS Stream API] Cache full - evicted oldest entry');
        }
        ttsCache.set(textHash, completeAudio);
        console.log('[TTS Stream API] Audio cached. Size:', completeAudio.byteLength, 'bytes, Cache entries:', ttsCache.size);
      }

    } catch (error) {
      console.error('[TTS Stream API] Error:', error);
      captureServerError(
        '/api/text-to-speech/stream',
        (req.body?.sessionId as string | undefined) ?? null,
        error,
        { context: 'tts_stream' },
        (req.body?.userName as string | undefined) ?? null,
      );
      if (!res.headersSent) {
        res.status(500).json({
          error: 'Speech generation failed',
          details: error instanceof Error ? error.message : 'Unknown error'
        });
      } else {
        // Headers already sent, just end the response
        res.end();
      }
    }
  });

  app.post('/api/text-to-speech', ttsLimiter, async (req, res) => {
    try {
      console.log('[TTS API] Request received:', { textLength: req.body.text?.length });
      const { text } = req.body;

      if (!text) {
        return res.status(400).json({ error: 'No text provided' });
      }

      // PHASE 1 OPTIMIZATION: Check cache first
      const textHash = crypto.createHash('md5').update(text).digest('hex');
      if (ttsCache.has(textHash)) {
        console.log('[TTS API] Cache HIT - returning cached audio for hash:', textHash.substring(0, 8));
        const cachedBuffer = ttsCache.get(textHash)!;
        res.set('Content-Type', 'audio/mpeg');
        res.set('X-Cache', 'HIT'); // Debug header to confirm cache usage
        return res.send(cachedBuffer);
      }

      console.log('[TTS API] Cache MISS - generating new audio for hash:', textHash.substring(0, 8));

      const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
      const VOICE_ID = 'R8IjtpeRZsjoJfq1wwj3'; // Peter - nouveau workspace

      console.log('[TTS API] Using voice:', VOICE_ID);

      if (!ELEVENLABS_API_KEY) {
        console.error('[TTS API] ElevenLabs API key not configured');
        return res.status(500).json({ error: 'ElevenLabs API key not configured' });
      }

      console.log('[TTS API] Calling ElevenLabs API...');
      const response = await elevenLabsFetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVENLABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2', // Best quality for French diction
          voice_settings: {
            stability: 0.75,
            similarity_boost: 0.75,
            style: 0.0,
            use_speaker_boost: false  // Disabled — causes saturation/clipping on exclamations
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[TTS API] ElevenLabs API error:', response.status, errorText);
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const audioBuffer = await response.arrayBuffer();

      // MOBILE FIX: Vérifier que l'audio n'est pas vide
      if (audioBuffer.byteLength === 0) {
        console.error('[TTS API] Received empty audio from ElevenLabs');
        throw new Error('Received empty audio from ElevenLabs');
      }

      const audioBufferNode = Buffer.from(audioBuffer);

      // PHASE 1 OPTIMIZATION: Store in cache
      // Implement LRU-style eviction if cache is full
      if (ttsCache.size >= TTS_CACHE_MAX_SIZE) {
        // Remove oldest entry (first key in Map)
        const firstKey = ttsCache.keys().next().value as string;
        if (firstKey) ttsCache.delete(firstKey);
        console.log('[TTS API] Cache full - evicted oldest entry');
      }
      ttsCache.set(textHash, audioBufferNode);
      console.log('[TTS API] Audio cached successfully. Cache size:', ttsCache.size);

      console.log('[TTS API] Audio generated successfully, size:', audioBuffer.byteLength, 'bytes');
      res.set('Content-Type', 'audio/mpeg');
      res.set('X-Cache', 'MISS'); // Debug header to confirm cache usage
      res.send(audioBufferNode);
    } catch (error) {
      console.error('[TTS API] Error generating speech:', error);
      captureServerError(
        '/api/text-to-speech',
        (req.body?.sessionId as string | undefined) ?? null,
        error,
        { context: 'tts_full' },
        (req.body?.userName as string | undefined) ?? null,
      );
      res.status(500).json({
        error: 'Speech generation failed',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // TASK #30: Background pre-generation of the resume message.
  // Called fire-and-forget at the end of every chat stream so that, if the user
  // navigates away and comes back, the message is already ready.
  //
  // Uses an ISOLATED EPHEMERAL THREAD (not the session's main thread) so that
  // the hidden resume prompt never pollutes the live conversation history.
  // The ephemeral thread is created, used, and never referenced again.
  async function schedulePregenResume(sessionId: string): Promise<void> {
    try {
      const session = await storage.getSession(sessionId);
      if (!session) return;

      const allTargetKeywords = TARGET_CLUES.map(c => c.keyword);
      const foundClues = session.foundClues || [];
      const missingClues = allTargetKeywords.filter(k => !foundClues.includes(k));
      const userName = session.userName || 'toi';

      const foundSummary = foundClues.length > 0
        ? `Il a déjà trouvé ${foundClues.length}/6 indices (${foundClues.join(', ')})`
        : `Il n'a encore trouvé aucun indice`;
      const missingSummary = missingClues.length > 0
        ? `Il lui reste à découvrir : ${missingClues.join(', ')}`
        : `Il a trouvé tous les indices !`;

      const resumePrompt = `[REPRISE DE SESSION — NE PAS COMPTER COMME ÉCHANGE]\n${userName} revient après une courte pause. ${foundSummary}. ${missingSummary}.\nAccueille-le chaleureusement en 1-2 phrases MAXIMUM. Si la conversation a déjà eu lieu, fais-y référence naturellement. Guide-le subtilement vers un des indices manquants. N'utilise PAS la phrase de bienvenue initiale ("Bienvenue dans cette courte expérience…"). Sois bref et naturel.`;

      // Create an isolated ephemeral thread — never touches the session's main thread.
      const ephemeralThread = await openai.beta.threads.create();
      await openai.beta.threads.messages.create(ephemeralThread.id, {
        role: 'user',
        content: resumePrompt,
      });

      const stream = await openai.beta.threads.runs.stream(ephemeralThread.id, {
        assistant_id: ASSISTANT_ID,
      });

      let resumeText = '';
      for await (const event of stream) {
        if (event.event === 'thread.message.delta') {
          const delta = event.data.delta;
          if (delta.content) {
            for (const block of delta.content) {
              if (block.type === 'text') {
                resumeText += block.text?.value || '';
              }
            }
          }
        }
        if (event.event === 'thread.run.failed' ||
            event.event === 'thread.run.cancelled' ||
            event.event === 'thread.run.expired') {
          throw new Error(`Pregen resume run failed: ${event.event}`);
        }
      }
      // Ephemeral thread is not stored — it will expire on OpenAI's end naturally.

      if (!resumeText) {
        resumeText = missingClues.length > 0
          ? `Bienvenue de retour ! Tu as déjà trouvé ${foundClues.length} indice${foundClues.length !== 1 ? 's' : ''}. Continue à observer l'image — qu'est-ce qui attire ton attention ?`
          : `Bienvenue de retour ! Tu as trouvé tous les indices, tu peux continuer l'expérience.`;
      }

      // Resolve and store the audio Buffer directly — NOT a ttsRequestStore token.
      // This decouples pregen lifetime from TTS_REQUEST_TTL (60s). A fresh
      // ttsRequestStore entry is created only when the client calls GET /resume-token.
      const audioBuffer = await generateTtsAudio(resumeText, undefined, 'quality');
      const generatedAt = Date.now();
      // Guard against out-of-order completion: only store if this job is newer
      // than any currently stored entry (concurrent exchange spam edge case).
      const existing = pregenResumeStore.get(sessionId);
      if (!existing || generatedAt >= existing.createdAt) {
        pregenResumeStore.set(sessionId, { text: resumeText, audioBuffer, createdAt: generatedAt });
      }
      console.log('[Pregen Resume] Ready for session:', sessionId.substring(0, 8), '(', resumeText.length, 'chars,', audioBuffer.byteLength, 'bytes)');
    } catch (err) {
      // Silent — never let background pregen affect the primary chat flow
      console.warn('[Pregen Resume] Background generation failed (silent):', err instanceof Error ? err.message : err);
      // Mirror to PostHog so we can detect chronic background failures in prod.
      const sessionForName = await storage.getSession(sessionId).catch(() => null);
      captureServerError(
        'pregen_resume_background',
        sessionId,
        err,
        { context: 'schedule_pregen_resume' },
        sessionForName?.userName,
      );
    }
  }

  // TASK #30: Consume pre-generated resume token (if ready).
  // Returns { text, audioToken } if a fresh pre-gen exists; 404 if not (client
  // must fall back to POST /resume for on-demand generation).
  app.get('/api/sessions/:id/resume-token', async (req, res) => {
    try {
      const sessionId = req.params.id;
      if (!sessionId) return res.status(400).json({ error: 'Missing sessionId' });

      const session = await verifySessionToken(sessionId, req, res);
      if (!session) return;

      const pregen = pregenResumeStore.get(sessionId);
      if (!pregen || Date.now() - pregen.createdAt > PREGEN_RESUME_TTL) {
        pregenResumeStore.delete(sessionId);
        return res.status(404).json({ error: 'No pre-generated resume available' });
      }

      // Consume: remove so a second call (e.g. page refresh) falls through to POST
      pregenResumeStore.delete(sessionId);

      // Create a fresh ttsRequestStore entry now — 60s clock starts at client request time,
      // not at background generation time, so the token is always valid for the client.
      const audioToken = crypto.randomUUID();
      ttsRequestStore.set(audioToken, {
        promise: Promise.resolve(pregen.audioBuffer),
        createdAt: Date.now(),
        sessionId,
        userName: session.userName,
      });

      console.log('[Pregen Resume] Consumed for session:', sessionId.substring(0, 8), '— token:', audioToken.substring(0, 8));
      return res.json({ text: pregen.text, audioToken });
    } catch (error) {
      console.error('[Pregen Resume Token] Error:', error);
      {
        const sessionForName = await storage.getSession(req.params.id).catch(() => null);
        captureServerError(
          '/api/sessions/:id/resume-token',
          req.params.id,
          error,
          { context: 'pregen_resume_token' },
          sessionForName?.userName,
        );
      }
      return res.status(500).json({ error: 'Failed to retrieve pre-generated resume' });
    }
  });

  // RESUME: Contextual re-entry message for returning users (does not count as an exchange)
  app.post('/api/sessions/:id/resume', async (req, res) => {
    try {
      const sessionId = req.params.id;
      if (!sessionId) {
        return res.status(400).json({ error: 'Missing sessionId' });
      }

      const session = await verifySessionToken(sessionId, req, res);
      if (!session) return;

      const userName = (req.body.userName as string | undefined) || 'toi';

      const allTargetKeywords = TARGET_CLUES.map(c => c.keyword);
      const foundClues = session.foundClues || [];
      const missingClues = allTargetKeywords.filter(k => !foundClues.includes(k));

      console.log('[Resume API] Session:', { sessionId: sessionId.substring(0, 8), foundClues, missingClues });

      // Build the resumption prompt — injected as a user message to leverage thread history
      const foundSummary = foundClues.length > 0
        ? `Il a déjà trouvé ${foundClues.length}/6 indices (${foundClues.join(', ')})`
        : `Il n'a encore trouvé aucun indice`;
      const missingSummary = missingClues.length > 0
        ? `Il lui reste à découvrir : ${missingClues.join(', ')}`
        : `Il a trouvé tous les indices !`;

      const resumePrompt = `[REPRISE DE SESSION — NE PAS COMPTER COMME ÉCHANGE]\n${userName} revient après une courte pause. ${foundSummary}. ${missingSummary}.\nAccueille-le chaleureusement en 1-2 phrases MAXIMUM. Si la conversation a déjà eu lieu, fais-y référence naturellement. Guide-le subtilement vers un des indices manquants. N'utilise PAS la phrase de bienvenue initiale ("Bienvenue dans cette courte expérience…"). Sois bref et naturel.`;

      // Reuse or create the thread
      let threadId = session.threadId;
      if (!threadId) {
        const thread = await openai.beta.threads.create();
        threadId = thread.id;
        await storage.updateSession(sessionId, { threadId });
        console.log('[Resume API] Thread created:', threadId);
      } else {
        console.log('[Resume API] Reusing thread:', threadId);
      }

      // Inject the resumption prompt into the thread
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: resumePrompt,
      });

      // Run the assistant non-streaming (short response — 1-2 sentences)
      const stream = await openai.beta.threads.runs.stream(threadId, {
        assistant_id: ASSISTANT_ID,
      });

      let resumeText = '';
      for await (const event of stream) {
        if (event.event === 'thread.message.delta') {
          const delta = event.data.delta;
          if (delta.content) {
            for (const block of delta.content) {
              if (block.type === 'text') {
                resumeText += block.text?.value || '';
              }
            }
          }
        }
        if (event.event === 'thread.run.failed' ||
            event.event === 'thread.run.cancelled' ||
            event.event === 'thread.run.expired') {
          throw new Error(`Resume run failed: ${event.event}`);
        }
      }

      if (!resumeText) {
        resumeText = missingClues.length > 0
          ? `Bienvenue de retour ! Tu as déjà trouvé ${foundClues.length} indice${foundClues.length !== 1 ? 's' : ''}. Continue à observer l'image — qu'est-ce qui attire ton attention ?`
          : `Bienvenue de retour ! Tu as trouvé tous les indices, tu peux continuer l'expérience.`;
      }

      // Pre-generate TTS audio (same pipeline as welcome message)
      const audioToken = crypto.randomUUID();
      ttsRequestStore.set(audioToken, {
        promise: generateTtsAudio(resumeText, undefined, 'quality'),
        createdAt: Date.now(),
        sessionId,
        userName: session.userName,
      });

      console.log('[Resume API] Resume message generated, TTS token:', audioToken.substring(0, 8));

      return res.json({ text: resumeText, audioToken });
    } catch (error) {
      console.error('[Resume API] Error:', error);
      captureServerError(
        '/api/sessions/:id/resume',
        req.params.id,
        error,
        { context: 'resume_on_demand' },
        (req.body?.userName as string | undefined) ?? null,
      );
      return res.status(500).json({ error: 'Failed to generate resume message' });
    }
  });

  // PHASE 2 OPTIMIZATION: Streaming chat endpoint with sentence-by-sentence delivery
  // This allows TTS to start generating audio while LLM is still responding
  app.post('/api/chat/stream', async (req, res) => {
    try {
      console.log('[Chat Stream API] Request received:', {
        sessionId: req.body.sessionId,
        messageLength: req.body.userMessage?.length,
        exchangeCount: req.body.exchangeCount,
        userName: req.body.userName
      });
      const { sessionId, userMessage, exchangeCount, userName } = req.body;

      if (!sessionId || !userMessage) {
        return res.status(400).json({ error: 'Missing sessionId or userMessage' });
      }

      if (typeof userMessage !== 'string' || userMessage.length > 2000) {
        return res.status(400).json({ error: 'userMessage must be a string of at most 2000 characters' });
      }

      const session = await verifySessionToken(sessionId, req, res);
      if (!session) return;

      console.log('[Chat Stream API] Session found:', { sessionId, foundClues: session.foundClues });

      const detectedClues = detectClues(userMessage, session.foundClues);
      console.log('[Chat Stream API] Clue detection:', { detectedClues, messageLength: userMessage.length });

      await storage.addMessage({
        sessionId,
        role: 'user',
        content: userMessage,
        detectedClue: detectedClues.length > 0 ? detectedClues.join(', ') : undefined,
      });

      // Set up Server-Sent Events
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();

      console.log('[Chat Stream API] Using OpenAI Assistant:', ASSISTANT_ID);

      const userNameToUse = userName || 'mon ami';

      // Compute the current clue state (already found + newly detected from user message)
      const allTargetKeywords = TARGET_CLUES.map(c => c.keyword);
      const combined1 = [...session.foundClues, ...detectedClues];
      const allFoundSoFar = combined1.filter((v, i) => combined1.indexOf(v) === i);
      const missingClues = allTargetKeywords.filter(k => !allFoundSoFar.includes(k));

      // Clue tracking context — injected on EVERY message so Peter always knows the state
      const cluesContext = `[Suivi des indices: ${allFoundSoFar.length}/6 trouvés${allFoundSoFar.length > 0 ? ` (${allFoundSoFar.join(', ')})` : ''} — manquants: ${missingClues.length > 0 ? missingClues.join(', ') : 'aucun, tous trouvés !'}]`;

      // Build exchange-specific instructions
      let exchangeInstructions = '';
      if (missingClues.length === 0) {
        // All 6 clues already found — Peter must celebrate and prompt Poursuivre
        exchangeInstructions = `\n\n[INSTRUCTION IMPORTANTE: Tous les 6 indices ont déjà été trouvés ! Félicite chaleureusement ${userNameToUse} pour avoir trouvé les 6 indices, fais un bref récapitulatif de la liste complète, et invite-le à cliquer sur le bouton "Poursuivre" pour continuer l'expérience.]`;
      } else if (missingClues.length === 1) {
        // One clue left — hint + Poursuivre if validated in this response
        exchangeInstructions = `\n\n[INSTRUCTION: Il ne reste qu'UN seul indice à trouver : "${missingClues[0]}". Guide habilement l'utilisateur vers cet indice. Si tu valides sa découverte dans cette réponse et que tous les 6 sont maintenant trouvés, félicite chaleureusement ${userNameToUse} et invite-le immédiatement à cliquer sur le bouton "Poursuivre" pour continuer l'expérience.]`;
      } else if (exchangeCount === 7) {
        exchangeInstructions = `\n\n[INSTRUCTION IMPORTANTE: C'est l'avant-dernier échange (7/8). Tu dois absolument mentionner qu'il reste encore UN échange possible pour trouver les indices manquants (${missingClues.join(', ')}). Encourage l'utilisateur à faire un dernier effort. Ne dis pas au revoir maintenant.]`;
      } else if (exchangeCount >= 8) {
        exchangeInstructions = `\n\n[INSTRUCTION IMPORTANTE: C'est le DERNIER échange (8/8). Tu dois terminer la conversation de manière chaleureuse. Salue l'utilisateur en utilisant son prénom "${userNameToUse}". Fais un bref récapitulatif des indices trouvés (${allFoundSoFar.join(', ') || 'aucun'}) et des indices manquants (${missingClues.join(', ') || 'aucun'}). Invite-le à cliquer sur le bouton "Poursuivre" pour continuer l'expérience.]`;
      }

      // Reuse or create thread
      let threadId = session.threadId;

      if (!threadId) {
        console.log('[Chat Stream API] Creating new thread for session...');
        const thread = await openai.beta.threads.create();
        threadId = thread.id;

        await storage.updateSession(sessionId, { threadId });
        console.log('[Chat Stream API] Thread created and saved:', threadId);
      }

      // Always inject clue context in every message so Peter tracks the state across all turns
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: `${cluesContext}${exchangeInstructions}\n\n${userMessage}`
      });

      // Stream the assistant response
      console.log('[Chat Stream API] Running assistant with streaming...', { assistantId: ASSISTANT_ID, threadId });

      const stream = await openai.beta.threads.runs.stream(threadId, {
        assistant_id: ASSISTANT_ID,
      });
      console.log('[Chat Stream API] Stream created successfully, starting to process events...');

      // Timeout de sécurité pour détecter les streams bloqués
      let streamTimeout: NodeJS.Timeout | null = setTimeout(() => {
        console.error('[Chat Stream API] ⚠️ TIMEOUT: Stream blocked after 30 seconds');
        captureServerEvent('server_error', sessionId, {
          endpoint: '/api/chat/stream',
          context: 'stream_timeout_30s',
          error_message: 'Assistant stream blocked >30s',
        }, userName);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: 'Response timeout - assistant did not respond in time'
          })}\n\n`);
          res.end();
        }
      }, 30000);

      let fullResponse = "";
      let currentSentence = "";
      let sentenceCount = 0;
      const sentenceTtsPromises: Promise<void>[] = [];

      // ── 2-PHASE TTS STRATEGY ───────────────────────────────────────────────
      // Phase 1 (FAST): first group of sentences sent to ElevenLabs immediately
      //   using eleven_flash_v2_5 + optimize_streaming_latency:4 → first audio ~2-3s
      // Phase 2 (QUALITY): remaining sentences sent as ONE single ElevenLabs call
      //   using eleven_multilingual_v2 + previous_text=phase1 → natural prosody for 70-80% of response
      //
      // Short sentences (< MIN_SENTENCE_CHARS) are grouped with the next one to avoid
      // unnatural micro-segments. Phase 1 fires as soon as the combined buffer reaches
      // MIN_SENTENCE_CHARS, or at stream completion if nothing was long enough.
      // ─────────────────────────────────────────────────────────────────────────
      const MIN_SENTENCE_CHARS = 55;
      const MAX_PHASE1_SENTENCES = 2;  // Prevent Phase 1 from grouping too many short sentences
      // Phase 2 early dispatch thresholds: fire Phase 2a mid-stream to avoid silence gaps
      const PHASE2_EARLY_CHARS = 120;      // dispatch Phase 2a when accumulated text reaches this
      const PHASE2_EARLY_SENTENCES = 3;    // OR when accumulated sentence count reaches this
      let phase1Done = false;
      let phase1Text = "";                        // text sent in Phase 1 (used as previous_text for Phase 2)
      let phase1ShortBuffer: Array<{ text: string; index: number }> = []; // short sentences accumulating before Phase 1 fires
      let phase2Buffer: string[] = [];            // sentences queued for Phase 2a (early dispatch)
      let phase2StartIndex = -1;                  // SSE index of the first Phase 2 sentence
      let phase2Dispatched = false;               // true when any Phase 2 TTS call has been dispatched
      let phase2aDispatched = false;              // true when Phase 2a early TTS has fired
      let phase2aText = "";                       // text sent in Phase 2a (chained as previous_text for Phase 2b)
      let phase2aSentenceCount = 0;               // number of sentences in Phase 2a (for merged count)
      let phase2aResolved = false;                // true when Phase 2a TTS promise resolved successfully
      let phase2aSettled = false;                 // true when Phase 2a TTS promise settled (success or failure)
      let phase2aCancelled = false;               // true when Phase 2a SSE is suppressed for merging with 2b
      let phase2bBuffer: string[] = [];           // sentences accumulating after Phase 2a fires
      let phase2bStartIndex = -1;                 // SSE index of first Phase 2b sentence

      const dispatchPhase1Tts = (sentences: Array<{ text: string; index: number }>) => {
        const combined = sentences.map(s => s.text).join(' ');
        const startIndex = sentences[0].index;
        const count = sentences.length;
        phase1Text = combined;
        phase1Done = true;

        console.log(`[Chat Stream API] Phase 1 TTS: ${count} sentence(s) → "${combined.substring(0, 60)}..." (quality model — uniforme)`);

        // Use 'quality' (eleven_multilingual_v2) for Phase 1 too, to keep a consistent voice
        // across all sentences. The flash model was producing saturated/exaggerated output
        // on sentences ending with "!" (different acoustic profile from multilingual_v2).
        const ttsPromise = generateTtsAudio(combined, undefined, 'quality')
          .then((audioBuffer) => {
            const audioToken = crypto.randomUUID();
            ttsRequestStore.set(audioToken, { promise: Promise.resolve(audioBuffer), createdAt: Date.now(), sessionId, userName });
            console.log(`[Chat Stream API] Phase 1 TTS ready (index=${startIndex}, count=${count}), token:`, audioToken);
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({
                type: 'sentence_audio',
                index: startIndex,
                audioToken,
                count,  // client must skip indices startIndex+1 … startIndex+count-1
                phase: 'phase1',
              })}\n\n`);
            }
          })
          .catch((ttsErr) => {
            console.error('[Chat Stream API] Phase 1 TTS failed:', ttsErr);
            captureServerError('/api/chat/stream', sessionId, ttsErr, { context: 'phase1_tts' }, userName);
            if (!res.writableEnded) {
              for (const s of sentences) {
                res.write(`data: ${JSON.stringify({ type: 'sentence_audio_error', index: s.index })}\n\n`);
              }
            }
          });

        sentenceTtsPromises.push(ttsPromise);
      };

      // Phase 2a: early dispatch mid-stream when buffer threshold is reached.
      // Fires with previous_text=phase1Text so prosody continues naturally from Phase 1.
      const dispatchPhase2aTts = (sentences: string[], startIndex: number, dispatchedMidStream = false) => {
        const combined = sentences.join(' ');
        const count = sentences.length;
        phase2aDispatched = true;
        phase2aText = combined;
        phase2aSentenceCount = count;
        phase2Dispatched = true;

        console.log(`[Chat Stream API] Phase 2a TTS (${dispatchedMidStream ? 'MID-STREAM' : 'AT-COMPLETION'}): ${count} sentence(s) → "${combined.substring(0, 60)}..." (quality model)`);

        // Emit timing metadata immediately so the client can fire a PostHog event
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({
            type: 'phase2a_timing',
            dispatched_mid_stream: dispatchedMidStream,
            chars_at_dispatch: combined.length,
          })}\n\n`);
        }

        const ttsPromise = generateTtsAudio(combined, phase1Text || undefined, 'quality')
          .then((audioBuffer) => {
            phase2aResolved = true;
            phase2aSettled = true;
            if (phase2aCancelled) {
              // Phase 2a was merged with 2b — discard this result silently
              console.log(`[Chat Stream API] Phase 2a TTS resolved but cancelled (merged with 2b) — discarding`);
              return;
            }
            const audioToken = crypto.randomUUID();
            ttsRequestStore.set(audioToken, { promise: Promise.resolve(audioBuffer), createdAt: Date.now(), sessionId, userName });
            console.log(`[Chat Stream API] Phase 2a TTS ready (index=${startIndex}, count=${count}), token:`, audioToken);
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({
                type: 'sentence_audio',
                index: startIndex,
                audioToken,
                count,
                phase: 'phase2',
              })}\n\n`);
            }
          })
          .catch((ttsErr) => {
            phase2aSettled = true;
            console.error('[Chat Stream API] Phase 2a TTS failed:', ttsErr);
            captureServerError('/api/chat/stream', sessionId, ttsErr, { context: 'phase2a_tts' }, userName);
            if (!phase2aCancelled && !res.writableEnded) {
              for (let i = startIndex; i < startIndex + count; i++) {
                res.write(`data: ${JSON.stringify({ type: 'sentence_audio_error', index: i })}\n\n`);
              }
            }
          });

        sentenceTtsPromises.push(ttsPromise);
      };

      // Phase 2b: sentences that arrived after Phase 2a was dispatched.
      // Chains previous_text = phase1Text + phase2aText for full prosody continuity.
      const dispatchPhase2bTts = (sentences: string[], startIndex: number) => {
        const combined = sentences.join(' ');
        const count = sentences.length;
        const prevText = [phase1Text, phase2aText].filter(Boolean).join(' ') || undefined;

        console.log(`[Chat Stream API] Phase 2b TTS: ${count} sentence(s) → "${combined.substring(0, 60)}..." (quality model)`);

        const ttsPromise = generateTtsAudio(combined, prevText, 'quality')
          .then((audioBuffer) => {
            const audioToken = crypto.randomUUID();
            ttsRequestStore.set(audioToken, { promise: Promise.resolve(audioBuffer), createdAt: Date.now(), sessionId, userName });
            console.log(`[Chat Stream API] Phase 2b TTS ready (index=${startIndex}, count=${count}), token:`, audioToken);
            if (!res.writableEnded) {
              res.write(`data: ${JSON.stringify({
                type: 'sentence_audio',
                index: startIndex,
                audioToken,
                count,
                phase: 'phase2',
              })}\n\n`);
            }
          })
          .catch((ttsErr) => {
            console.error('[Chat Stream API] Phase 2b TTS failed:', ttsErr);
            captureServerError('/api/chat/stream', sessionId, ttsErr, { context: 'phase2b_tts' }, userName);
            if (!res.writableEnded) {
              for (let i = startIndex; i < startIndex + count; i++) {
                res.write(`data: ${JSON.stringify({ type: 'sentence_audio_error', index: i })}\n\n`);
              }
            }
          });

        sentenceTtsPromises.push(ttsPromise);
      };

      const sendSentence = (sentence: string) => {
        const trimmed = sentence.trim();
        if (trimmed.length === 0) return;

        sentenceCount++;
        const index = sentenceCount;
        console.log('[Chat Stream API] Sentence #' + index + ' (' + trimmed.length + ' chars):', trimmed.substring(0, 50) + (trimmed.length > 50 ? '...' : ''));

        // Always emit the text SSE event immediately (client display + UI)
        res.write(`data: ${JSON.stringify({ type: 'sentence', text: trimmed, index })}\n\n`);

        if (!phase1Done) {
          // Buffer short sentences; fire Phase 1 as soon as combined length ≥ MIN_SENTENCE_CHARS
          // OR the buffer reaches MAX_PHASE1_SENTENCES (to bound first-audio latency)
          phase1ShortBuffer.push({ text: trimmed, index });
          const combined = phase1ShortBuffer.map(s => s.text).join(' ');

          if (combined.length >= MIN_SENTENCE_CHARS || phase1ShortBuffer.length >= MAX_PHASE1_SENTENCES) {
            dispatchPhase1Tts(phase1ShortBuffer);
            phase1ShortBuffer = [];
          }
          // If still too short and under cap: keep buffering — will be flushed on thread.run.completed
        } else {
          // Phase 2: rolling early dispatch — fire Phase 2a when threshold reached,
          // then accumulate Phase 2b tail for dispatch at thread.run.completed.
          if (!phase2aDispatched) {
            if (phase2Buffer.length === 0) {
              phase2StartIndex = index;
            }
            phase2Buffer.push(trimmed);
            const combined2a = phase2Buffer.join(' ');
            if (combined2a.length >= PHASE2_EARLY_CHARS || phase2Buffer.length >= PHASE2_EARLY_SENTENCES) {
              dispatchPhase2aTts(phase2Buffer, phase2StartIndex, true);
              phase2Buffer = [];
            }
          } else {
            // Phase 2a already fired — accumulate remainder for Phase 2b
            if (phase2bBuffer.length === 0) {
              phase2bStartIndex = index;
            }
            phase2bBuffer.push(trimmed);
          }
        }
      };

      for await (const event of stream) {
        console.log('[Chat Stream API] Event received:', event.event);

        if (event.event === 'thread.message.delta') {
          const delta = event.data.delta;
          if (delta.content && delta.content[0]?.type === 'text') {
            const textDelta = delta.content[0].text?.value || '';
            fullResponse += textDelta;
            currentSentence += textDelta;

            let match;
            while ((match = currentSentence.match(/^([\s\S]*?[.!?])(\s+|$)/)) !== null) {
              sendSentence(match[1]);
              currentSentence = currentSentence.slice(match[0].length);
            }
          }
        }

        if (event.event === 'thread.run.completed') {
          console.log('[Chat Stream API] ✅ Run completed:', { responseLength: fullResponse.length });

          if (streamTimeout) {
            clearTimeout(streamTimeout);
            streamTimeout = null;
          }

          // Flush any remaining text as a final sentence
          if (currentSentence.trim().length > 0) {
            sendSentence(currentSentence);
            currentSentence = "";
          }

          // Flush Phase 1 buffer if it never reached the threshold (entire response was short)
          if (!phase1Done && phase1ShortBuffer.length > 0) {
            dispatchPhase1Tts(phase1ShortBuffer);
            phase1ShortBuffer = [];
          }

          // Flush Phase 2a buffer if early threshold was never reached during streaming
          if (!phase2aDispatched && phase2Buffer.length > 0) {
            dispatchPhase2aTts(phase2Buffer, phase2StartIndex, false);
            phase2Buffer = [];
          }

          // Dispatch Phase 2b for any sentences accumulated after Phase 2a fired.
          // If Phase 2b is very short (< 80 chars) AND Phase 2a hasn't settled yet (success or failure),
          // merge them into a single TTS call to avoid prosodic discontinuity.
          if (phase2bBuffer.length > 0) {
            const phase2bText = phase2bBuffer.join(' ');
            const shouldMerge = phase2bText.length < 80 && phase2aDispatched && !phase2aSettled;
            if (shouldMerge) {
              phase2aCancelled = true;
              const mergedText = [phase2aText, phase2bText].filter(Boolean).join(' ');
              const mergedCount = phase2aSentenceCount + phase2bBuffer.length;
              console.log(`[Chat Stream API] Phase 2a+2b MERGED (2b was ${phase2bText.length} chars, 2a unresolved): "${mergedText.substring(0, 80)}..." (${mergedCount} sentences)`);
              const ttsPromise = generateTtsAudio(mergedText, phase1Text || undefined, 'quality')
                .then((audioBuffer) => {
                  const audioToken = crypto.randomUUID();
                  ttsRequestStore.set(audioToken, { promise: Promise.resolve(audioBuffer), createdAt: Date.now(), sessionId, userName });
                  console.log(`[Chat Stream API] Phase 2a+2b merged TTS ready (index=${phase2StartIndex}, count=${mergedCount}), token:`, audioToken);
                  if (!res.writableEnded) {
                    res.write(`data: ${JSON.stringify({
                      type: 'sentence_audio',
                      index: phase2StartIndex,
                      audioToken,
                      count: mergedCount,
                      phase: 'phase2',
                    })}\n\n`);
                  }
                })
                .catch((ttsErr) => {
                  console.error('[Chat Stream API] Phase 2a+2b merged TTS failed:', ttsErr);
                  captureServerError('/api/chat/stream', sessionId, ttsErr, { context: 'phase2_merged_tts' }, userName);
                  if (!res.writableEnded) {
                    for (let i = phase2StartIndex; i < phase2StartIndex + mergedCount; i++) {
                      res.write(`data: ${JSON.stringify({ type: 'sentence_audio_error', index: i })}\n\n`);
                    }
                  }
                });
              sentenceTtsPromises.push(ttsPromise);
            } else {
              dispatchPhase2bTts(phase2bBuffer, phase2bStartIndex);
            }
          }
        }

        if (event.event === 'thread.run.failed' ||
            event.event === 'thread.run.cancelled' ||
            event.event === 'thread.run.expired') {
          console.error('[Chat Stream API] ❌ Assistant run failed:', event.event);
          captureServerEvent('server_error', sessionId, {
            endpoint: '/api/chat/stream',
            context: 'assistant_run_failed',
            error_message: `Assistant run ${event.event}`,
            run_event: event.event,
          }, userName);

          if (streamTimeout) {
            clearTimeout(streamTimeout);
            streamTimeout = null;
          }

          res.write(`data: ${JSON.stringify({
            type: 'error',
            message: `Assistant run failed: ${event.event}`
          })}\n\n`);
          res.end();
          return;
        }
      }

      // Annuler le timeout à la fin du stream (au cas où)
      if (streamTimeout) {
        clearTimeout(streamTimeout);
        streamTimeout = null;
      }

      // Fallback if response is empty
      if (!fullResponse) {
        fullResponse = "Je n'ai pas compris, peux-tu reformuler?";
        res.write(`data: ${JSON.stringify({
          type: 'sentence',
          text: fullResponse,
          index: 1
        })}\n\n`);
      }

      // Save full response to storage
      await storage.addMessage({
        sessionId,
        role: 'assistant',
        content: fullResponse,
      });

      // Detect clues from Peter's response too (not just from the user's message).
      // Peter often explicitly names a clue when validating it — e.g. "Bravo, tu as trouvé le Traité plastique !"
      // The earlier detectClues(userMessage) only caught words the USER used; this catches what PETER validates.
      const detectedFromResponse = detectClues(fullResponse, [...session.foundClues, ...detectedClues]);
      const allDetectedClues = [...detectedClues, ...detectedFromResponse];
      if (detectedFromResponse.length > 0) {
        console.log('[Chat Stream API] Additional clues detected from Peter\'s response:', detectedFromResponse);
      }

      // Update session with all detected clues (from user message + from Peter's response)
      if (allDetectedClues.length > 0) {
        const updatedClues = [...session.foundClues, ...allDetectedClues];
        await storage.updateSession(sessionId, {
          foundClues: updatedClues,
          score: updatedClues.length,
        });
      }

      // Incrémenter le compteur de messages pour la synchronisation Google Sheets
      await storage.incrementMessageCount(sessionId);
      console.log('[Chat Stream API] Message count incremented for session:', sessionId);

      res.write(`data: ${JSON.stringify({
        type: 'complete',
        fullResponse,
        foundClues: allDetectedClues.length > 0 ? [...session.foundClues, ...allDetectedClues] : session.foundClues,
        detectedClue: allDetectedClues.length > 0 ? allDetectedClues[0] : null,
        phase2Dispatched,
      })}\n\n`);

      if (sentenceTtsPromises.length > 0) {
        console.log('[Chat Stream API] Waiting for', sentenceTtsPromises.length, 'remaining TTS promises...');
        await Promise.allSettled(sentenceTtsPromises);
        console.log('[Chat Stream API] All sentence TTS promises settled');
      }

      res.end();
      console.log('[Chat Stream API] Stream ended successfully');

      // TASK #30: Pre-generate resume message in background so it's ready if the
      // user navigates away and comes back. Fire-and-forget; never blocks the response.
      schedulePregenResume(sessionId).catch(() => { /* already handled inside */ });
    } catch (error) {
      console.error('[Chat Stream API] Error:', error);
      captureServerError(
        '/api/chat/stream',
        (req.body?.sessionId as string | undefined) ?? null,
        error,
        { context: 'stream_outer_catch' },
        (req.body?.userName as string | undefined) ?? null,
      );

      const isProd = process.env.NODE_ENV === 'production';
      const errorMessage = isProd
        ? 'Une erreur est survenue lors de la conversation'
        : (error instanceof Error ? error.message : 'Unknown error');
      res.write(`data: ${JSON.stringify({
        type: 'error',
        message: errorMessage
      })}\n\n`);
      res.end();
    }
  });

  app.post('/api/chat', async (req, res) => {
    try {
      console.log('[Chat API] Request received:', { sessionId: req.body.sessionId, messageLength: req.body.userMessage?.length });
      const { sessionId, userMessage } = req.body;

      if (!sessionId || !userMessage) {
        return res.status(400).json({ error: 'Missing sessionId or userMessage' });
      }

      if (typeof userMessage !== 'string' || userMessage.length > 2000) {
        return res.status(400).json({ error: 'userMessage must be a string of at most 2000 characters' });
      }

      const session = await verifySessionToken(sessionId, req, res);
      if (!session) return;

      console.log('[Chat API] Session found:', { sessionId, foundClues: session.foundClues });

      const detectedClues = detectClues(userMessage, session.foundClues);
      console.log('[Chat API] Clue detection:', { detectedClues, messageLength: userMessage.length });

      await storage.addMessage({
        sessionId,
        role: 'user',
        content: userMessage,
        detectedClue: detectedClues.length > 0 ? detectedClues.join(', ') : undefined,
      });

      // Use OpenAI Assistant API with the specified assistant ID
      const ASSISTANT_ID = 'asst_P9b5PxMd1k9HjBgbyXI1Cvm9';
      console.log('[Chat API] Using OpenAI Assistant:', ASSISTANT_ID);

      // Compute the current clue state for context injection
      const allTargetKeywordsNS = TARGET_CLUES.map(c => c.keyword);
      const combined2 = [...session.foundClues, ...detectedClues];
      const allFoundSoFarNS = combined2.filter((v, i) => combined2.indexOf(v) === i);
      const missingCluesNS = allTargetKeywordsNS.filter(k => !allFoundSoFarNS.includes(k));
      const userNameToUseNS = (req.body.userName as string | undefined) || 'mon ami';

      const cluesContextNS = `[Suivi des indices: ${allFoundSoFarNS.length}/6 trouvés${allFoundSoFarNS.length > 0 ? ` (${allFoundSoFarNS.join(', ')})` : ''} — manquants: ${missingCluesNS.length > 0 ? missingCluesNS.join(', ') : 'aucun, tous trouvés !'}]`;

      let nsInstructions = '';
      if (missingCluesNS.length === 0) {
        nsInstructions = `\n\n[INSTRUCTION IMPORTANTE: Tous les 6 indices ont été trouvés ! Félicite chaleureusement ${userNameToUseNS}, fais un récapitulatif de la liste complète, et invite-le à cliquer sur "Poursuivre".]`;
      } else if (missingCluesNS.length === 1) {
        nsInstructions = `\n\n[INSTRUCTION: Il ne reste qu'UN seul indice : "${missingCluesNS[0]}". Si tu le valides dans cette réponse, félicite ${userNameToUseNS} et invite-le à cliquer sur "Poursuivre".]`;
      }

      // Réutiliser le thread existant ou en créer un nouveau
      let threadId = session.threadId;

      if (!threadId) {
        console.log('[Chat API] Creating new thread for session...');
        const thread = await openai.beta.threads.create();
        threadId = thread.id;
        await storage.updateSession(sessionId, { threadId });
        console.log('[Chat API] Thread created and saved:', threadId);
      } else {
        console.log('[Chat API] Reusing existing thread:', threadId);
      }

      // Always inject clue context so Peter tracks state on every turn
      await openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: `${cluesContextNS}${nsInstructions}\n\n${userMessage}`
      });

      // Run the assistant avec streaming pour meilleure réactivité
      console.log('[Chat API] Running assistant with streaming...', { assistantId: ASSISTANT_ID, threadId });

      // Créer le run avec streaming
      const stream = await openai.beta.threads.runs.stream(threadId, {
        assistant_id: ASSISTANT_ID,
      });

      console.log('[Chat API] Stream created, waiting for response...');

      let assistantResponse = "";
      let runId = "";

      // Écouter les événements du stream
      for await (const event of stream) {
        // Capturer le run ID
        if (event.event === 'thread.run.created') {
          runId = event.data.id;
          console.log('[Chat API] Run created:', runId);
        }

        // Capturer les deltas de texte au fur et à mesure
        if (event.event === 'thread.message.delta') {
          const delta = event.data.delta;
          if (delta.content && delta.content[0]?.type === 'text') {
            const textDelta = delta.content[0].text?.value || '';
            assistantResponse += textDelta;
          }
        }

        // Vérifier la complétion
        if (event.event === 'thread.run.completed') {
          console.log('[Chat API] Run completed via stream:', {
            runId,
            threadId,
            responseLength: assistantResponse.length
          });
        }

        // Gérer les erreurs
        if (event.event === 'thread.run.failed' ||
            event.event === 'thread.run.cancelled' ||
            event.event === 'thread.run.expired') {
          const errorDetails = {
            event: event.event,
            runId,
            threadId,
            assistantId: ASSISTANT_ID,
          };
          console.error('[Chat API] Assistant run failed via stream:', errorDetails);
          captureServerEvent('server_error', sessionId, {
            endpoint: '/api/chat',
            context: 'assistant_run_failed',
            error_message: `Assistant run ${event.event}`,
            run_event: event.event,
            run_id: runId,
          }, session?.userName);
          throw new Error(`Assistant run failed - Event: ${event.event}, Run ID: ${runId}, Thread ID: ${threadId}`);
        }
      }

      // Fallback si la réponse est vide
      if (!assistantResponse) {
        assistantResponse = "Je n'ai pas compris, peux-tu reformuler?";
      }

      console.log('[Chat API] Final assistant response:', {
        responseLength: assistantResponse.length,
        runId,
        threadId
      });

      await storage.addMessage({
        sessionId,
        role: 'assistant',
        content: assistantResponse,
      });

      // Detect clues from Peter's response too (not just from the user's message)
      const detectedFromResponse = detectClues(assistantResponse, [...session.foundClues, ...detectedClues]);
      const allDetectedClues = [...detectedClues, ...detectedFromResponse];
      if (detectedFromResponse.length > 0) {
        console.log('[Chat API] Additional clues detected from Peter\'s response:', detectedFromResponse);
      }

      // Update session with ALL detected clues (from user message + from Peter's response)
      if (allDetectedClues.length > 0) {
        const updatedClues = [...session.foundClues, ...allDetectedClues];
        await storage.updateSession(sessionId, {
          foundClues: updatedClues,
          score: updatedClues.length,
        });
      }

      // Incrémenter le compteur de messages pour la synchronisation Google Sheets
      await storage.incrementMessageCount(sessionId);
      console.log('[Chat API] Message count incremented for session:', sessionId);

      console.log('[Chat API] Sending response to client');
      res.json({
        response: assistantResponse,
        detectedClue: allDetectedClues.length > 0 ? allDetectedClues[0] : null,
        foundClues: allDetectedClues.length > 0 ? [...session.foundClues, ...allDetectedClues] : session.foundClues,
      });
    } catch (error) {
      console.error('[Chat API] Error in chat:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        name: error instanceof Error ? error.name : undefined,
        sessionId: req.body.sessionId,
      });
      {
        const sid = (req.body?.sessionId as string | undefined) ?? null;
        const sessionForName = sid ? await storage.getSession(sid).catch(() => null) : null;
        captureServerError(
          '/api/chat',
          sid,
          error,
          { context: 'chat_outer_catch' },
          sessionForName?.userName,
        );
      }

      const isProd = process.env.NODE_ENV === 'production';
      res.status(500).json({
        error: 'Erreur lors de la conversation avec Peter',
        ...(isProd ? {} : {
          details: error instanceof Error ? error.message : 'Unknown error',
          technicalInfo: {
            errorType: error instanceof Error ? error.name : 'UnknownError',
            sessionId: req.body.sessionId,
            timestamp: new Date().toISOString()
          }
        })
      });
    }
  });

  // =============== SYNTHESES ENDPOINTS ===============

  // POST /api/sessions/:id/synthesis - Enregistrer la phrase de synthèse finale
  app.post('/api/sessions/:id/synthesis', async (req, res) => {
    try {
      const { id } = req.params;

      const verified = await verifySessionToken(id, req, res);
      if (!verified) return;

      const { finalSynthesis } = req.body;

      if (!finalSynthesis || typeof finalSynthesis !== 'string') {
        return res.status(400).json({ error: 'finalSynthesis is required' });
      }

      const session = await storage.updateSession(id, {
        finalSynthesis,
        completedAt: new Date(),
        completed: 1,
      });

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      console.log('[Synthesis API] Synthesis saved for session:', id);
      res.json(sanitizeSession(session));
    } catch (error) {
      console.error('[Synthesis API] Error saving synthesis:', error);
      res.status(500).json({ error: 'Failed to save synthesis' });
    }
  });

  // GET /api/syntheses - Lister toutes les synthèses (page finale)
  app.get('/api/syntheses', async (req, res) => {
    try {
      const sort = (req.query.sort as 'recent' | 'upvotes') || 'recent';
      const limit = parseInt(req.query.limit as string) || 50;

      const syntheses = await storage.getCompletedSessions({
        sort,
        limit: Math.min(limit, 100), // Max 100
      });

      // Filter to only return sessions with finalSynthesis, strip access tokens
      const withSynthesis = syntheses
        .filter(s => s.finalSynthesis)
        .map(sanitizeSession);

      console.log('[Syntheses API] Returning', withSynthesis.length, 'syntheses');
      res.json(withSynthesis);
    } catch (error) {
      console.error('[Syntheses API] Error fetching syntheses:', error);
      res.status(500).json({ error: 'Failed to fetch syntheses' });
    }
  });

  // POST /api/syntheses/:id/upvote - Ajouter un upvote à une synthèse
  app.post('/api/syntheses/:id/upvote', async (req, res) => {
    try {
      const { id } = req.params;

      const session = await storage.incrementUpvote(id);

      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      console.log('[Upvote API] Upvote added for session:', id, 'Total:', session.upvotes);
      res.json({ upvotes: session.upvotes });
    } catch (error) {
      console.error('[Upvote API] Error adding upvote:', error);
      res.status(500).json({ error: 'Failed to add upvote' });
    }
  });

  // GET /api/sessions/:id/stats - Stats de la session
  app.get('/api/sessions/:id/stats', async (req, res) => {
    try {
      const session = await verifySessionToken(req.params.id, req, res);
      if (!session) return;

      res.json({
        messageCount: session.messageCount,
        foundClues: session.foundClues,
        clueCount: session.foundClues.length,
        score: session.score,
        completed: session.completed === 1,
        finalSynthesis: session.finalSynthesis,
        upvotes: session.upvotes,
      });
    } catch (error) {
      console.error('[Stats API] Error fetching stats:', error);
      res.status(500).json({ error: 'Failed to fetch stats' });
    }
  });

  const httpServer = createServer(app);
  attachDeepgramRelay(httpServer);
  return httpServer;
}
