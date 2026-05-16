# PostHog Dashboards

Project: **107669** (EU) — https://eu.posthog.com/project/107669

## Pipeline Latency Comparison

**Dashboard ID:** 656626  
**URL:** https://eu.posthog.com/project/107669/dashboard/656626  
**Created:** 2026-05-02  
**Purpose:** Compare streaming vs non-streaming pipeline latency at a glance.

### What it shows

Six insights, each breaking down `latency_ms` by the `pipeline` event property:

| Insight ID | Event | Percentile |
|------------|-------|------------|
| 4047049 | `audio_playback_started` | p50 (median) |
| 4047050 | `audio_playback_started` | p95 |
| 4047051 | `tts_phase1_ready` | p50 (median) |
| 4047052 | `tts_phase1_ready` | p95 |
| 4047053 | `tts_phase2_ready` | p50 (median) |
| 4047054 | `tts_phase2_ready` | p95 |

---

## Dilemme — Engagement & Reliability

**Dashboard ID:** 657175  
**URL:** https://eu.posthog.com/project/107669/dashboard/657175  
**Purpose:** Product KPIs — voice latency, fallbacks, clue funnel, errors.

---

## Dilemme — Latence E2E (à créer dans l’UI PostHog)

Create manually in PostHog → **Dashboards → New dashboard** named **"Dilemme — Latence E2E"**.

**Global filter (all insights):**  
`properties.$host` does not contain `localhost`

### Recommended insights

| Title | Type | Event / query |
|-------|------|----------------|
| Voice waterfall p50 | Trends | `voice_turn_complete` — median of `stt_latency_ms`, `llm_latency_ms`, `tts_phase1_latency_ms`, `first_audio_ms` |
| Server Phase 1 TTS p50/p95 | Trends | `server_pipeline_timing` where `step = elevenlabs_phase1` — median/p95 `duration_ms` |
| OpenAI first delta p50 | Trends | `server_pipeline_timing` where `step = openai_first_delta` |
| Chat stream total p95 | Trends | `server_pipeline_timing` where `step = chat_stream_total` — p95 `duration_ms` |
| Deepgram first interim p50 | Trends | `deepgram_first_interim` — median `latency_ms` |
| Whisper STT p50 | Trends | `whisper_stt_complete` or server `whisper_stt` — median `duration_ms` |
| Parcours funnel | Funnel | `title_screen_started` → `user_session_started` → `tutorial_completed` → `game_completed` → `synthesis_submitted` |
| Temps par écran | Trends | `flow_step_left` — median `duration_ms` breakdown by `step` |
| API errors by service | Trends | `api_error` count breakdown `service` |

### HogQL examples

```sql
-- p95 first audio (production, last 7 days)
SELECT quantile(0.95)(properties.first_audio_ms)
FROM events
WHERE event = 'voice_turn_complete'
  AND properties.first_audio_ms IS NOT NULL
  AND properties.$host NOT ILIKE '%localhost%'
  AND timestamp > now() - INTERVAL 7 DAY
```

```sql
-- Server vs client Phase 1 (median)
SELECT
  properties.step,
  quantile(0.5)(properties.duration_ms) AS p50_ms
FROM events
WHERE event = 'server_pipeline_timing'
  AND properties.step IN ('elevenlabs_phase1', 'openai_first_delta')
  AND timestamp > now() - INTERVAL 7 DAY
GROUP BY properties.step
```

---

## New events (2026-05-16 instrumentation)

### Client

| Event | Key properties |
|-------|----------------|
| `flow_step_viewed` | `step`, `from_step?`, `initial?` |
| `flow_step_left` | `step`, `duration_ms`, `next_step?` |
| `deepgram_ws_connected` | `connect_ms` |
| `deepgram_first_interim` | `latency_ms` |
| `deepgram_session` | `duration_ms`, `had_first_interim` |
| `whisper_stt_complete` | `duration_ms`, `audio_bytes`, `transcript_chars` |
| `whisper_correction_delta` | `deepgram_chars`, `whisper_chars`, `texts_match` |

### Server (`source: server`)

| Event | Key properties |
|-------|----------------|
| `server_pipeline_timing` | `step`, `duration_ms`, `success`, `exchange_index?`, `chars?` |

**Steps:** `whisper_stt`, `welcome_pregen_tts`, `resume_pregen_total`, `openai_first_delta`, `openai_first_sentence`, `openai_run_complete`, `elevenlabs_phase1`, `elevenlabs_phase2a`, `elevenlabs_phase2b`, `elevenlabs_phase2_merged`, `chat_stream_total`

---

## PostHog project settings (manual)

1. **Session replay** — enabled via snippet; confirm sampling in Project Settings.
2. **Exception autocapture** — ON (complements `js_error` + `captureException`).
3. **Web vitals** — ON (`capture_performance: true` in snippet).
4. **Event definitions** — mark key events as verified; document `latency_ms` / `duration_ms` properties.
5. **Alerts** — e.g. `api_error` spike, p95 `first_audio_ms` > 10s, mic denial rate > 20%.

---

## Replit secrets

| Secret | Required for |
|--------|----------------|
| `POSTHOG_API_KEY` | Server-side `posthog-node` (`server/posthog.ts`) |
| `POSTHOG_PERSONAL_API_KEY` | Optional — API dashboard scripts |

Client ingest key remains in `client/index.html` (unchanged for Replit static build).

---

## Data flow

```
Client captureEvent() → eu.i.posthog.com
Server captureServerTiming() → eu.i.posthog.com (distinctId = session_id)
Session replay + autocapture → linked by PostHog session
```

Frontend latency milestones: `client/src/components/TutorialScreen.tsx`  
Wrapper: `client/src/App.tsx` (`captureEvent`, `flow_step_*`, flush on `pagehide`)
