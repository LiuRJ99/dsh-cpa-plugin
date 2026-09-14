/**
 * The optional Fast path for CLIProXyAPI's Codex Responses models.
 *
 * The Host keeps this implementation behind the `llm/stream` waterfall and
 * only calls it for text models that are known to use CLIProxyAPI's Codex
 * Responses route. Older Harness runtimes may carry the task tier through the
 * optional execution bridge instead of a typed request field; the downstream
 * CPA call still receives the effective `priority` tier for Fast mode.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { attributionHeaders, contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { GenerateOptions, StreamChunk } from '@deepseek-ai/dsh-llm'
import type { Api, AssistantMessageEventStream, Context as PiContext, Model, OpenAICodexResponsesOptions, ThinkingLevelMap } from '@earendil-works/pi-ai'
import { toPiContext } from './pi-ai/context.ts'
import { toStreamChunks } from './pi-ai/stream.ts'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'

type PiGenerateOptions = Parameters<typeof toPiContext>[0]

export const CLIPROXYAPI_CODEX_API = 'cliproxyapi-codex-responses' as const
const PLACEHOLDER_API_KEY = 'dsh-cliproxyapi-no-key'

export interface CpaFastModel {
  id: string
  name?: string
  input?: readonly ('text' | 'image')[]
  reasoningEfforts?: false | readonly string[] | Readonly<Record<string, string | null>>
  contextWindow?: number
  maxTokens?: number
}

export interface CpaFastRoute {
  provider: string
  baseURL: string
  apiKeyEnv?: string
  models: readonly CpaFastModel[]
}

type CpaCodexModel = Omit<Model<'openai-codex-responses'>, 'api'> & {
  api: typeof CLIPROXYAPI_CODEX_API
}

export async function* streamCpaFast(
  options: GenerateOptions,
  route: CpaFastRoute,
  resolveApiKey: (ref: string) => Promise<string | undefined>,
  resolveAttachments?: () => AttachmentStore | undefined,
  serviceTier?: 'priority',
): AsyncGenerator<StreamChunk> {
  if (options.stop !== undefined) {
    throw new LlmError('CLIProXyAPI Responses does not support stop sequences', 'UNSUPPORTED_OPTION')
  }

  const configured = route.models.find(model => model.id === options.model)
  const effortMap = reasoningEfforts(configured)
  const requestedEffort = options.reasoningEffort === undefined ? undefined : String(options.reasoningEffort)
  if (requestedEffort !== undefined && requestedEffort !== 'off'
    && (!Object.prototype.hasOwnProperty.call(effortMap, requestedEffort) || effortMap[requestedEffort] === null)) {
    throw new LlmError(
      `CLIProXyAPI model "${options.model}" does not support reasoning effort "${requestedEffort}"`,
      'UNSUPPORTED_REASONING_EFFORT',
    )
  }

  const model = cpaModel(route, configured, options.model, effortMap)
  const containsImage = options.messages.some(message => contentHasImage(message.content))
  const attachments = containsImage ? resolveAttachments?.() : undefined
  if (containsImage && attachments === undefined) {
    throw new LlmError('CLIProXyAPI image input requires the attachment service', 'UNSUPPORTED_CONTENT')
  }
  const context = attachments === undefined
    ? toPiContext(options as unknown as PiGenerateOptions)
    : await toPiContext(options as unknown as PiGenerateOptions, attachments)
  // The stock Codex adapter requires a non-empty token even when the local
  // CLIProxyAPI instance is configured without authentication. Keep the same
  // placeholder contract as the generic CPA provider in that case.
  const configuredApiKey = route.apiKeyEnv === undefined ? undefined : await resolveApiKey(route.apiKeyEnv)
  const apiKey = configuredApiKey?.trim() || PLACEHOLDER_API_KEY
  const codexStream = await loadCodexStream(route.provider)
  const events = codexStream(model, context, {
    ...apiKey === undefined ? {} : { apiKey },
    ...requestedEffort === undefined || requestedEffort === 'off' ? {} : { reasoningEffort: requestedEffort as OpenAICodexResponsesOptions['reasoningEffort'] },
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
    ...options.maxTokens === undefined ? {} : { maxTokens: options.maxTokens },
    ...options.sessionId === undefined ? {} : { sessionId: String(options.sessionId) },
    signal: options.signal,
    headers: attributionHeaders(),
    ...serviceTier === undefined ? {} : { serviceTier },
  } satisfies OpenAICodexResponsesOptions)
  // `toStreamChunks` is compiled against the workspace Harness declaration;
  // the wire-level chunk shapes are intentionally identical across the two
  // compatible package copies used by this plugin.
  yield* toStreamChunks(events, model.contextWindow) as unknown as AsyncIterable<StreamChunk>
}

export function cpaModel(
  route: CpaFastRoute,
  configured: CpaFastModel | undefined,
  id: string,
  effortMap: Readonly<Record<string, string | null>>,
): CpaCodexModel {
  const efforts = supportedReasoningEfforts(effortMap)
  const thinkingLevelMap = Object.keys(effortMap).length === 0
    ? undefined
    : effortMap as ThinkingLevelMap
  return {
    id,
    name: configured?.name ?? id,
    api: CLIPROXYAPI_CODEX_API,
    provider: route.provider,
    baseUrl: codexBaseURL(route.baseURL),
    reasoning: efforts.length > 0,
    ...thinkingLevelMap === undefined ? {} : { thinkingLevelMap },
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

const THINKING_LEVELS = new Set(['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])

export function reasoningEfforts(configured: CpaFastModel | undefined): Readonly<Record<string, string | null>> {
  const configuredEfforts = configured?.reasoningEfforts
  if (configuredEfforts === undefined || configuredEfforts === false) return {}
  if (Array.isArray(configuredEfforts)) {
    return Object.fromEntries(configuredEfforts
      .filter(effort => THINKING_LEVELS.has(effort))
      .map(effort => [effort, effort]))
  }
  return Object.fromEntries(Object.entries(configuredEfforts).filter(([effort, wire]) => {
    return THINKING_LEVELS.has(effort) && (wire === null || typeof wire === 'string')
  }))
}

function supportedReasoningEfforts(effortMap: Readonly<Record<string, string | null>>): string[] {
  return Object.keys(effortMap).filter(effort => effort !== 'off' && effortMap[effort] !== null)
}

export function codexBaseURL(baseURL: string): string {
  const normalized = baseURL.trim().replace(/\/+$/, '')
  if (normalized.endsWith('/codex/responses') || normalized.endsWith('/codex') || normalized.endsWith('/backend-api')) {
    return normalized
  }
  const withoutV1 = normalized.endsWith('/v1') ? normalized.slice(0, -'/v1'.length) : normalized
  return `${withoutV1}/backend-api`
}

/** Identify model namespaces that the Codex Responses backend conventionally serves. */
export function isCodexResponsesModel(id: string): boolean {
  const normalized = id.trim().toLowerCase().replace(/^openai[/:.]/, '')
  return /^(?:gpt-|o[134](?:-|$)|chatgpt-|codex-)/.test(normalized)
}

