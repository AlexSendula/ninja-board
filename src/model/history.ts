// The session's undo history, with no Obsidian in it. A step is what one user action wrote; undo pops the newest step and
// hands its writes to the caller's restore. Writes and undos run one after another, in the order they were made, so an
// undo never runs before a write that came before it.

/** A step's name: fixed, or worked out from what the action wrote (for a label that depends on the before-state). */
export type StepLabel<W> = string | ((writes: readonly W[]) => string);

export interface Step<W> {
  readonly label: string;
  readonly writes: readonly W[];
}

/** 'none': nothing to undo; 'undone': the newest step was put back; 'changed': it could not be, and it has left the history. */
export type UndoResult = 'none' | 'undone' | 'changed';

interface Batch<W> {
  label: string;
  writes: W[];
}

export class History<W> {
  private readonly steps: Step<W>[] = [];
  private readonly listeners = new Set<() => void>();
  private queue: Promise<unknown> = Promise.resolve();
  private batch: Batch<W> | undefined;   // the group being collected: the acts it makes join it

  /** What undo would undo, by name: the newest step's label. undefined when there is nothing to undo. */
  label(): string | undefined {
    return this.steps.at(-1)?.label;
  }

  /** Calls `listener` after a step is recorded or undone. Returns the function that stops it. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * One user action: `run` makes its writes into the array it is given, and they are one step. Inside a group they
   * join the group's step instead. The step is kept even when `run` throws, with what it wrote before the throw.
   */
  act<T>(label: StepLabel<W>, run: (writes: W[]) => Promise<T>): Promise<T> {
    const batch = this.batch;
    if (batch) return this.enqueue(() => run(batch.writes));
    const writes: W[] = [];
    return this.enqueue(async () => {
      try {
        return await run(writes);
      } finally {
        this.commit(label, writes);
      }
    });
  }

  /**
   * One user action made of several: the acts and records made while `run` runs (until the promise it returns settles,
   * if it returns one) are one step, named `label`. Groups do not nest: an inner group joins the outer one.
   */
  group(label: string, run: () => void | Promise<void>): Promise<void> {
    if (this.batch) return Promise.resolve(run());
    const batch: Batch<W> = { label, writes: [] };
    this.batch = batch;
    const close = (): void => {
      if (this.batch === batch) this.batch = undefined;
      void this.enqueue(async () => this.commit(label, batch.writes));
    };
    let settled: void | Promise<void>;
    try {
      settled = run();
    } catch (error) {
      close();
      return Promise.reject(error);
    }
    if (settled instanceof Promise) return settled.finally(close);
    close();
    return Promise.resolve();
  }

  /** A write made at once, not queued (a view's saved layout): it joins the open group, or is a step of its own. */
  record(label: string, write: W): void {
    const batch = this.batch;
    if (batch) {
      batch.writes.push(write);
      return;
    }
    const writes = [write];
    void this.enqueue(async () => this.commit(label, writes));
  }

  /**
   * Undoes the newest step: `restore` gets its writes, newest first, and says whether they could all be put back (false:
   * something changed since). The step leaves the history either way, and one press undoes one step.
   */
  undo(restore: (writes: readonly W[]) => Promise<boolean>): Promise<UndoResult> {
    return this.enqueue(async () => {
      const step = this.steps.pop();
      if (!step) return 'none';
      this.changed();
      let restored: boolean;
      try {
        restored = await restore(step.writes);
      } catch {
        restored = false;
      }
      this.changed();
      return restored ? 'undone' : 'changed';
    });
  }

  /** Empties the history. */
  clear(): void {
    this.steps.length = 0;
    this.changed();
  }

  private commit(label: StepLabel<W>, writes: W[]): void {
    if (writes.length === 0) return;
    this.steps.push({ label: typeof label === 'string' ? label : label(writes), writes });
    this.changed();
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }
}
