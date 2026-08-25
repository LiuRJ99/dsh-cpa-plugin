import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'

export const IMAGE_GENERATION_SERVICE = 'dshCpaImageGeneration'

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const GPT_MODEL = 'gpt-image-2'
const GEMINI_MODEL = 'gemini-3.1-flash-image'
const SUPPORTED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const)

export type ImageEngine = 'gpt' | 'gemini'

export interface CpaImageGenerationRequest {
  engine: ImageEngine
  prompt: string
  aspectRatio?: string
  imageSize?: string
  size?: string
  signal: AbortSignal
}

export interface CpaGeneratedImage {
  data: Uint8Array
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
}

export interface CpaImageGenerationService {
  generate(request: CpaImageGenerationRequest): Promise<CpaGeneratedImage>
}

interface CpaImageGenerationRoute {
  baseURL: string
  apiKeyEnv?: string
}

interface ImageGenerationDeps {
  fetchImpl?: typeof fetch
}

type RecordLike = Record<string, unknown>

/**
 * @internal Host-only composition seam for CPA-backed image generation.
 */
export function createCpaImageGenerationService(
  resolveRoute: (engine: ImageEngine) => CpaImageGenerationRoute | undefined,
  readCredential: (ref: string) => Promise<string | undefined>,
  deps: ImageGenerationDeps = {},
): CpaImageGenerationService {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch
  return {
    async generate(request) {
      if (request.signal.aborted) throw abortError()
      const prompt = request.prompt.trim()
      if (prompt === '') throw new LlmError('CPA image generation prompt must not be empty', 'INVALID_REQUEST')
      if (request.engine !== 'gpt' && request.engine !== 'gemini') {
        throw new LlmError(`Unsupported CPA image engine "${String(request.engine)}"`, 'INVALID_REQUEST')
      }

      const route = resolveRoute(request.engine)
      if (route === undefined) throw new LlmError(`CPA image route for engine "${request.engine}" is unavailable`, 'INVALID_REQUEST')
      const apiKey = await readRequiredCredential(readCredential, route.apiKeyEnv)

      if (request.engine === 'gpt') {
        if (request.aspectRatio !== undefined) {
          throw new LlmError('CPA GPT image generation does not support aspectRatio', 'UNSUPPORTED_OPTION')
        }
        const response = await requestJson(fetchImpl, imageGenerationsURL(route.baseURL), {
          method: 'POST',
          signal: request.signal,
          headers: cpaHeaders(apiKey),
          body: JSON.stringify({
            model: GPT_MODEL,
            prompt,
            n: 1,
            output_format: 'png',
            size: request.size ?? request.imageSize ?? '1024x1024',
            quality: 'auto',
          }),
        })
        return parseGptImage(response, fetchImpl, request.signal)
      }

      const imageConfig = geminiImageConfigOf(request)
      const response = await requestJson(fetchImpl, chatCompletionsURL(route.baseURL), {
        method: 'POST',
        signal: request.signal,
        headers: cpaHeaders(apiKey),
        body: JSON.stringify({
          model: GEMINI_MODEL,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          ...(imageConfig === undefined ? {} : {
            modalities: ['image'],
            image_config: imageConfig,
          }),
        }),
      })
      return parseGeminiImage(response)
    },
  }
}

/**
 * Map the public Gemini controls to CLIProxyAPI's OpenAI-compatible extension.
 *
 * Gemini's native API supports aspect ratio and image size, while the CPA
 * chat-completions translator accepts them under `image_config` and maps them
 * to `generationConfig.imageConfig`. The generic `size` field belongs to
 * OpenAI-style image endpoints, so an accidental Gemini value is ignored
 * rather than causing a model-visible retry.
 */
function geminiImageConfigOf(request: CpaImageGenerationRequest): Record<string, string> | undefined {
  const aspectRatio = normalizedOption(request.aspectRatio)
  const imageSize = normalizedOption(request.imageSize)
  if (aspectRatio === undefined && imageSize === undefined) return undefined
  return {
    ...(aspectRatio === undefined ? {} : { aspect_ratio: aspectRatio }),
    ...(imageSize === undefined ? {} : { image_size: imageSize }),
  }
}

