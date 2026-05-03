import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { ArrowLeft, RefreshCw, AlertCircle } from "lucide-react";

const TOKEN_STORAGE_KEY = "adminToken";
const REFRESH_INTERVAL_MS = 30_000;

interface PoolStats {
  origins: number;
  connected: number;
  free: number;
  pending: number;
  queued: number;
  running: number;
  size: number;
  byOrigin: Record<string, {
    connected: number;
    free: number;
    pending: number;
    queued: number;
    running: number;
    size: number;
  }>;
}

interface SnapshotResponse {
  timestamp: number;
  stats: PoolStats;
}

interface HistorySample extends PoolStats {
  timestamp: number;
}

interface HistoryResponse {
  capacity: number;
  count: number;
  intervalMs: number;
  samples: HistorySample[];
}

async function fetchAdmin<T>(url: string, token: string): Promise<T> {
  const res = await fetch(url, { headers: { "x-admin-token": token } });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function StatBlock({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold tabular-nums" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}

function Sparkline({ values, width = 240, height = 40 }: { values: number[]; width?: number; height?: number }) {
  if (values.length === 0) {
    return <div className="text-xs text-muted-foreground">No samples yet</div>;
  }
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const points = values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - ((v - min) / span) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={width} height={height} className="text-primary" aria-hidden="true">
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        points={points}
      />
    </svg>
  );
}

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString();
}

export default function AdminConnections() {
  const [token, setToken] = useState<string>(() => {
    try { return localStorage.getItem(TOKEN_STORAGE_KEY) || ""; } catch { return ""; }
  });
  const [tokenInput, setTokenInput] = useState<string>(token);
  const [snapshot, setSnapshot] = useState<SnapshotResponse | null>(null);
  const [history, setHistory] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastFetched, setLastFetched] = useState<number | null>(null);

  const refresh = async (currentToken: string) => {
    if (!currentToken) return;
    setLoading(true);
    // Fetch snapshot + history independently so a history failure does not
    // hide the (more important) live snapshot.
    const [snapResult, histResult] = await Promise.allSettled([
      fetchAdmin<SnapshotResponse>("/api/health/connections", currentToken),
      fetchAdmin<HistoryResponse>("/api/health/connections/history", currentToken),
    ]);

    let snapshotErr: string | null = null;
    if (snapResult.status === "fulfilled") {
      setSnapshot(snapResult.value);
    } else {
      snapshotErr = snapResult.reason instanceof Error ? snapResult.reason.message : String(snapResult.reason);
    }
    if (histResult.status === "fulfilled") {
      setHistory(histResult.value);
    } else {
      // History is non-critical; keep last successful history (if any) but log.
      console.warn("[AdminConnections] history fetch failed:", histResult.reason);
    }
    setError(snapshotErr);
    setLastFetched(Date.now());
    setLoading(false);
  };

  useEffect(() => {
    if (!token) return;
    void refresh(token);
    const id = window.setInterval(() => void refresh(token), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [token]);

  const series = useMemo(() => {
    const samples = history?.samples || [];
    return {
      connected: samples.map((s) => s.connected),
      pending: samples.map((s) => s.pending),
      running: samples.map((s) => s.running),
      queued: samples.map((s) => s.queued),
    };
  }, [history]);

  const handleSaveToken = () => {
    const t = tokenInput.trim();
    try { localStorage.setItem(TOKEN_STORAGE_KEY, t); } catch { /* ignore */ }
    setToken(t);
  };

  const handleClearToken = () => {
    try { localStorage.removeItem(TOKEN_STORAGE_KEY); } catch { /* ignore */ }
    setToken("");
    setTokenInput("");
    setSnapshot(null);
    setHistory(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Link href="/">
            <Button variant="ghost" size="sm" data-testid="link-back-home">
              <ArrowLeft className="mr-1 h-4 w-4" />
              Home
            </Button>
          </Link>
          <h1 className="text-xl font-semibold" data-testid="text-page-title">
            Connection pool health
          </h1>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh(token)}
            disabled={!token || loading}
            data-testid="button-refresh"
          >
            <RefreshCw className={`mr-1 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Admin token</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              type="password"
              placeholder="x-admin-token value"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
              data-testid="input-admin-token"
            />
            <div className="flex gap-2">
              <Button onClick={handleSaveToken} data-testid="button-save-token">
                Save
              </Button>
              {token && (
                <Button variant="outline" onClick={handleClearToken} data-testid="button-clear-token">
                  Clear
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        {!token && (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground" data-testid="text-no-token">
              Enter the admin token to load connection pool stats.
            </CardContent>
          </Card>
        )}

        {error && (
          <Card>
            <CardContent className="flex items-start gap-2 py-4 text-sm text-destructive" data-testid="text-error">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </CardContent>
          </Card>
        )}

        {token && !snapshot && !error && (
          <Card>
            <CardContent className="py-6">
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        )}

        {snapshot && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
              <CardTitle className="text-base">Current snapshot</CardTitle>
              <Badge variant="secondary" data-testid="badge-last-fetched">
                {lastFetched ? formatTime(lastFetched) : "—"}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <StatBlock label="Connected sockets" value={snapshot.stats.connected} testId="stat-connected" />
                <StatBlock label="Free sockets" value={snapshot.stats.free} testId="stat-free" />
                <StatBlock label="Running requests" value={snapshot.stats.running} testId="stat-running" />
                <StatBlock label="Pending requests" value={snapshot.stats.pending} testId="stat-pending" />
                <StatBlock label="Queued requests" value={snapshot.stats.queued} testId="stat-queued" />
                <StatBlock label="Pools (origins)" value={snapshot.stats.origins} testId="stat-origins" />
              </div>

              {Object.keys(snapshot.stats.byOrigin).length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">Per origin</div>
                  <div className="space-y-1">
                    {Object.entries(snapshot.stats.byOrigin).map(([origin, s]) => (
                      <div
                        key={origin}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs"
                        data-testid={`row-origin-${origin}`}
                      >
                        <span className="font-mono">{origin}</span>
                        <span className="tabular-nums text-muted-foreground">
                          connected {s.connected} · free {s.free} · running {s.running} · pending {s.pending} · queued {s.queued}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {history && history.samples.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                History ({history.count}/{history.capacity} samples · ~{Math.round(history.intervalMs / 1000)}s)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {([
                { key: "connected", label: "Connected sockets" },
                { key: "running", label: "Running requests" },
                { key: "pending", label: "Pending requests" },
                { key: "queued", label: "Queued requests" },
              ] as const).map(({ key, label }) => {
                const values = series[key];
                const last = values[values.length - 1] ?? 0;
                const peak = values.length ? Math.max(...values) : 0;
                return (
                  <div
                    key={key}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
                    data-testid={`history-${key}`}
                  >
                    <div className="min-w-[8rem]">
                      <div className="text-xs text-muted-foreground">{label}</div>
                      <div className="text-sm tabular-nums">
                        now <span className="font-semibold">{last}</span> · peak {peak}
                      </div>
                    </div>
                    <Sparkline values={values} />
                  </div>
                );
              })}
              <div className="text-xs text-muted-foreground">
                Window: {formatTime(history.samples[0].timestamp)} →{" "}
                {formatTime(history.samples[history.samples.length - 1].timestamp)}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
