/**
 * Race a promise against a deadline. The underlying work continues but its
 * result is discarded once the timer fires — callers get a TimeoutError they
 * can distinguish from generic failures and surface as "slow network" UX.
 */
export class TimeoutError extends Error {
  constructor(message = 'Timeout') {
    super(message);
    this.name = 'TimeoutError';
  }
}

export function isTimeoutError(err: unknown): err is TimeoutError {
  return err instanceof Error && err.name === 'TimeoutError';
}

export async function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  try {
    return await Promise.race([Promise.resolve(promise), timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
