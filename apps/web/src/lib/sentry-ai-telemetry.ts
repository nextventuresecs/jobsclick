import * as Sentry from '@sentry/nextjs';
import { sanitizeString } from './sentry-scrubber';

export interface GenAiSpanOptions {
  system?: 'gemini' | 'openai' | 'anthropic' | 'custom';
  operationName: 'chat' | 'completion' | 'generate_content' | 'tool_execution' | 'agent_run';
  model: string;
  temperature?: number;
  maxTokens?: number;
  prompt?: string;
  agentName?: string;
  toolName?: string;
}

export interface GenAiExecutionResult<T> {
  result: T;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  outputSummary?: string;
}

/**
 * Execute an AI/LLM task wrapped inside an OpenTelemetry-compliant Sentry span.
 * Guarantees zero PII leakage in prompt and response attributes.
 */
export async function withGenAiSpan<T>(
  options: GenAiSpanOptions,
  execute: () => Promise<GenAiExecutionResult<T>>
): Promise<T> {
  const spanName = options.agentName
    ? `agent.${options.agentName}.${options.operationName}`
    : `gen_ai.${options.operationName} ${options.model}`;

  return await Sentry.startSpan(
    {
      name: spanName,
      op: options.operationName === 'agent_run' ? 'gen_ai.agent' : 'gen_ai.client',
      attributes: {
        'gen_ai.system': options.system || 'custom',
        'gen_ai.operation.name': options.operationName,
        'gen_ai.request.model': options.model,
        ...(options.temperature !== undefined && {
          'gen_ai.request.temperature': options.temperature,
        }),
        ...(options.maxTokens !== undefined && {
          'gen_ai.request.max_tokens': options.maxTokens,
        }),
        ...(options.agentName && { 'gen_ai.agent.name': options.agentName }),
        ...(options.toolName && { 'gen_ai.tool.name': options.toolName }),
        ...(options.prompt && {
          'gen_ai.prompt.sanitized': sanitizeString(options.prompt),
        }),
      },
    },
    async (span) => {
      try {
        const { result, inputTokens, outputTokens, finishReason, outputSummary } =
          await execute();

        if (span) {
          if (inputTokens !== undefined) {
            span.setAttribute('gen_ai.usage.input_tokens', inputTokens);
          }
          if (outputTokens !== undefined) {
            span.setAttribute('gen_ai.usage.output_tokens', outputTokens);
          }
          if (inputTokens !== undefined && outputTokens !== undefined) {
            span.setAttribute('gen_ai.usage.total_tokens', inputTokens + outputTokens);
          }
          if (finishReason) {
            span.setAttribute('gen_ai.response.finish_reasons', [finishReason]);
          }
          if (outputSummary) {
            span.setAttribute('gen_ai.output.sanitized', sanitizeString(outputSummary));
          }
        }

        return result;
      } catch (error) {
        if (span) {
          span.setStatus({ code: 2, message: 'internal_error' });
        }
        Sentry.captureException(error, {
          tags: {
            'gen_ai.system': options.system || 'custom',
            'gen_ai.model': options.model,
            'gen_ai.operation': options.operationName,
          },
        });
        throw error;
      }
    }
  );
}
