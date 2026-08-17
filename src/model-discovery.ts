import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import type { LlmDiscoveredModel, LlmModelDiscoveryRequest } from '@deepseek-ai/dsh-llm'

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 15000

/**
 * Read CLIProxyAPI's richer model listing for the settings page.
 *
 * Harness' generic pi-ai discovery only understands the OpenAI `data` shape
 * and deliberately returns a small metadata projection. CLIProxyAPI's `/v1/
 * models` endpoint has historically returned either `models` or `data`, so
 * this adapter accepts both forms while keeping the model route owned by the
 * native `llm-pi-ai` service.
 */
export async function discoverCpaModels(
  request: LlmModelDiscoveryRequest,
  resolveStoredApiKey: () => Promise<string | undefined>,
): Promise<readonly LlmDiscoveredModel[]> {
  const baseURL = normalizeBaseURL(request.baseURL)
  const url = `${baseURL}/models?client_version=dsh-cpa-plugin`
  const apiKey = request.apiKey?.trim() || await resolveStoredApiKey()
  const controller = new AbortController()
  const forwardAbort = (): void => { controller.abort(request.signal?.reason) }
  const timer = setTimeout(() => {
    controller.abort(new Error(`CLIProXyAPI model discovery timed out after ${DEFAULT_TIMEOUT_MS} ms`))
  }, DEFAULT_TIMEOUT_MS)
  if (request.signal?.aborted) forwardAbort()
  else request.signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        ...(apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` }),
        ...attributionHeaders(),
      },
    })
    if (!response.ok) {
      throw new Error(`CLIProXyAPI model catalog returned HTTP ${response.status}`)
    }
    const body = await readJson(response)
    const models = readModels(body)
    if (models.length === 0) throw new Error('CLIProXyAPI returned no usable models')
    return models
  } finally {
    clearTimeout(timer)
    request.signal?.removeEventListener('abort', forwardAbort)
  }
}

function normalizeBaseURL(value: string | undefined): string {
  const baseURL = String(value ?? '').trim().replace(/\/+$/, '')
  if (baseURL === '') throw new Error('CLIProXyAPI model endpoint is empty')
  let parsed: URL
  try {
    parsed = new URL(baseURL)
  } catch (error) {
    throw new Error('CLIProXyAPI model endpoint must be a valid URL', { cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('CLIProXyAPI model endpoint must use HTTP or HTTPS')
  }
  return baseURL
}

async function readJson(response: Response): Promise<unknown> {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel()
    throw new Error('CLIProXyAPI model catalog exceeds 4 MiB')
  }
  const text = await response.text()
  if (new TextEncoder().encode(text).byteLength > MAX_RESPONSE_BYTES) {
    throw new Error('CLIProXyAPI model catalog exceeds 4 MiB')
  }
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error('CLIProXyAPI model catalog did not return usable JSON', { cause: error })
  }
}

function readModels(value: unknown): LlmDiscoveredModel[] {
  const root = record(value)
  const entries = Array.isArray(root?.models)
    ? root.models
    : Array.isArray(root?.data) ? root.data : []
  const seen = new Set<string>()
  const models: LlmDiscoveredModel[] = []
  for (const entryValue of entries) {
    const entry = record(entryValue)
    const id = text(entry?.slug, entry?.id, entry?.model)
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    const name = text(entry?.display_name, entry?.name, entry?.description, id)
    const contextWindow = positiveInteger(entry?.max_context_window, entry?.context_window, entry?.context_length)
    const maxTokens = positiveInteger(entry?.max_output_tokens, entry?.max_completion_tokens, entry?.max_tokens)
    models.push({
      id,
      ...name === undefined ? {} : { name },
      ...contextWindow === undefined ? {} : { contextWindow },
      ...maxTokens === undefined ? {} : { maxTokens },
    })
  }
  return models
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function text(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim()
  }
  return undefined
}

function positiveInteger(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
      const parsed = Number(value.trim())
      if (Number.isSafeInteger(parsed) && parsed > 0) return parsed
    }
  }
  return undefined
}
