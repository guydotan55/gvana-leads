/**
 * Retry wrapper for Google Sheets API calls.
 *
 * The service account is capped at 60 reads/min/user. When the
 * dashboard polls /api/leads + a few admins are on /forms + form
 * pages get hit, we burst over the limit and Sheets returns 429
 * (or its sibling, the rate-limit-exceeded error from googleapis).
 *
 * Most quota errors are transient — backing off for a beat lets us
 * succeed without surfacing an error to the user. We retry 3 times
 * with exponential backoff (250ms → 500ms → 1000ms + jitter), only
 * on retryable error shapes; everything else throws immediately.
 */
type RetryableError = Error & {
  code?: number | string;
  response?: { status?: number; data?: { error?: { message?: string; status?: string } } };
  errors?: { reason?: string }[];
};

function isRetryable(err: RetryableError): boolean {
  const status = err?.response?.status ?? (typeof err.code === "number" ? err.code : undefined);
  if (status === 429 || status === 500 || status === 502 || status === 503 || status === 504) return true;
  const apiStatus = err?.response?.data?.error?.status;
  if (apiStatus === "RESOURCE_EXHAUSTED" || apiStatus === "UNAVAILABLE" || apiStatus === "DEADLINE_EXCEEDED") return true;
  const reason = err?.errors?.[0]?.reason;
  if (reason === "rateLimitExceeded" || reason === "userRateLimitExceeded" || reason === "backendError") return true;
  const message = err?.message || "";
  if (/quota|rate limit|429|timeout/i.test(message)) return true;
  return false;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withSheetsRetry<T>(fn: () => Promise<T>, maxAttempts = 4): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err as RetryableError) || attempt === maxAttempts - 1) throw err;
      const baseDelay = 250 * 2 ** attempt;
      const jitter = Math.floor(Math.random() * 100);
      await sleep(baseDelay + jitter);
    }
  }
  // Unreachable, but TS needs it.
  throw lastErr;
}
