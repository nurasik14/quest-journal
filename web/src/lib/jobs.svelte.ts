/**
 * Job polling that survives navigation (designer-AC3, architect-AC10). Several jobs can be tracked at once
 * (today's generation, a reroll, the weekly boss). Each is polled every 2 s while queued/running; when it
 * finishes (or 404s because the server restarted) listeners get the final snapshot (or null) and refetch.
 * Module-level state: leaving Today and coming back keeps the same jobs and timers (no duplicate POST).
 */
import type { Job, JobKind } from '../../../server/src/api-types';
import { api, ApiError } from './api';

export const jobs = $state<{ byKind: Partial<Record<JobKind, Job>> }>({ byKind: {} });

const POLL_MS = 2000;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** Client clock reading taken when a job's server-side elapsed time was observed: startedAt = now − elapsed. */
const startedAt = new Map<string, number>();
const listeners = new Set<(job: Job | null, kind: JobKind) => void>();

export function onJobSettled(fn: (job: Job | null, kind: JobKind) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const isActive = (j: Job | null | undefined): j is Job => !!j && (j.status === 'queued' || j.status === 'running');

function settle(kind: JobKind, job: Job | null) {
  const id = jobs.byKind[kind]?.id;
  if (id) {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
  }
  if (job) jobs.byKind[kind] = job;
  else delete jobs.byKind[kind];
  for (const fn of listeners) fn(job, kind);
}

function noteStart(job: Job) {
  if (startedAt.has(job.id)) return;
  if (typeof job.elapsed_ms === 'number') startedAt.set(job.id, Date.now() - job.elapsed_ms);
}

/** Epoch ms (client clock) when the job started on the server, for loader phases (designer risk 2). */
export function jobStartedAt(job: Job | null | undefined): number | undefined {
  return job ? startedAt.get(job.id) : undefined;
}

/** Start tracking a job (no-op if it's already tracked; finished jobs notify listeners right away). */
export function trackJob(job: Job) {
  const kind = job.kind;
  const prev = jobs.byKind[kind];
  if (prev && prev.id === job.id && timers.has(job.id)) {
    jobs.byKind[kind] = { ...prev, ...job };
    noteStart(job);
    return;
  }
  jobs.byKind[kind] = job;
  noteStart(job);
  if (!isActive(job)) {
    settle(kind, job);
    return;
  }
  const tick = async () => {
    const cur = jobs.byKind[kind];
    if (!cur || cur.id !== job.id) return;
    try {
      const { data } = await api.job(job.id);
      noteStart(data);
      jobs.byKind[kind] = data;
      if (!isActive(data)) return settle(kind, data);
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return settle(kind, null);
      // offline: keep polling quietly
    }
    timers.set(job.id, setTimeout(tick, POLL_MS));
  };
  timers.set(job.id, setTimeout(tick, POLL_MS));
}

export function activeJob(kind: JobKind): Job | null {
  const j = jobs.byKind[kind];
  return isActive(j) ? j : null;
}

export function isGenerating(): boolean {
  return activeJob('generate_day') !== null;
}
