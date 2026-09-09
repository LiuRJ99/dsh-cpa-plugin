import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'

export const IMAGE_GENERATION_SERVICE = 'dshCpaImageGeneration'

const MAX_RESPONSE_BYTES = 4 * 1024 * 1024
const GPT_MODEL = 'gpt-image-2'
const GEMINI_MODEL = 'gemini-3.1-flash-image'
const SUPPORTED_MEDIA_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'] as const)

export type ImageEngine = 'gpt' | 'gemini'
export type CpaImageMediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'

/** Browser-safe description of one CPA image-capable model. */
export interface CpaImageModel {
  id: string
  name: string
  aliases?: readonly string[]
  engine: ImageEngine
  supportsGenerate: boolean
  supportsEdit?: boolean
}

export interface CpaImageGenerationRequest {
  engine: ImageEngine
  /** Exact CPA model id; omitted for the legacy engine default. */
  model?: string
  prompt: string
  aspectRatio?: string
  imageSize?: string
  size?: string
  signal: AbortSignal
}

/** Provider-neutral image bytes resolved by the DSH Host. */
export interface CpaReferenceImage {
  data: Uint8Array
  mediaType: CpaImageMediaType
}

export interface CpaImageEditRequest {
  engine: ImageEngine
  /** Exact CPA model id; omitted for the legacy engine default. */
  model?: string
  prompt: string
  referenceImages: readonly CpaReferenceImage[]
  aspectRatio?: string
  imageSize?: string
  size?: string
  signal: AbortSignal
}

export interface CpaGeneratedImage {
  data: Uint8Array
  mediaType: CpaImageMediaType
  /** Canonical CPA model used for the request, when the Host resolved one. */
  model?: string
}

export interface CpaImageGenerationService {
  /** Optional for 0.4.x compatibility; present when the provider exposes a catalog. */
  listModels?(signal?: AbortSignal): Promise<readonly CpaImageModel[]>
  generate(request: CpaImageGenerationRequest): Promise<CpaGeneratedImage>
  /** Optional for 0.4.x compatibility; present when the provider supports editing. */
  edit?(request: CpaImageEditRequest): Promise<CpaGeneratedImage>
}

interface CpaImageGenerationRoute {
  baseURL: string
  apiKeyEnv?: string
}

interface ImageGenerationDeps {
  fetchImpl?: typeof fetch
  /** Host-owned image catalog; never called from the browser. */
  listModels?: (signal: AbortSignal) => Promise<readonly CpaImageModel[]>
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
  let cachedImageModels: readonly CpaImageModel[] | undefined
  const listModels = async (signal?: AbortSignal): Promise<readonly CpaImageModel[]> => {
    if (deps.listModels === undefined) return []
    const value = await deps.listModels(signal ?? new AbortController().signal)
    cachedImageModels = normalizeImageModels(value)
    return cachedImageModels
  }

  const resolveImageModel = async (
    engine: ImageEngine,
    requested: string | undefined,
    signal: AbortSignal,
    operation: 'generation' | 'editing',
  ): Promise<string> => {
    const fallback = defaultModelOf(engine)
    const modelId = normalizedOption(requested)
    let models: readonly CpaImageModel[] = modelId === undefined ? (cachedImageModels ?? []) : []
    if (modelId !== undefined && deps.listModels !== undefined) {
      try {
        models = await listModels(signal)
      } catch (error) {
        if (modelId === fallback) return fallback
        throw new LlmError(`CPA image ${operation} model catalog is unavailable`, 'INVALID_REQUEST', { cause: error })
      }
    }
    if (modelId === undefined) {
      return models.find(model => model.engine === engine && sameModelId(model.id, fallback) && model.supportsGenerate)?.id
        ?? models.find(model => model.engine === engine && model.supportsGenerate)?.id
        ?? fallback
    }
    if (models.length === 0) {
      if (modelId === fallback) return fallback
      throw new LlmError(`CPA image ${operation} model "${modelId}" is unavailable`, 'INVALID_REQUEST')
    }
    const match = models.find(model => model.engine === engine
      && model.supportsGenerate
      && (sameModelId(model.id, modelId) || model.aliases?.some(alias => sameModelId(alias, modelId))))
    if (match === undefined) throw new LlmError(`CPA image ${operation} model "${modelId}" is unavailable`, 'INVALID_REQUEST')
    if (operation === 'editing' && match.supportsEdit === false) {
      throw new LlmError(`CPA image model "${modelId}" does not support editing`, 'UNSUPPORTED_OPTION')
    }
    return match.id
  }

