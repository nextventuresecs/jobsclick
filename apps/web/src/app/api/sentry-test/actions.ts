'use server';

import * as Sentry from '@sentry/nextjs';
import { headers } from 'next/headers';

/**
 * Verification Server Action testing Sentry trace connection & error handling
 */
export async function triggerServerActionError(scenario: string) {
  return Sentry.withServerActionInstrumentation(
    'triggerServerActionError',
    {
      headers: await headers(),
      recordResponse: true,
    },
    async () => {
      const err = new Error(
        `[Sentry Server Action Test] Deterministic failure for scenario: ${scenario}`
      );
      const eventId = Sentry.captureException(err, {
        tags: { test_type: 'server_action_verification', scenario },
      });
      return { success: false, error: err.message, eventId };
    }
  );
}