function normalizedOption(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === undefined || normalized === '' ? undefined : normalized
}

function cpaHeaders(apiKey: string): HeadersInit {
  return {
    'content-type': 'application/json',
    accept: 'application/json',
    ...attributionHeaders(),
    authorization: `Bearer ${apiKey}`,
  }
}

function imageGenerationsURL(baseURL: string): string {
  return new URL('images/generations', ensureBaseURL(baseURL)).toString()
}

function chatCompletionsURL(baseURL: string): string {
  return new URL('chat/completions', ensureBaseURL(baseURL)).toString()
}

function ensureBaseURL(value: string): string {
  const baseURL = String(value ?? '').trim().replace(/\/+$/, '')
  if (baseURL === '') throw new LlmError('CPA image generation baseURL must not be empty', 'INVALID_REQUEST')
  let parsed: URL
  try {
    parsed = new URL(baseURL)
  } catch (error) {
    throw new LlmError('CPA image generation baseURL must be a valid URL', 'INVALID_REQUEST', { cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new LlmError('CPA image generation baseURL must use HTTP or HTTPS', 'INVALID_REQUEST')
  }
  return `${baseURL}/`
}

async function readRequiredCredential(
  readCredential: (ref: string) => Promise<string | undefined>,
  ref: string | undefined,
): Promise<string> {
  if (ref === undefined || ref.trim() === '') {
    throw new LlmError('CPA image generation route is missing apiKeyEnv', 'INVALID_REQUEST')
  }
  const credential = await readCredential(ref)
  if (typeof credential !== 'string' || credential.trim() === '') {
    throw new LlmError('CPA image generation credential is empty', 'INVALID_REQUEST')
  }
  return credential.trim()
}

async function requestJson(fetchImpl: typeof fetch, url: string, init: RequestInit): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    if (error instanceof LlmError) throw error
    if (init.signal?.aborted) throw abortError()
    throw new LlmError('CPA image generation request failed', 'TRANSPORT')
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new LlmError(`CPA image generation upstream answered HTTP ${response.status}`, 'UPSTREAM_HTTP_ERROR')
  }
  return readBoundedJson(response, init.signal)
}

async function readBoundedJson(response: Response, signal: AbortSignal | null | undefined): Promise<unknown> {
  const bytes = await readBoundedBytes(response, signal)
  try {
    const text = new TextDecoder().decode(bytes)
    return text === '' ? {} : JSON.parse(text)
  } catch (error) {
    throw new LlmError('CPA image generation upstream returned invalid JSON', 'INVALID_RESPONSE', { cause: error })
  }
}

