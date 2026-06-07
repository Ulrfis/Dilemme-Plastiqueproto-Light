export class ChatTurnConflictError extends Error {
  constructor(message = "A turn is already active for this session") {
    super(message);
    this.name = "ChatTurnConflictError";
  }
}

export class ChatAdmissionTimeoutError extends Error {
  constructor(message = "Timed out waiting for an OpenAI chat slot") {
    super(message);
    this.name = "ChatAdmissionTimeoutError";
  }
}

interface WaitingTurn {
  sessionId: string;
  turnId: string;
  resolve: (lease: ChatTurnLease) => void;
  reject: (reason: unknown) => void;
  timeout: NodeJS.Timeout;
  enqueuedAt: number;
}

export interface ChatTurnStats {
  active: number;
  queued: number;
  maxConcurrent: number;
  maxQueued: number;
  rejectedConflicts: number;
  rejectedCapacity: number;
  timedOut: number;
  cancelled: number;
  oldestActiveMs: number;
  oldestQueuedMs: number;
}

export interface ChatTurnLease {
  sessionId: string;
  turnId: string;
  startedAt: number;
  isCurrent(): boolean;
  cancel(): void;
  release(): void;
}

export class ChatTurnController {
  private readonly maxConcurrent: number;
  private readonly maxQueued: number;
  private readonly waitTimeoutMs: number;
  private readonly active = new Map<string, { turnId: string; startedAt: number; cancelled: boolean }>();
  private readonly waiting: WaitingTurn[] = [];
  private rejectedConflicts = 0;
  private rejectedCapacity = 0;
  private timedOut = 0;
  private cancelled = 0;

  constructor(maxConcurrent: number, maxQueued: number, waitTimeoutMs: number) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueued = maxQueued;
    this.waitTimeoutMs = waitTimeoutMs;
  }

  acquire(sessionId: string, turnId: string): Promise<ChatTurnLease> {
    if (this.active.has(sessionId) || this.waiting.some((item) => item.sessionId === sessionId)) {
      this.rejectedConflicts += 1;
      return Promise.reject(new ChatTurnConflictError());
    }

    if (this.active.size < this.maxConcurrent) {
      return Promise.resolve(this.start(sessionId, turnId));
    }

    if (this.waiting.length >= this.maxQueued) {
      this.rejectedCapacity += 1;
      return Promise.reject(new ChatAdmissionTimeoutError("OpenAI chat queue is full"));
    }

    return new Promise<ChatTurnLease>((resolve, reject) => {
      const waitingTurn: WaitingTurn = {
        sessionId,
        turnId,
        resolve,
        reject,
        enqueuedAt: Date.now(),
        timeout: setTimeout(() => {
          const index = this.waiting.indexOf(waitingTurn);
          if (index >= 0) this.waiting.splice(index, 1);
          this.timedOut += 1;
          reject(new ChatAdmissionTimeoutError());
        }, this.waitTimeoutMs),
      };
      this.waiting.push(waitingTurn);
    });
  }

  getStats(): ChatTurnStats {
    const now = Date.now();
    const activeStarted = [...this.active.values()].map((item) => item.startedAt);
    return {
      active: this.active.size,
      queued: this.waiting.length,
      maxConcurrent: this.maxConcurrent,
      maxQueued: this.maxQueued,
      rejectedConflicts: this.rejectedConflicts,
      rejectedCapacity: this.rejectedCapacity,
      timedOut: this.timedOut,
      cancelled: this.cancelled,
      oldestActiveMs: activeStarted.length > 0 ? now - Math.min(...activeStarted) : 0,
      oldestQueuedMs: this.waiting.length > 0 ? now - this.waiting[0].enqueuedAt : 0,
    };
  }

  private start(sessionId: string, turnId: string): ChatTurnLease {
    const state = { turnId, startedAt: Date.now(), cancelled: false };
    this.active.set(sessionId, state);
    let released = false;

    return {
      sessionId,
      turnId,
      startedAt: state.startedAt,
      isCurrent: () => this.active.get(sessionId) === state && !state.cancelled,
      cancel: () => {
        if (state.cancelled) return;
        state.cancelled = true;
        this.cancelled += 1;
      },
      release: () => {
        if (released) return;
        released = true;
        if (this.active.get(sessionId) === state) this.active.delete(sessionId);
        this.drain();
      },
    };
  }

  private drain(): void {
    while (this.active.size < this.maxConcurrent) {
      const next = this.waiting.shift();
      if (!next) return;
      clearTimeout(next.timeout);
      next.resolve(this.start(next.sessionId, next.turnId));
    }
  }
}
