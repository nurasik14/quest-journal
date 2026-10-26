/**
 * In-memory job queue (architecture.md §2.3/§2.5/§2.6, architect-AC10).
 * - One job runs at a time (concurrency 1: respects Max rate limits, keeps the order predictable).
 * - Interactive kinds (`generate_day`, `reroll`) are dequeued before background kinds (`generate_boss`).
 * - A running background job is *preempted* when an interactive job arrives: its AbortSignal fires (the AI
 *   runner kills its child), and it goes back to the queue. At most `MAX_PREEMPTIONS` times, then it runs out.
 * - Same key while queued/running → the existing job (dedupe). Finished jobs are GC'd after an hour.
 * Jobs live in memory only; after a restart `/api/today` exposes `needs_generation`.
 */
import { randomUUID } from "node:crypto";
import type { Job, JobKind } from "./api-types";

export interface JobOutcome {
  source?: "ai" | "pool";
  result?: unknown;
}

export interface JobContext {
  /** Fires when the job is preempted or the server shuts down. */
  signal: AbortSignal;
}

export type JobFn = (ctx: JobContext) => Promise<JobOutcome>;

/** Throw this (or let an aborted AI call surface it) to put a preempted job back in the queue. */
export class PreemptedError extends Error {
  override name = "PreemptedError";
  readonly code = "preempted";
}

export interface Jobs {
  /** Enqueue (or join an active job with the same key). Returns a snapshot immediately. */
  enqueue(kind: JobKind, key: string, fn: JobFn): Job;
  /** Resolves with the final snapshot when the job finishes (immediately if it already has). */
  wait(id: string): Promise<Job>;
  /** Enqueue and wait (convenience for scripts and tests). */
  run(kind: JobKind, key: string, fn: JobFn): Promise<Job>;
  get(id: string): Job | undefined;
  /** Jobs that are queued or running. */
  active(): Job[];
  /** Resolves when nothing is queued or running (tests, shutdown). */
  idle(): Promise<void>;
  /** Abort the running job and drop the queue (shutdown). */
  stop(): void;
}

const GC_AFTER_MS = 60 * 60 * 1000;
export const MAX_PREEMPTIONS = 3;
const INTERACTIVE: ReadonlySet<JobKind> = new Set(["generate_day", "reroll", "onboarding", "reflect"]);

interface Entry {
  job: Job;
  fn: JobFn;
  interactive: boolean;
  preemptions: number;
  startedMs?: number;
  controller?: AbortController;
  waiters: ((j: Job) => void)[];
}