async function readBoundedBytes(response: Response, signal: AbortSignal | null | undefined): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {})
    throw new LlmError('CPA image generation response exceeds 4 MiB', 'RESPONSE_TOO_LARGE')
  }
  if (!response.body) {
    let arrayBuffer: ArrayBuffer
    try {
      arrayBuffer = await response.arrayBuffer()
    } catch (error) {
      throw normalizeBodyReadError(error, signal)
    }
    const buffer = new Uint8Array(arrayBuffer)
    if (buffer.byteLength > MAX_RESPONSE_BYTES) {
      throw new LlmError('CPA image generation response exceeds 4 MiB', 'RESPONSE_TOO_LARGE')
    }
    return buffer
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      let part: ReadableStreamReadResult<Uint8Array>
      try {
        part = await reader.read()
      } catch (error) {
        throw normalizeBodyReadError(error, signal)
      }
      if (part.done) break
      total += part.value.byteLength
      if (total > MAX_RESPONSE_BYTES) {
        throw new LlmError('CPA image generation response exceeds 4 MiB', 'RESPONSE_TOO_LARGE')
      }
      chunks.push(part.value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function parseGptImage(body: unknown, fetchImpl: typeof fetch, signal: AbortSignal): Promise<CpaGeneratedImage> {
  const item = arrayItem(record(body)?.data, 0)
  if (typeof item?.b64_json === 'string' && item.b64_json !== '') {
    return {
      data: decodeBase64(item.b64_json),
      mediaType: 'image/png',
    }
  }
  if (typeof item?.url === 'string' && item.url !== '') {
    let response: Response
    try {
      response = await fetchImpl(item.url, { method: 'GET', signal })
    } catch (error) {
      if (error instanceof LlmError) throw error
      if (signal.aborted) throw abortError()
      throw new LlmError('CPA image generation request failed', 'TRANSPORT')
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new LlmError(`CPA image generation image download answered HTTP ${response.status}`, 'UPSTREAM_HTTP_ERROR')
    }
    let mediaType: CpaGeneratedImage['mediaType']
    try {
      mediaType = normalizeMediaType(response.headers.get('content-type'))
    } catch (error) {
      await response.body?.cancel().catch(() => {})
      throw error
    }
    const data = await readBoundedBytes(response, signal)
    if (data.byteLength === 0) {
      throw new LlmError('CPA image generation succeeded but returned no image', 'EMPTY_RESPONSE')
    }
    return {
      data,
      mediaType,
    }
  }
  throw new LlmError('CPA image generation succeeded but returned no image', 'EMPTY_RESPONSE')
}

function normalizeBodyReadError(error: unknown, signal: AbortSignal | null | undefined): LlmError {
  if (signal?.aborted === true || (typeof error === 'object' && error !== null && 'name' in error && error.name === 'AbortError')) {
    return abortError()
  }
  return new LlmError('CPA image generation response body read failed', 'TRANSPORT')
}

function abortError(): LlmError {
  return new LlmError('CPA image generation request aborted', 'ABORTED')
}

function parseGeminiImage(body: unknown): CpaGeneratedImage {
  const choice = arrayItem(record(body)?.choices, 0)
  const message = record(choice?.message)
  const image = arrayItem(message?.images, 0)
  const imageURL = record(image?.image_url)
  const url = imageURL?.url
  if (typeof url !== 'string' || url === '') {
    throw new LlmError('CPA image generation succeeded but returned no image', 'EMPTY_RESPONSE')
  }
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=]+)$/iu.exec(url)
  if (!match) {
    if (/^data:/iu.test(url)) throw new LlmError('CPA image generation returned an unsupported image media type', 'INVALID_RESPONSE')
    throw new LlmError('CPA image generation returned an invalid Gemini image payload', 'INVALID_RESPONSE')
  }
  const mediaType = normalizeMediaType(match[1])
  return {
    data: decodeBase64(match[2]!),
    mediaType,
  }
}

function normalizeMediaType(value: string | null | undefined): CpaGeneratedImage['mediaType'] {
  const mediaType = String(value ?? '').split(';', 1)[0]!.trim().toLowerCase()
  if (
    mediaType === 'image/png'
    || mediaType === 'image/jpeg'
    || mediaType === 'image/webp'
    || mediaType === 'image/gif'
  ) return mediaType
  if (SUPPORTED_MEDIA_TYPES.has(mediaType as CpaGeneratedImage['mediaType'])) return mediaType as CpaGeneratedImage['mediaType']
  throw new LlmError('CPA image generation returned an unsupported image media type', 'INVALID_RESPONSE')
}

function decodeBase64(value: string): Uint8Array {
  const normalized = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
  let binary: string
  try {
    binary = atob(normalized)
  } catch (error) {
    throw new LlmError('CPA image generation returned invalid base64 image data', 'INVALID_RESPONSE', { cause: error })
  }
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function arrayItem(value: unknown, index: number): RecordLike | undefined {
  return Array.isArray(value) ? record(value[index]) : undefined
}

function record(value: unknown): RecordLike | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as RecordLike
    : undefined
}