const EXTRACT_ACCOUNT_ID_PATCH = `function extractAccountId(token) {
    // CLIProxyAPI accepts plain API keys as well as ChatGPT JWTs.
    try {
        const parts = token.split(".");
        if (parts.length !== 3)
            return "";
        const payload = JSON.parse(atob(parts[1]));
        const accountId = payload?.[JWT_CLAIM_PATH]?.chatgpt_account_id;
        return typeof accountId === "string" && accountId.trim() ? accountId : "";
    }
    catch {
        return "";
    }
}`

function patchWebSocketOnlyTransport(source: string): string {
  const sessionIdExpression = String.raw`(?:options\?\.sessionId|cacheSessionId)`
  const disabledForSession = new RegExp(
    String.raw`const websocketDisabledForSession\s*=\s*transport !== "sse" && isWebSocketSseFallbackActive\(${sessionIdExpression}\);`,
  )
  const retryVariables = /let retriedWebSocketConnectionLimit\s*=\s*false;/
  const connectionLimitRetry =
    /if \(!aborted && connectionLimitBeforeStart && !retriedWebSocketConnectionLimit\) \{\s*retriedWebSocketConnectionLimit = true;\s*continue;\s*\}/
  const websocketFailureHandling = new RegExp(
    String.raw`if \(aborted \|\| \(isCodexNonTransportError\(error\) && !connectionLimitBeforeStart\)\) \{[\s\S]*?recordWebSocketFailure\((${sessionIdExpression}), error\);[\s\S]*?recordWebSocketSseFallback\(\1\);\s*break;`,
  )
  const fallbackSessionRecord = 'websocketSseFallbackSessions.add(sessionId);'
  const fallbackActiveRecord = 'stats.websocketFallbackActive = true;'
  for (const fragment of [fallbackSessionRecord, fallbackActiveRecord]) {
    if (!source.includes(fragment)) {
      throw new Error('openai-codex-responses source no longer supports the WebSocket-only transport patch')
    }
  }
  for (const pattern of [disabledForSession, retryVariables, connectionLimitRetry, websocketFailureHandling]) {
    if (!pattern.test(source)) {
      throw new Error('openai-codex-responses source no longer supports the WebSocket-only transport patch')
    }
  }
  return source
    .replace(disabledForSession, 'const websocketDisabledForSession = false;')
    .replace(
      retryVariables,
      `let websocketRetries = 0;
                const maxWebSocketRetries = Number.isFinite(options?.maxRetries)
                    ? Math.min(Math.max(0, Math.floor(options.maxRetries)), 5)
                    : 3;`,
    )
    .replace(connectionLimitRetry, '')
    .replace(
      websocketFailureHandling,
      (_match, activeSessionId: string) => `if (aborted || (isCodexNonTransportError(error) && !connectionLimitBeforeStart)) {
                            throw error;
                        }
                        if (!websocketStarted && websocketRetries < maxWebSocketRetries) {
                            websocketRetries++;
                            continue;
                        }
                        appendAssistantMessageDiagnostic(output, createAssistantMessageDiagnostic("provider_transport_failure", error, {
                            configuredTransport: transport,
                            fallbackTransport: undefined,
                            eventsEmitted: websocketStarted,
                            phase: websocketStarted ? "after_message_stream_start" : "before_message_stream_start",
                            requestBytes: new TextEncoder().encode(bodyJson).byteLength,
                        }));
                        recordWebSocketFailure(${activeSessionId}, error);
                        throw error;`,
    )
    .replace(fallbackSessionRecord, '')
    .replace(fallbackActiveRecord, 'stats.websocketFallbackActive = false;')
}