export function createJobs(opts: { now: () => Date; stamp: (d: Date) => string; log?: (m: string) => void }): Jobs {
  const byId = new Map<string, Entry>();
  const byKey = new Map<string, Entry>();
  const queue: Entry[] = [];
  let current: Entry | null = null;
  let stopped = false;
  let idleWaiters: (() => void)[] = [];
  const log = opts.log ?? ((m: string) => console.warn(`[jobs] ${m}`));

  function snapshot(e: Entry): Job {
    const j: Job = { ...e.job };
    if (e.startedMs !== undefined && (j.status === "running" || j.status === "queued")) {
      j.elapsed_ms = Math.max(0, opts.now().getTime() - e.startedMs);
    }
    return j;
  }

  function gc(): void {
    const cutoff = opts.now().getTime() - GC_AFTER_MS;
    for (const [id, e] of byId) {
      if (e.job.finished_at && new Date(e.job.finished_at).getTime() < cutoff) byId.delete(id);
    }
  }

  function finish(e: Entry): void {
    e.job.finished_at = opts.stamp(opts.now());
    if (byKey.get(e.job.key) === e) byKey.delete(e.job.key);
    const snap = snapshot(e);
    for (const w of e.waiters.splice(0)) w(snap);
  }

  function pickNext(): Entry | undefined {
    const i = queue.findIndex((e) => e.interactive);
    if (i >= 0) return queue.splice(i, 1)[0];
    return queue.shift();
  }

  function pump(): void {
    if (current || stopped) {
      if (!current && idleWaiters.length) flushIdle();
      return;
    }
    const e = pickNext();
    if (!e) {
      flushIdle();
      return;
    }
    current = e;
    void execute(e);
  }

  function flushIdle(): void {
    const ws = idleWaiters;
    idleWaiters = [];
    for (const w of ws) w();
  }

  async function execute(e: Entry): Promise<void> {
    const controller = new AbortController();
    e.controller = controller;
    e.job.status = "running";
    e.startedMs ??= opts.now().getTime();
    e.job.started_at ??= opts.stamp(opts.now());
    const t0 = Date.now();
    let requeue = false;
    try {
      const out = await e.fn({ signal: controller.signal });
      e.job.status = "succeeded";
      if (out.source) e.job.source = out.source;
      if (out.result !== undefined) e.job.result = out.result;
    } catch (err) {
      const code = (err as { code?: unknown }).code;
      if ((err instanceof PreemptedError || code === "preempted") && !stopped && e.preemptions < MAX_PREEMPTIONS) {
        requeue = true;
      } else {
        e.job.status = "failed";
        e.job.error = {
          code: typeof code === "string" ? code : "job_failed",
          message: "The herbs didn't grind this time.",
        };
        // Never log user content: only kind, key, duration and the error code.
        log(`${e.job.kind} ${e.job.key} failed after ${Date.now() - t0} ms: ${typeof code === "string" ? code : err instanceof Error ? err.name : "error"}`);
      }
    } finally {
      e.controller = undefined;
      current = null;
      if (requeue) {
        e.preemptions++;
        e.job.status = "queued";
        queue.push(e);
      } else {
        finish(e);
      }
      pump();
    }
  }

  const api: Jobs = {
    enqueue(kind, key, fn) {
      gc();
      const existing = byKey.get(key);
      if (existing) return snapshot(existing);
      const e: Entry = {
        job: { id: randomUUID(), kind, key, status: "queued", created_at: opts.stamp(opts.now()) },
        fn,
        interactive: INTERACTIVE.has(kind),
        preemptions: 0,
        waiters: [],
      };
      byId.set(e.job.id, e);
      byKey.set(key, e);
      if (stopped) {
        e.job.status = "failed";
        e.job.error = { code: "stopping", message: "The apothecary is closing for the night." };
        finish(e);
        return snapshot(e);
      }
      queue.push(e);
      // Monday starvation guard (architect risk 2): an interactive job preempts a running background one.
      if (e.interactive && current && !current.interactive && current.preemptions < MAX_PREEMPTIONS) {
        current.controller?.abort();
      }
      pump();
      return snapshot(e);
    },
    wait(id) {
      const e = byId.get(id);
      if (!e) return Promise.reject(new Error(`unknown job ${id}`));
      if (e.job.finished_at) return Promise.resolve(snapshot(e));
      return new Promise((r) => e.waiters.push(r));
    },
    async run(kind, key, fn) {
      const j = api.enqueue(kind, key, fn);
      return api.wait(j.id);
    },
    get(id) {
      gc();
      const e = byId.get(id);
      return e ? snapshot(e) : undefined;
    },
    active() {
      return [...byId.values()].filter((e) => e.job.status === "queued" || e.job.status === "running").map(snapshot);
    },
    idle() {
      if (!current && queue.length === 0) return Promise.resolve();
      return new Promise((r) => idleWaiters.push(r));
    },
    stop() {
      stopped = true;
      current?.controller?.abort();
      for (const e of queue.splice(0)) {
        e.job.status = "failed";
        e.job.error = { code: "stopping", message: "The apothecary is closing for the night." };
        finish(e);
      }
      if (!current) flushIdle();
    },
  };
  return api;
}