  const service: CpaImageGenerationService = {
    ...(deps.listModels === undefined ? {} : { listModels }),
    async generate(request) {
      if (request.signal.aborted) throw abortError()
      const prompt = request.prompt.trim()
      if (prompt === '') throw new LlmError('CPA image generation prompt must not be empty', 'INVALID_REQUEST')
      if (request.engine !== 'gpt' && request.engine !== 'gemini') {
        throw new LlmError(`Unsupported CPA image engine "${String(request.engine)}"`, 'INVALID_REQUEST')
      }

      const route = resolveRoute(request.engine)
      if (route === undefined) throw new LlmError(`CPA image route for engine "${request.engine}" is unavailable`, 'INVALID_REQUEST')
      const model = await resolveImageModel(request.engine, request.model, request.signal, 'generation')
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
            model,
            prompt,
            n: 1,
            output_format: 'png',
            size: request.size ?? request.imageSize ?? '1024x1024',
            quality: 'auto',
          }),
        })
        return { ...(await parseGptImage(response, fetchImpl, request.signal)), model }
      }

      const imageConfig = geminiImageConfigOf(request)
      const response = await requestJson(fetchImpl, chatCompletionsURL(route.baseURL), {
        method: 'POST',
        signal: request.signal,
        headers: cpaHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          stream: false,
          ...(imageConfig === undefined ? {} : {
            modalities: ['image'],
            image_config: imageConfig,
          }),
        }),
      })
      return { ...parseGeminiImage(response), model }
    },

    async edit(request) {
      if (request.signal.aborted) throw abortError()
      const prompt = request.prompt.trim()
      if (prompt === '') throw new LlmError('CPA image editing prompt must not be empty', 'INVALID_REQUEST')
      if (request.engine !== 'gpt' && request.engine !== 'gemini') {
        throw new LlmError(`Unsupported CPA image engine "${String(request.engine)}"`, 'INVALID_REQUEST')
      }
      const referenceImages = checkedReferenceImages(request.referenceImages)
      const route = resolveRoute(request.engine)
      if (route === undefined) throw new LlmError(`CPA image route for engine "${request.engine}" is unavailable`, 'INVALID_REQUEST')
      const model = await resolveImageModel(request.engine, request.model, request.signal, 'editing')
      const apiKey = await readRequiredCredential(readCredential, route.apiKeyEnv)

      if (request.engine === 'gpt') {
        if (request.aspectRatio !== undefined) {
          throw new LlmError('CPA GPT image editing does not support aspectRatio', 'UNSUPPORTED_OPTION')
        }
        const form = new FormData()
        const field = referenceImages.length === 1 ? 'image' : 'image[]'
        referenceImages.forEach((image, index) => {
          const bytes = new Uint8Array(image.data)
          form.append(field, new Blob([bytes], { type: image.mediaType }), `reference-${index + 1}.${extensionOf(image.mediaType)}`)
        })
        form.append('model', model)
        form.append('prompt', prompt)
        form.append('size', request.size ?? request.imageSize ?? '1024x1024')
        form.append('quality', 'auto')
        const response = await requestJson(fetchImpl, imageEditsURL(route.baseURL), {
          method: 'POST',
          signal: request.signal,
          headers: cpaHeaders(apiKey, false),
          body: form,
        }, 'CPA image editing')
        return { ...(await parseGptImage(response, fetchImpl, request.signal, 'CPA image editing')), model }
      }

      const imageConfig = geminiImageConfigOf(request)
      const content = [
        { type: 'text', text: prompt },
        ...referenceImages.map(image => ({
          type: 'image_url',
          image_url: { url: imageDataURL(image) },
        })),
      ]
      const response = await requestJson(fetchImpl, chatCompletionsURL(route.baseURL), {
        method: 'POST',
        signal: request.signal,
        headers: cpaHeaders(apiKey),
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content }],
          stream: false,
          modalities: ['image'],
          ...(imageConfig === undefined ? {} : { image_config: imageConfig }),
        }),
      }, 'CPA image editing')
      return { ...parseGeminiImage(response, 'CPA image editing'), model }
    },
  }
  return service
}

function defaultModelOf(engine: ImageEngine): string {
  return engine === 'gpt' ? GPT_MODEL : GEMINI_MODEL
}

function normalizeImageModels(value: readonly CpaImageModel[]): CpaImageModel[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value.flatMap(candidate => {
    if (typeof candidate !== 'object' || candidate === null) return []
    const id = normalizedOption(candidate.id)
    const name = normalizedOption(candidate.name) ?? id
    const engine = candidate.engine
    const key = id?.toLowerCase()
    if (id === undefined || name === undefined || id.length > 256 || name.length > 256 || (engine !== 'gpt' && engine !== 'gemini') || candidate.supportsGenerate !== true || key === undefined || seen.size >= 256 || seen.has(key)) return []
    seen.add(key)
    const rawAliases: readonly unknown[] = Array.isArray(candidate.aliases) ? candidate.aliases : []
    const aliases = [...new Set(rawAliases.flatMap((alias: unknown) => typeof alias === 'string' && normalizedOption(alias) !== undefined ? [normalizedOption(alias)!] : []))]
    return [{
      id,
      name,
      ...(aliases.length === 0 ? {} : { aliases }),
      engine,
      supportsGenerate: true,
      ...(candidate.supportsEdit === undefined ? {} : { supportsEdit: candidate.supportsEdit === true }),
    }]
  })
}

