/**
 * CPA image-generation stream path.
 *
 * The upstream `llm-pi-ai` adapter rejects assistant image output on replay
 * (@deepseek-ai/dsh-llm-pi-ai/lib/index.js:159), and the Harness content-block
 * vocabulary only carries images on the *input* side today. This module is the
 * plugin-owned escape hatch: when a CPA image model (`gpt-image-2`,
 * `gpt-image-1.5`, ...) is selected, the active provider path short-circuits
 * the chat `llm/stream` waterfall and calls `${baseURL}/images/generations`
 * itself, persists the generated raster through the durable attachment store,
 * and yields the same `StreamChunk` protocol the rest of the UI consumes.
 *
 * Image bytes never leave the Host: the plugin forwards the user prompt, model
 * name and a fixed generation envelope, then commits the returned `b64_json`
 * (or fetches a `url`) to `ctx.get('attachments').saveImage`.
 *
 * NOTE — known limitation: the generated image is surfaced as a model
 * `image` block, but the agent-loop / replay envelope cannot persist an
 * assistant image under the current DSH release, so the picture may not be
 * re-shown after a reload. See README "Image generation" for details.
 */
import { attributionHeaders, LlmError } from '@deepseek-ai/dsh-llm'

const IMAGE_GENERATION_MODELS = new Set([
  'gpt-image-1',
  'gpt-image-1.5',
  'gpt-image-2',
  'gpt-image-2-mini',
  'gpt-image-2-hd',
  'gpt-image-3',
])

const OUTPUT_FORMATS = new Set(['png', 'jpeg', 'webp'])
const QUALITIES = new Set(['auto', 'standard', 'hd'])

/** Append the OpenAI-compatible image endpoint to the configured API base. */
export function imageGenerationsURL(baseURL) {
  const trimmed = String(baseURL ?? '').trim().replace(/\/+$/, '')
  return `${trimmed}/images/generations`
}

/** True when the model is one this image path owns. */
export function isImageGenerationModel(model) {
  return typeof model === 'string'
    && (IMAGE_GENERATION_MODELS.has(model) || IMAGE_GENERATION_MODELS.has(model.replace(/-(mini|hd)$/u, '')))
}

/** Pull the most recent user text prompt from the request history. */
export function latestUserPrompt(messages) {
  const list = Array.isArray(messages) ? messages : []
  for (let i = list.length - 1; i >= 0; i -= 1) {
    const message = list[i]
    if (message?.role !== 'user') continue
    const text = contentToText(message.content)
    if (text) return text
  }
  return undefined
}

function contentToText(content) {
  if (typeof content === 'string') return content.trim() || undefined
  if (!Array.isArray(content)) return undefined
  const parts = []
  for (const block of content) {
    if (block?.type === 'text' && typeof block.text === 'string') {
      const value = block.text.trim()
      if (value) parts.push(value)
    }
  }
  return parts.length ? parts.join('\n') : undefined
}

/** Build the request envelope sent to CPA. */
export function buildImageRequest(model, prompt, overrides = {}) {
  const size = overrides.size ?? '1024x1024'
  const outputFormat = OUTPUT_FORMATS.has(overrides.outputFormat) ? overrides.outputFormat : 'png'
  const quality = QUALITIES.has(overrides.quality) ? overrides.quality : 'auto'
  return {
    model,
    prompt,
    n: 1,
    output_format: outputFormat,
    size,
    quality,
  }
}

/**
 * Generate one image and yield a minimal `StreamChunk` sequence. The actual
 * network + attachment persistence are injected so the logic is unit-testable
 * without real CPA access or a browser.
 *
 * @param options - the harness generate request (uses `model`, `messages`).
 * @param route - { baseURL, apiKeyEnv } describing the CPA route.
 * @param resolveApiKey - resolves the model key from a credential reference.
 * @param resolveAttachments - returns the Host attachment store (or a fake).
 * @param deps - testable seam: `fetchImpl` and `mediaTypeOf` overrides.
 */
