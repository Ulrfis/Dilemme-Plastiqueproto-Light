# PostHog Dashboards

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

### How the data flows

The frontend captures these events in `client/src/components/TutorialScreen.tsx` via the `captureEvent` wrapper in `client/src/App.tsx`. Every event includes:
- `latency_ms` — milliseconds from user action to the milestone
- `pipeline` — `"streaming"` or `"non-streaming"` (or similar value set at capture time)

### Updating or recreating

The dashboard was created programmatically via the PostHog API using the script at `/tmp/create_posthog_v3.js` (run during the task-21 session). To recreate or extend it:

1. Ensure `POSTHOG_PERSONAL_API_KEY` secret is set in Replit.
2. Adapt the script to add/modify insights and re-run with `node`.
3. The PostHog project is on the EU host: `https://eu.posthog.com` (project 107669).
