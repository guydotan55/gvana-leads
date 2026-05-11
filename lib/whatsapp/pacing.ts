const sessionLocks = new Map<string, Promise<void>>();

export function computeJitterMs(): number {
  const min = 15_000;
  const max = 45_000;
  return Math.floor(min + Math.random() * (max - min + 1));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export async function acquireSendLock(sessionId: string): Promise<() => void> {
  const previous = sessionLocks.get(sessionId);
  let release!: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous ? previous.then(() => next) : next;
  sessionLocks.set(sessionId, chained);
  if (previous) await previous;
  return () => {
    release();
    if (sessionLocks.get(sessionId) === chained) {
      sessionLocks.delete(sessionId);
    }
  };
}

export function releaseSendLock(release: () => void): void {
  release();
}

export interface DailyCapInput {
  sessionId: string;
  cap: number;
  countTodayForSession: () => Promise<number>;
}

export async function isDailyCapReached(input: DailyCapInput): Promise<boolean> {
  const count = await input.countTodayForSession();
  return count >= input.cap;
}