function sameModelId(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
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

function checkedReferenceImages(value: readonly CpaReferenceImage[]): CpaReferenceImage[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new LlmError('CPA image editing requires at least one reference image', 'INVALID_REQUEST')
  }
  let totalBytes = 0
  return value.map((image, index) => {
    if (typeof image !== 'object' || image === null || !(image.data instanceof Uint8Array) || image.data.byteLength === 0) {
      throw new LlmError(`CPA image editing reference image ${String(index + 1)} is invalid`, 'INVALID_REQUEST')
    }
    if (!SUPPORTED_MEDIA_TYPES.has(image.mediaType)) {
      throw new LlmError(`CPA image editing reference image ${String(index + 1)} has an unsupported media type`, 'INVALID_REQUEST')
    }
    totalBytes += image.data.byteLength
    if (totalBytes > MAX_RESPONSE_BYTES * 8) {
      throw new LlmError('CPA image editing reference images exceed the 32 MiB input limit', 'INVALID_REQUEST')
    }
    return { data: new Uint8Array(image.data), mediaType: image.mediaType }
  })
}

function imageDataURL(image: CpaReferenceImage): string {
  return `data:${image.mediaType};base64,${Buffer.from(image.data).toString('base64')}`
}

function extensionOf(mediaType: CpaImageMediaType): string {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/webp') return 'webp'
  if (mediaType === 'image/gif') return 'gif'
  return 'png'
}

function cpaHeaders(apiKey: string, json = true): HeadersInit {
  return {
    ...(json ? { 'content-type': 'application/json' } : {}),
    accept: 'application/json',
    ...attributionHeaders(),
    authorization: `Bearer ${apiKey}`,
  }
}

function imageGenerationsURL(baseURL: string): string {
  return new URL('images/generations', ensureBaseURL(baseURL)).toString()
}

function imageEditsURL(baseURL: string): string {
  return new URL('images/edits', ensureBaseURL(baseURL)).toString()
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

async function requestJson(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  label = 'CPA image generation',
): Promise<unknown> {
  let response: Response
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    if (error instanceof LlmError) throw error
    if (init.signal?.aborted) throw abortError()
    throw new LlmError(`${label} request failed`, 'TRANSPORT')
  }

  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    throw new LlmError(`${label} upstream answered HTTP ${response.status}`, 'UPSTREAM_HTTP_ERROR')
  }
  return readBoundedJson(response, init.signal, label)
}

async function readBoundedJson(
  response: Response,
  signal: AbortSignal | null | undefined,
  label = 'CPA image generation',
): Promise<unknown> {
  const bytes = await readBoundedBytes(response, signal)
  try {
    const text = new TextDecoder().decode(bytes)
    return text === '' ? {} : JSON.parse(text)
  } catch (error) {
    throw new LlmError(`${label} upstream returned invalid JSON`, 'INVALID_RESPONSE', { cause: error })
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

async function parseGptImage(
  body: unknown,
  fetchImpl: typeof fetch,
  signal: AbortSignal,
  label = 'CPA image generation',
): Promise<CpaGeneratedImage> {
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
      throw new LlmError(`${label} request failed`, 'TRANSPORT')
    }
    if (!response.ok) {
      await response.body?.cancel().catch(() => {})
      throw new LlmError(`${label} image download answered HTTP ${response.status}`, 'UPSTREAM_HTTP_ERROR')
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
      throw new LlmError(`${label} succeeded but returned no image`, 'EMPTY_RESPONSE')
    }
    return {
      data,
      mediaType,
    }
  }
  throw new LlmError(`${label} succeeded but returned no image`, 'EMPTY_RESPONSE')
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

function parseGeminiImage(body: unknown, label = 'CPA image generation'): CpaGeneratedImage {
  const choice = arrayItem(record(body)?.choices, 0)
  const message = record(choice?.message)
  const image = arrayItem(message?.images, 0)
  const imageURL = record(image?.image_url)
  const url = imageURL?.url
  if (typeof url !== 'string' || url === '') {
    throw new LlmError(`${label} succeeded but returned no image`, 'EMPTY_RESPONSE')
  }
  const match = /^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=]+)$/iu.exec(url)
  if (!match) {
    if (/^data:/iu.test(url)) throw new LlmError(`${label} returned an unsupported image media type`, 'INVALID_RESPONSE')
    throw new LlmError(`${label} returned an invalid Gemini image payload`, 'INVALID_RESPONSE')
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
