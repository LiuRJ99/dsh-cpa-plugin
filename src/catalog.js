const CANONICAL_REASONING_LEVELS = new Set([
  'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max',
])

function positiveInteger(...values) {
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  }
}

function nonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
}

function normalizeReasoningLevel(value) {
  const wire = nonEmptyString(value)?.toLowerCase()
  if (!wire) return undefined
  if (wire === 'none' || wire === 'off') return { canonical: 'off', wire: 'none' }
  if (wire === 'ultra') return { canonical: 'max', wire }
  if (!CANONICAL_REASONING_LEVELS.has(wire)) return undefined
  return { canonical: wire, wire }
}

export function reasoningEffortsOf(entry) {
  if (!Array.isArray(entry?.supported_reasoning_levels)) return undefined
  const efforts = {}
  for (const raw of entry.supported_reasoning_levels) {
    const normalized = normalizeReasoningLevel(typeof raw === 'string' ? raw : raw?.effort)
    if (normalized && !(normalized.canonical in efforts)) efforts[normalized.canonical] = normalized.wire
  }
  // llm-pi-ai rejects a capability map that offers only "off". Omitting the
  // field correctly describes a non-reasoning model for a hand-declared route.
  if (Object.keys(efforts).every((level) => level === 'off')) return undefined
  return Object.keys(efforts).length ? efforts : undefined
}

function inputModalitiesOf(entry, fallback) {
  if (!Array.isArray(entry?.input_modalities)) return [...fallback]
  const modalities = []
  const seen = new Set()
  for (const raw of entry.input_modalities) {
    const value = nonEmptyString(raw)?.toLowerCase()
    if ((value === 'text' || value === 'image') && !seen.has(value)) {
      seen.add(value)
      modalities.push(value)
    }
  }
  return modalities.length ? modalities : [...fallback]
}

export function modelProfileOf(entry, options = {}) {
  const id = nonEmptyString(entry?.slug, entry?.id, entry?.model)
  if (!id || (!options.includeHiddenModels && entry?.visibility === 'hide')) return undefined
  const reasoningEfforts = reasoningEffortsOf(entry)
  return {
    id,
    name: nonEmptyString(entry?.display_name, entry?.name, entry?.description, id),
    contextWindow: positiveInteger(entry?.max_context_window, entry?.context_window, options.defaultContextWindow),
    maxTokens: positiveInteger(entry?.max_output_tokens, entry?.max_completion_tokens, entry?.max_tokens, options.defaultMaxTokens),
    input: inputModalitiesOf(entry, options.defaultInput ?? ['text']),
    ...(reasoningEfforts ? { reasoningEfforts } : {}),
  }
}

export function readCodexCatalog(body, options = {}) {
  if (!body || !Array.isArray(body.models)) throw new TypeError('CLIProxyAPI model catalog has no "models" array')
  const models = []
  const seen = new Set()
  for (const entry of body.models) {
    const model = modelProfileOf(entry, options)
    if (!model || seen.has(model.id)) continue
    seen.add(model.id)
    models.push(model)
  }
  if (!models.length) throw new TypeError('CLIProxyAPI model catalog contains no usable models')
  return models
}

export function catalogURL(baseURL) {
  const base = String(baseURL ?? '').trim().replace(/\/+$/, '')
  if (!base) throw new TypeError('CLIProxyAPI baseURL must not be empty')
  const query = new URLSearchParams({ client_version: 'dsh-cpa-plugin' })
  return base + '/models?' + query
}