export function patchCodexSource(source: string, providerIds: readonly string[]): string {
  if (!/function extractAccountId\(token\) \{/.test(source)) {
    throw new Error('openai-codex-responses source no longer contains extractAccountId(token)')
  }
  let patched = source.replace(/function extractAccountId\(token\) \{[\s\S]*?\n\}/, EXTRACT_ACCOUNT_ID_PATCH)
  if (!patched.includes('headers.set("chatgpt-account-id", accountId);')) {
    throw new Error('openai-codex-responses source no longer sets chatgpt-account-id')
  }
  patched = patched.replace(
    'headers.set("chatgpt-account-id", accountId);',
    'if (accountId) {\n        headers.set("chatgpt-account-id", accountId);\n    }',
  )
  const providersPattern = /const CODEX_TOOL_CALL_PROVIDERS = new Set\(\[([^\]]*)\]\);/
  const providersMatch = patched.match(providersPattern)
  if (!providersMatch) {
    throw new Error('openai-codex-responses source no longer defines CODEX_TOOL_CALL_PROVIDERS')
  }
  const existing = providersMatch[1]
  const extras = providerIds
    .filter(provider => provider.trim() !== '')
    .map(provider => JSON.stringify(provider.trim()))
    .join(', ')
  patched = patched.replace(providersPattern, `const CODEX_TOOL_CALL_PROVIDERS = new Set([${existing}${extras ? `, ${extras}` : ''}]);`)
  const customApi = patched.replaceAll('api: "openai-codex-responses"', `api: ${JSON.stringify(CLIPROXYAPI_CODEX_API)}`)
  if (!customApi.includes(`api: ${JSON.stringify(CLIPROXYAPI_CODEX_API)}`)) {
    throw new Error('openai-codex-responses source no longer exposes its assistant api metadata')
  }
  return patchWebSocketOnlyTransport(customApi).replace(/^\/\/# sourceMappingURL=.*$/gm, '')
}

function rewriteRelativeImports(source: string, originalDir: string): string {
  return source.replace(/from\s+"((?:\.\.?\/)[^"]+)"/g, (_full, relativePath: string) => {
    return `from ${JSON.stringify(pathToFileURL(join(originalDir, relativePath)).href)}`
  })
}

