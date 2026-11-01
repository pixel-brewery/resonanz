import { AiError } from '@pixel-brewery/synapse-core';

/** Maps explicit Synapse recovery metadata to a bounded wait without guessing from provider prose. */
export function assistantRetryDelay(cause: unknown, now: number): number | null {
  const minimum = 4 * 60_000;
  const maximum = 24 * 60 * 60_000;
  if (cause instanceof Error && cause.message === 'loc.resonanz.error.assistantMissing')
    return minimum;
  if (!(cause instanceof AiError) || cause.cleanupIncomplete) return null;
  if (cause.code === 'auth-required') return minimum;
  if (
    !cause.retryable ||
    [
      'cancelled',
      'disposed',
      'host',
      'persistence',
      'protocol',
      'result-validation',
      'output-limit',
      'configuration',
      'unsupported',
      'session-unavailable',
    ].includes(cause.code)
  )
    return null;
  const delay = Math.max(minimum, (cause.retryAt ?? now) - now);
  return Number.isFinite(delay) && delay <= maximum ? delay : null;
}
