import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { sanitizeString, deepScrubPii } from '../../../lib/sentry-scrubber';
import { withGenAiSpan } from '../../../lib/sentry-ai-telemetry';

export const dynamic = 'force-dynamic';

/**
 * Dedicated test-only verification endpoint for Sentry observability
 * Automatically restricted from running in production environments.
 */
export async function GET(request: Request) {
  // Prevent test verification exposure in production deployments
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'Sentry verification endpoint is disabled in production' },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'info';

  if (action === 'server-error') {
    const errorId = Sentry.captureException(
      new Error('[Sentry Verification] Deterministic server error triggered')
    );
    return NextResponse.json({
      success: true,
      action,
      errorId,
      message: 'Server exception captured to Sentry',
    });
  }

  if (action === 'distributed-trace') {
    const sentryTraceHeader = request.headers.get('sentry-trace') || undefined;
    const baggageHeader = request.headers.get('baggage') || undefined;

    return Sentry.continueTrace(
      { sentryTrace: sentryTraceHeader, baggage: baggageHeader },
      async () => {
        return await Sentry.startSpan(
          {
            name: 'sentry.test.distributed_trace',
            op: 'http.server',
            attributes: {
              'test.suite': 'sentry-observability',
              'test.propagated': Boolean(sentryTraceHeader),
            },
          },
          async (span) => {
            const traceId = span?.spanContext().traceId;
            const spanId = span?.spanContext().spanId;

            return NextResponse.json({
              success: true,
              action,
              traceId,
              spanId,
              propagatedTrace: sentryTraceHeader || null,
              timestamp: new Date().toISOString(),
            });
          }
        );
      }
    );
  }

  if (action === 'client-error') {
    return new NextResponse(
      `<!DOCTYPE html>
<html>
  <head><title>Sentry Client Error Test</title></head>
  <body>
    <h1>Sentry Client Error Verification</h1>
    <button id="trigger" onclick="throw new Error('[Sentry Verification] Client-side error triggered')">Trigger Error</button>
  </body>
</html>`,
      { headers: { 'content-type': 'text/html; charset=utf-8' } }
    );
  }

  if (action === 'ai-span') {
    const aiResult = await withGenAiSpan(
      {
        system: 'gemini',
        operationName: 'generate_content',
        model: 'gemini-1.5-flash',
        prompt: 'User phone: +919876543210 Aadhaar: 1234 5678 9012 summarize resume',
        agentName: 'ResumeSummaryAgent',
      },
      async () => {
        return {
          result: { summary: 'Candidate experienced in Next.js' },
          inputTokens: 42,
          outputTokens: 18,
          finishReason: 'stop',
          outputSummary: 'Candidate profile summary generated safely',
        };
      }
    );

    return NextResponse.json({
      success: true,
      action,
      data: aiResult,
    });
  }

  if (action === 'pii-scrub') {
    const samplePayload = {
      phone: '+919876543210',
      email: 'candidate@jobsclick.in',
      aadhaar: '5432 1234 9876',
      userToken: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy.sig',
      normalField: 'Public Job Posting Title',
    };

    const scrubbed = deepScrubPii(samplePayload);
    const sanitizedStringResult = sanitizeString(
      'Candidate phone +919876543210, email candidate@jobsclick.in and Aadhaar 5432 1234 9876'
    );

    return NextResponse.json({
      success: true,
      action,
      raw: samplePayload,
      scrubbed,
      sanitizedStringResult,
    });
  }

  return NextResponse.json({
    project: 'jobsclicklives-org/jobclick',
    runtimes: ['client', 'server', 'edge'],
    availableActions: ['server-error', 'client-error', 'distributed-trace', 'ai-span', 'pii-scrub'],
  });
}