export async function* streamCpaImage(options, route, resolveApiKey, resolveAttachments, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch
  const mediaTypeOf = deps.mediaTypeOf ?? inferMediaType
  if (typeof options?.messages === 'undefined') {
    throw new LlmError('CPA image generation requires a message history', 'INVALID_REQUEST')
  }
  const prompt = latestUserPrompt(options.messages)
  if (!prompt) {
    throw new LlmError('CPA image generation requires a user text prompt', 'UNSUPPORTED_CONTENT')
  }
  const apiKey = route.apiKeyEnv === undefined ? undefined : await resolveApiKey(route.apiKeyEnv)
  const attachments = resolveAttachments?.()
  if (attachments === undefined) {
    throw new LlmError('CPA image generation requires the attachment service', 'UNSUPPORTED_CONTENT')
  }
  const headers = {
    'content-type': 'application/json',
    accept: 'application/json',
    ...attributionHeaders(),
    ...apiKey === undefined ? {} : { authorization: `Bearer ${apiKey}` },
  }
  const body = JSON.stringify(buildImageRequest(options.model, prompt, deps.overrides ?? {}))
  let response
  let raw
  try {
    response = await fetchImpl(imageGenerationsURL(route.baseURL), {
      method: 'POST',
      headers,
      body,
      signal: options.signal,
    })
    raw = await response.text()
  } catch (error) {
    if (error instanceof LlmError) throw error
    throw new LlmError(`CPA image generation request failed: ${error instanceof Error ? error.message : String(error)}`, 'TRANSPORT')
  }
  let parsed
  try {
    parsed = raw === '' ? {} : JSON.parse(raw)
  } catch {
    parsed = {}
  }
  if (!response.ok) {
    const message = parsed?.error?.message
      ?? parsed?.message
      ?? parsed?.msg
      ?? raw.slice(0, 1000)
    throw new LlmError(`CPA image generation failed (HTTP ${response.status}): ${message}`, 'UPSTREAM_HTTP_ERROR')
  }
  const data = Array.isArray(parsed?.data)
    ? parsed.data
    : Array.isArray(parsed?.images)
      ? parsed.images
      : []
  if (data.length === 0) {
    throw new LlmError(`CPA image generation returned no image data (HTTP ${response.status}): ${raw.slice(0, 1000)}`, 'EMPTY_RESPONSE')
  }

  let index = 0
  const usage = emptyUsage()
  // The plugin yields exactly one image (n=1); iterate defensively so the
  // protocol shape survives a future multi-image response.
  for (const item of data) {
    const ref = await persistImage(item, attachments, mediaTypeOf, fetchImpl)
    const blockIndex = index
    yield { type: 'block-start', index: blockIndex, blockType: 'image' }
    yield { type: 'block-end', index: blockIndex, block: { type: 'image', attachment: ref } }
    usage.outputTokens += 1
    index += 1
  }
  if (index === 0) {
    throw new LlmError('CPA image generation produced no persistable image', 'EMPTY_RESPONSE')
  }
  yield { type: 'usage', usage }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

async function persistImage(item, attachments, mediaTypeOf, fetchImpl) {
  // b64_json takes precedence; a url is fetched and committed as bytes.
  if (typeof item?.b64_json === 'string' && item.b64_json.length > 0) {
    const mediaType = mediaTypeOf(item)
    const bytes = base64ToBytes(item.b64_json)
    return attachments.saveImage({ data: bytes, mediaType, ...item.filename ? { name: item.filename } : {} })
  }
  if (typeof item?.url === 'string' && item.url.length > 0) {
    const response = await fetchImpl(item.url)
    const buffer = new Uint8Array(await response.arrayBuffer())
    return attachments.saveImage({ data: buffer, mediaType: 'image/png', ...item.filename ? { name: item.filename } : {} })
  }
  throw new LlmError('CPA image generation response missing b64_json and url', 'EMPTY_RESPONSE')
}

function inferMediaType(item) {
  const format = typeof item?.output_format === 'string' ? item.output_format : undefined
  if (format === 'jpeg') return 'image/jpeg'
  if (format === 'webp') return 'image/webp'
  return 'image/png'
}

function base64ToBytes(value) {
  const normalized = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0 }
}

export function imageAttachmentRefLike(overrides = {}) {
  return {
    attachmentId: overrides.attachmentId ?? 'cpa-test-image',
    mediaType: (overrides.mediaType ?? 'image/png'),
    bytes: overrides.bytes ?? 1,
    width: overrides.width ?? 1024,
    height: overrides.height ?? 1024,
    ...overrides.name ? { name: overrides.name } : {},
  }
}