function resolveCodexModuleFromNodeEntry(entryPath: string): string | undefined {
  try {
    const require = createRequire(pathToFileURL(realpathSync(entryPath)))
    for (const nodeModulesDir of require.resolve.paths('@earendil-works/pi-ai') ?? []) {
      const candidate = join(nodeModulesDir, '@earendil-works', 'pi-ai', 'dist', 'api', 'openai-codex-responses.js')
      if (existsSync(candidate)) return candidate
    }
  } catch {
    // Ignore unavailable or virtual host entrypoints.
  }
  return undefined
}

function resolveCodexModulePath(): { path: string; dir: string } {
  const candidates: string[] = []
  try {
    candidates.push(fileURLToPath(import.meta.resolve('@earendil-works/pi-ai/api/openai-codex-responses')))
  } catch {
    // Fall through to the physical package entry.
  }
  try {
    const main = fileURLToPath(import.meta.resolve('@earendil-works/pi-ai'))
    const distDir = dirname(main)
    candidates.push(join(distDir, 'api/openai-codex-responses.js'))
    candidates.push(join(distDir, 'openai-codex-responses.js'))
  } catch {
    // The package resolution error is reported below with all candidates.
  }
  if (process.argv[1]) {
    const bundledHostModule = resolveCodexModuleFromNodeEntry(process.argv[1])
    if (bundledHostModule) candidates.push(bundledHostModule)
  }
  for (const path of candidates) {
    if (existsSync(path)) return { path, dir: dirname(path) }
  }
  throw new Error(`Cannot resolve openai-codex-responses.js (tried: ${candidates.join(', ') || 'none'})`)
}

type CpaCodexStream = (
  model: Model<Api>,
  context: PiContext,
  options: OpenAICodexResponsesOptions,
) => AssistantMessageEventStream

const codexStreams = new Map<string, Promise<CpaCodexStream>>()

async function loadCodexStream(provider: string): Promise<CpaCodexStream> {
  const cached = codexStreams.get(provider)
  if (cached !== undefined) return cached
  const pending = importCodexStream(provider)
  codexStreams.set(provider, pending)
  try {
    return await pending
  } catch (error) {
    codexStreams.delete(provider)
    throw error
  }
}

async function importCodexStream(provider: string): Promise<CpaCodexStream> {
  const { path, dir } = resolveCodexModulePath()
  const source = readFileSync(path, 'utf8')
  const patched = rewriteRelativeImports(patchCodexSource(source, [provider]), dir)
  const hash = createHash('sha1').update(patched).digest('hex').slice(0, 16)
  const cacheDir = join(tmpdir(), 'dsh-cpa-plugin')
  mkdirSync(cacheDir, { recursive: true })
  const output = join(cacheDir, `openai-codex-responses-${hash}.mjs`)
  if (!existsSync(output)) writeFileSync(output, patched, 'utf8')
  const module = await import(pathToFileURL(output).href) as { stream?: CpaCodexStream }
  if (typeof module.stream !== 'function') {
    throw new Error('patched openai-codex-responses module has no stream export')
  }
  return module.stream
}
