import { describe, expect, it } from 'vitest';
import { AiError } from '@pixel-brewery/synapse-core';
import { assistantRetryDelay } from './assistantRetryDelay.js';

describe('assistantRetryDelay', () => {
  it('waits for explicit authentication or an unavailable installation without guessing from prose', () => {
    expect(assistantRetryDelay(new AiError('auth-required', 'Sign in'), 0)).toBe(240_000);
    expect(assistantRetryDelay(new Error('loc.resonanz.error.assistantMissing'), 0)).toBe(240_000);
    expect(assistantRetryDelay(new Error('Please retry this provider error'), 0)).toBeNull();
  });
  it('respects provider recovery times while bounding automatic waits to one day', () => {
    expect(
      assistantRetryDelay(
        new AiError('rate-limit', 'Wait', { retryable: true, retryAt: 900_000 }),
        100_000,
      ),
    ).toBe(800_000);
    expect(
      assistantRetryDelay(new AiError('provider', 'Transient', { retryable: true }), 100_000),
    ).toBe(240_000);
    expect(
      assistantRetryDelay(
        new AiError('quota', 'Long wait', { retryable: true, retryAt: 2 * 86_400_000 }),
        0,
      ),
    ).toBeNull();
  });
  it('never retries unsafe cleanup, cancellation or nonrepeatable host/validation failures', () => {
    for (const code of [
      'cancelled',
      'host',
      'persistence',
      'protocol',
      'result-validation',
      'output-limit',
      'configuration',
      'unsupported',
      'session-unavailable',
      'disposed',
    ] as const)
      expect(
        assistantRetryDelay(new AiError(code, 'Permanent', { retryable: true }), 0),
      ).toBeNull();
    expect(
      assistantRetryDelay(
        new AiError('provider', 'Cleanup failed', { retryable: true, cleanupIncomplete: true }),
        0,
      ),
    ).toBeNull();
  });
});
