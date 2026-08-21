/**
 * The optional Fast path for CLIProXyAPI's Codex Responses models.
 *
 * The Host keeps this implementation behind the `llm/stream` waterfall and
 * only calls it after the model catalog has advertised the `priority` service
 * tier. Older Harness runtimes may carry the task tier through the optional
 * execution bridge instead of a typed request field; the downstream CPA call
 * always receives the effective `priority` tier. The normal provider route and
 * all other providers remain unchanged.
 */
import { attributionHeaders, contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import { stream as openAIResponsesStream } from '@earendil-works/pi-ai/api/openai-responses'
import type { Model, OpenAIResponsesOptions, ThinkingLevelMap } from '@earendil-works/pi-ai'
import { toPiContext } from '@deepseek-ai/dsh-llm-pi-ai/src/context.ts'
import { toStreamChunks } from '@deepseek-ai/dsh-llm-pi-ai/src/stream.ts'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'

type PiGenerateOptions = Parameters<typeof toPiContext>[0]

export interface CpaFastModel {
  id: string
  name?: string
  input?: readonly ('text' | 'image')[]
  reasoningEfforts?: readonly string[]
  contextWindow?: number
  maxTokens?: number
}

export interface CpaFastRoute {
  provider: string
  baseURL: string
  apiKeyEnv?: string
  models: readonly CpaFastModel[]
}

export async function* streamCpaFast(
  options: GenerateOptions,
  route: CpaFastRoute,
  resolveApiKey: (ref: string) => Promise<string | undefined>,
  resolveAttachments?: () => AttachmentStore | undefined,
): AsyncGenerator<StreamChunk> {
  if (options.stop !== undefined) {
    throw new LlmError('CLIProXyAPI Responses does not support stop sequences', 'UNSUPPORTED_OPTION')
  }

  const configured = route.models.find(model => model.id === options.model)
  const efforts = reasoningEfforts(configured)
  const requestedEffort = options.reasoningEffort === undefined ? undefined : String(options.reasoningEffort)
  if (requestedEffort !== undefined && requestedEffort !== 'off' && !efforts.includes(requestedEffort)) {
    throw new LlmError(
      `CLIProXyAPI model "${options.model}" does not support reasoning effort "${requestedEffort}"`,
      'UNSUPPORTED_REASONING_EFFORT',
    )
  }

  const model = cpaModel(route, configured, options.model, efforts)
  const containsImage = options.messages.some(message => contentHasImage(message.content))
  const attachments = containsImage ? resolveAttachments?.() : undefined
  if (containsImage && attachments === undefined) {
    throw new LlmError('CLIProXyAPI image input requires the attachment service', 'UNSUPPORTED_CONTENT')
  }
  const context = attachments === undefined
    ? toPiContext(options as unknown as PiGenerateOptions)
    : await toPiContext(options as unknown as PiGenerateOptions, attachments)
  const apiKey = route.apiKeyEnv === undefined ? undefined : await resolveApiKey(route.apiKeyEnv)
  const events = openAIResponsesStream(model, context, {
    ...apiKey === undefined ? {} : { apiKey },
    ...requestedEffort === undefined || requestedEffort === 'off' ? {} : { reasoningEffort: requestedEffort as OpenAIResponsesOptions['reasoningEffort'] },
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
    ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
    ...options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) },
    signal: options.signal,
    headers: attributionHeaders(),
    maxRetries: 0,
    serviceTier: 'priority',
  } satisfies OpenAIResponsesOptions)
  // `toStreamChunks` is compiled against the workspace Harness declaration;
  // the wire-level chunk shapes are intentionally identical across the two
  // compatible package copies used by this plugin.
  yield* toStreamChunks(events, model.contextWindow) as unknown as AsyncIterable<StreamChunk>
}

function cpaModel(
  route: CpaFastRoute,
  configured: CpaFastModel | undefined,
  id: string,
  efforts: readonly string[],
): Model<'openai-responses'> {
  const thinkingLevelMap: ThinkingLevelMap = Object.fromEntries(efforts.map(effort => [effort, effort])) as ThinkingLevelMap
  return {
    id,
    name: configured?.name ?? id,
    api: 'openai-responses',
    provider: route.provider,
    baseUrl: route.baseURL,
    reasoning: efforts.length > 0,
    ...efforts.length === 0 ? {} : { thinkingLevelMap },
    input: configured?.input?.length === 0
      ? ['text']
      : configured?.input === undefined
        ? ['text']
        : [...configured.input],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: configured?.contextWindow ?? 262_144,
    maxTokens: configured?.maxTokens ?? 32_768,
  }
}

function reasoningEfforts(configured: CpaFastModel | undefined): string[] {
  return configured?.reasoningEfforts === undefined ? [] : [...configured.reasoningEfforts]
}
