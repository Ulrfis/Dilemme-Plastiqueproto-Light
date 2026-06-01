export type QueuePriority = 'foreground' | 'background';

export interface QueueStats {
  active: number;
  queued: number;
  queuedForeground: number;
  queuedBackground: number;
  maxConcurrent: number;
  maxQueued: number;
  droppedBackground: number;
  rejected: number;
}

interface QueueOptions {
  maxConcurrent: number;
  maxQueued: number;
}

interface RunOptions {
  priority?: QueuePriority;
  dropIfBusy?: boolean;
}

interface PendingTask<T> {
  task: () => Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: unknown) => void;
}

export class QueueOverloadedError extends Error {
  constructor(message = 'Service queue is full') {
    super(message);
    this.name = 'QueueOverloadedError';
  }
}

export class BoundedPriorityQueue {
  private readonly options: QueueOptions;
  private active = 0;
  private readonly foreground: PendingTask<unknown>[] = [];
  private readonly background: PendingTask<unknown>[] = [];
  private droppedBackground = 0;
  private rejected = 0;

  constructor(options: QueueOptions) {
    if (options.maxConcurrent < 1 || options.maxQueued < 0) {
      throw new Error('Queue limits must be positive');
    }
    this.options = options;
  }

  run<T>(task: () => Promise<T>, options: RunOptions = {}): Promise<T> {
    const priority = options.priority ?? 'foreground';
    if (priority === 'background' && options.dropIfBusy && (this.active > 0 || this.queued > 0)) {
      this.droppedBackground += 1;
      return Promise.reject(new QueueOverloadedError('Optional background work skipped while service is busy'));
    }

    if (this.active < this.options.maxConcurrent) {
      return this.start(task);
    }

    if (this.queued >= this.options.maxQueued) {
      if (priority === 'background') this.droppedBackground += 1;
      else this.rejected += 1;
      return Promise.reject(new QueueOverloadedError());
    }

    return new Promise<T>((resolve, reject) => {
      const pending: PendingTask<T> = { task, resolve, reject };
      if (priority === 'foreground') {
        this.foreground.push(pending as PendingTask<unknown>);
      } else {
        this.background.push(pending as PendingTask<unknown>);
      }
    });
  }

  getStats(): QueueStats {
    return {
      active: this.active,
      queued: this.queued,
      queuedForeground: this.foreground.length,
      queuedBackground: this.background.length,
      maxConcurrent: this.options.maxConcurrent,
      maxQueued: this.options.maxQueued,
      droppedBackground: this.droppedBackground,
      rejected: this.rejected,
    };
  }

  private get queued(): number {
    return this.foreground.length + this.background.length;
  }

  private start<T>(task: () => Promise<T>): Promise<T> {
    this.active += 1;
    return task().finally(() => {
      this.active -= 1;
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.options.maxConcurrent) {
      const pending = this.foreground.shift() ?? this.background.shift();
      if (!pending) return;
      this.start(pending.task).then(pending.resolve, pending.reject);
    }
  }
}
