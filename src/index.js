import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { assertUsableApiKey, attributionHeaders } from '@deepseek-ai/dsh-llm'
import { Config as PiAiConfig } from '@deepseek-ai/dsh-llm-pi-ai'
import { deepEqualJson, settingsNamespace } from '@deepseek-ai/dsh-settings'
import { catalogURL, readCodexCatalog } from './catalog.js'
// The account/quota/speed functionality is an add-on. The upstream provider
// below remains responsible for discovery, profile synchronization, and the
// actual CLIProxyAPI model route.
import { apply as applyCpaAddon } from '../lib/index.js'

const MAX_CATALOG_BYTES = 4 * 1024 * 1024
const DISCOVERY_HANDOFF_TTL_MS = 60000
const MAX_DISCOVERY_HANDOFFS = 8
const DISCOVERY_NS = settingsNamespace('llm-cliproxyapi')
const PI_NS = settingsNamespace('llm-pi-ai')
const API_KEY_REF = credentialRef('DSH_CLIPROXY_API_KEY')
const PROVIDER = 'CLIProxyAPI'
const MODEL_REFRESH_EVENT = 'dsh-cpa/refresh-models'
const REFRESH_SETTINGS_NS = 'dsh-cpa-plugin'
const REFRESH_INTERVALS = new Set([0, 5 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000, 3 * 60 * 60 * 1000, 5 * 60 * 60 * 1000])

export const PROFILE_SYNC_HEADER = 'x-dsh-provider-cpa-sync'
export const PLACEHOLDER_AUTHORIZATION = 'Bearer dsh-cliproxyapi-no-key'

export const name = 'llm-cliproxyapi'
export const inject = ['settings', 'credentials', 'llm', 'timer']

export const Config = z.object({
  defaultContextWindow: z.number().step(1).min(1).default(262144),
  defaultMaxTokens: z.number().step(1).min(1).default(32768),
  defaultInput: z.array(z.union(['text', 'image'])).default(['text']),
  headers: z.dict(z.string()).default({}),
  fetchTimeoutMs: z.number().step(1).min(1).default(15000),
  retryInitialMs: z.number().step(1).min(1).default(3000),
  retryMaxMs: z.number().step(1).min(1).default(60000),
  refreshIntervalMs: z.number().step(1).min(0).default(300000),
})

function normalizedBaseURL(value) {
  const baseURL = String(value ?? '').trim().replace(/\/+$/, '')
  if (!baseURL) throw new TypeError('CLIProxyAPI baseURL must not be empty')
  let parsed
  try {
    parsed = new URL(baseURL)
  } catch (error) {
    throw new TypeError('CLIProxyAPI baseURL must be a valid URL', { cause: error })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new TypeError('CLIProxyAPI baseURL must use http or https')
  }
  return baseURL
}

function headerKey(headers, expected) {
  const normalized = expected.toLowerCase()
  return Object.keys(headers ?? {}).find((key) => key.toLowerCase() === normalized)
}

function profileSyncValue(profile) {
  const key = headerKey(profile?.headers, PROFILE_SYNC_HEADER)
  return key === undefined ? undefined : String(profile.headers[key])
}

function profileSynchronizationPending(profile) {
  return profileSyncValue(profile) !== undefined
}

function profileHasRichBootstrap(profile) {
  return profileSyncValue(profile)?.startsWith('rich:') ?? false
}

function mergedHeadersOf(profileHeaders, configuredHeaders) {
  const headers = { ...configuredHeaders, ...profileHeaders }
  const sync = headerKey(headers, PROFILE_SYNC_HEADER)
  if (sync !== undefined) delete headers[sync]
  return headers
}

function catalogHeadersOf(profileHeaders, configuredHeaders) {
  const headers = mergedHeadersOf(profileHeaders, configuredHeaders)
  const authorization = headerKey(headers, 'authorization')
  if (authorization !== undefined && headers[authorization] === PLACEHOLDER_AUTHORIZATION) {
    delete headers[authorization]
  }
  return headers
}

function profileHeadersOf(profileHeaders, configuredHeaders, hasApiKey) {
  const headers = mergedHeadersOf(profileHeaders, configuredHeaders)

  const authorization = headerKey(headers, 'authorization')
  if (hasApiKey) {
    if (authorization !== undefined && headers[authorization] === PLACEHOLDER_AUTHORIZATION) {
      delete headers[authorization]
    }
  } else if (authorization === undefined) {
    headers.authorization = PLACEHOLDER_AUTHORIZATION
  }
  return headers
}

async function optionalApiKey(ctx, supplied) {
  const raw = supplied === undefined
    ? (await ctx.credentials.resolve(API_KEY_REF))?.value
    : supplied
  if (raw === undefined || raw.length === 0) return undefined
  return assertUsableApiKey(raw, 'llm-cliproxyapi', API_KEY_REF)
}

function timedSignal(parent, timeoutMs) {
  const controller = new AbortController()
  const timeoutError = new Error(`CLIProxyAPI model catalog timed out after ${timeoutMs} ms`)
  timeoutError.name = 'TimeoutError'
  const forwardAbort = () => controller.abort(parent.reason)
  if (parent?.aborted) forwardAbort()
  else parent?.addEventListener('abort', forwardAbort, { once: true })
  const timer = setTimeout(() => controller.abort(timeoutError), timeoutMs)
  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer)
      parent?.removeEventListener('abort', forwardAbort)
    },
  }
}

async function readBoundedJson(response) {
  const declared = Number(response.headers.get('content-length') ?? Number.NaN)
  if (Number.isFinite(declared) && declared > MAX_CATALOG_BYTES) {
    await response.body?.cancel()
    throw new Error('CLIProxyAPI model catalog exceeds 4 MiB')
  }
  if (!response.body) return JSON.parse(await response.text())
  const reader = response.body.getReader()
  const chunks = []
  let total = 0
  try {
    for (;;) {
      const part = await reader.read()
      if (part.done) break
      total += part.value.byteLength
      if (total > MAX_CATALOG_BYTES) throw new Error('CLIProxyAPI model catalog exceeds 4 MiB')
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
  return JSON.parse(new TextDecoder().decode(bytes))
}

async function discoverCatalog(ctx, options, suppliedApiKey, parentSignal) {
  const apiKey = await optionalApiKey(ctx, suppliedApiKey)
  const baseURL = normalizedBaseURL(options.baseURL)
  const url = catalogURL(baseURL)
  const request = timedSignal(parentSignal, options.fetchTimeoutMs)
  try {
    let response
    try {
      response = await fetch(url, {
        method: 'GET',
        signal: request.signal,
        headers: {
          accept: 'application/json',
          ...options.headers,
          ...(apiKey ? { authorization: 'Bearer ' + apiKey } : {}),
          ...attributionHeaders(),
        },
      })
    } catch (error) {
      if (request.signal.aborted) throw request.signal.reason ?? error
      throw new Error('Could not reach CLIProxyAPI at ' + url, { cause: error })
    }
    if (!response.ok) {
      throw new Error('CLIProxyAPI model catalog answered ' + response.status + ((response.status === 401 || response.status === 403) ? '; save a valid API key in Settings' : ''))
    }
    let body
    try {
      body = await readBoundedJson(response)
    } catch (error) {
      if (request.signal.aborted) throw request.signal.reason ?? error
      throw new Error('CLIProxyAPI model catalog did not return usable JSON', { cause: error })
    }
    try {
      return {
        models: readCodexCatalog(body, options),
        hasApiKey: apiKey !== undefined,
      }
    } catch (error) {
      throw new Error('Expected the CLIProxyAPI Codex catalog with a "models" array', { cause: error })
    }
  } finally {
    request.dispose()
  }
}

function sortedHeaders(headers) {
  return Object.fromEntries(Object.entries(headers).sort(([left], [right]) => {
    return left.toLowerCase().localeCompare(right.toLowerCase())
  }))
}

function refreshKeyOf(profile, config) {
  if (!profile) return undefined
  return JSON.stringify({
    displayName: profile.displayName,
    api: profile.api,
    baseURL: String(profile.baseURL ?? '').trim().replace(/\/+$/, ''),
    models: profile.models,
    defaultContextWindow: profile.defaultContextWindow,
    defaultMaxTokens: profile.defaultMaxTokens,
    defaultInput: profile.defaultInput,
    headers: sortedHeaders(catalogHeadersOf(profile.headers, config.headers)),
  })
}

async function profileOf(profile, models, hasApiKey, config) {
  const {
    apiKeyEnv: _previousApiKeyEnv,
    modelOverrides: _previousModelOverrides,
    ...rest
  } = profile
  const candidate = {
    ...rest,
    displayName: PROVIDER,
    api: 'openai-responses',
    baseURL: normalizedBaseURL(profile.baseURL),
    // Discovery supplies the initial capacities, while values already present
    // in the profile are user-owned overrides. This keeps a later catalog
    // refresh from undoing a manual context-window correction.
    models: mergeModelCapacities(profile.models, models),
    defaultContextWindow: profile.defaultContextWindow ?? config.defaultContextWindow,
    defaultMaxTokens: profile.defaultMaxTokens ?? config.defaultMaxTokens,
    defaultInput: [...config.defaultInput],
    headers: profileHeadersOf(profile.headers, config.headers, hasApiKey),
    ...(hasApiKey ? { apiKeyEnv: API_KEY_REF } : {}),
  }
  const validated = await PiAiConfig['~standard'].validate({ providers: { [PROVIDER]: candidate } })
  if (validated.issues?.length) {
    throw new Error(`llm-pi-ai rejected the generated provider profile: ${validated.issues[0].message}`)
  }
  return validated.value.providers[PROVIDER]
}

function mergeModelCapacities(previous, discovered) {
  const previousById = new Map(
    Array.isArray(previous)
      ? previous.flatMap((model) => {
        const id = typeof model?.id === 'string' && model.id.trim() !== '' ? model.id.trim() : undefined
        return id === undefined ? [] : [[id, model]]
      })
      : [],
  )
  return discovered.map((model) => {
    const old = previousById.get(model.id)
    if (!old || typeof old !== 'object') return model
    return {
      ...model,
      ...old.contextWindow === undefined ? {} : { contextWindow: old.contextWindow },
      ...old.maxTokens === undefined ? {} : { maxTokens: old.maxTokens },
    }
  })
}

function retryDelay(config, failures) {
  return Math.min(config.retryInitialMs * (2 ** Math.max(0, failures - 1)), config.retryMaxMs)
}

function refreshIntervalOf(ctx, config) {
  const value = ctx.settings.get(REFRESH_SETTINGS_NS)?.refreshIntervalMs
  return Number.isInteger(value) && REFRESH_INTERVALS.has(value) ? value : config.refreshIntervalMs
}

export function apply(ctx, config) {
  if (!config.defaultInput.length) throw new Error('defaultInput must contain at least one modality')
  if (config.retryMaxMs < config.retryInitialMs) throw new Error('retryMaxMs must be greater than or equal to retryInitialMs')

  // The upstream provider is also exercised with a deliberately small fake
  // Context in its Node tests. The additive account/quota layer only needs
  // Cordis' extension seam, so keep the original host path usable without it.
  const cpaAddon = typeof ctx.inject === 'function'
    ? applyCpaAddon(ctx, {
      endpoint: 'http://localhost:8317',
      // The upstream model provider itself remains owned by the original
      // CLIProxyAPI profile above; the add-on contributes account/quota data.
      providerId: 'cpa',
      managementKeyEnv: 'CPA_MANAGEMENT_KEY',
      timeoutMs: config.fetchTimeoutMs,
      refreshIntervalMs: config.refreshIntervalMs,
      registerDiscovery: false,
    })
    : undefined

  const catalogFor = (profile, signal) => discoverCatalog(ctx, {
    baseURL: profile.baseURL,
    defaultContextWindow: config.defaultContextWindow,
    defaultMaxTokens: config.defaultMaxTokens,
    defaultInput: config.defaultInput,
    headers: catalogHeadersOf(profile.headers, config.headers),
    fetchTimeoutMs: config.fetchTimeoutMs,
  }, undefined, signal)

  const discoveryHandoffs = new Map()

  const rememberDiscovery = (baseURL, models) => {
    const now = Date.now()
    for (const [key, handoff] of discoveryHandoffs) {
      if (now - handoff.storedAt > DISCOVERY_HANDOFF_TTL_MS) discoveryHandoffs.delete(key)
    }
    while (discoveryHandoffs.size >= MAX_DISCOVERY_HANDOFFS) {
      discoveryHandoffs.delete(discoveryHandoffs.keys().next().value)
    }
    discoveryHandoffs.set(normalizedBaseURL(baseURL), {
      models: structuredClone(models),
      storedAt: now,
    })
  }

  const takeDiscovery = (baseURL) => {
    const key = normalizedBaseURL(baseURL)
    const handoff = discoveryHandoffs.get(key)
    discoveryHandoffs.delete(key)
    if (!handoff || Date.now() - handoff.storedAt > DISCOVERY_HANDOFF_TTL_MS) return undefined
    return handoff.models
  }

  ctx.llm.registerModelDiscovery(DISCOVERY_NS, async (request) => {
    const catalog = await discoverCatalog(ctx, {
      baseURL: request.baseURL,
      defaultContextWindow: config.defaultContextWindow,
      defaultMaxTokens: config.defaultMaxTokens,
      defaultInput: config.defaultInput,
      headers: config.headers,
      fetchTimeoutMs: config.fetchTimeoutMs,
    }, request.apiKey, request.signal)
    // The native Models settings page replaces the model list with the result
    // of this discovery call. Preserve capacities already stored for the same
    // provider endpoint so clicking "fetch available models" cannot erase a
    // user's manual context-window or max-output correction.
    const currentProfile = ctx.settings.get(PI_NS)?.providers?.[PROVIDER]
    const previousModels = typeof currentProfile?.baseURL === 'string'
      && normalizedBaseURL(currentProfile.baseURL) === normalizedBaseURL(request.baseURL)
      ? currentProfile.models
      : undefined
    const models = mergeModelCapacities(previousModels, catalog.models)
    rememberDiscovery(request.baseURL, models)
    return models
  })

  let observedRefreshKey

  const synchronize = async (signal, authOnly = false) => {
    const section = ctx.settings.get(PI_NS)
    if (section === undefined) throw new Error('The built-in llm-pi-ai settings namespace is not ready')
    const profile = section.providers?.[PROVIDER]
    if (!profile) return false
    if (authOnly && profileSynchronizationPending(profile)) return true
    if (signal.aborted) throw signal.reason
    const hasApiKey = async () => (await optionalApiKey(ctx)) !== undefined
    let catalog
    if (authOnly) {
      catalog = { models: profile.models, hasApiKey: await hasApiKey() }
    } else if (profileHasRichBootstrap(profile)) {
      const discovered = takeDiscovery(profile.baseURL)
      catalog = discovered
        ? { models: discovered, hasApiKey: await hasApiKey() }
        : await catalogFor(profile, signal)
    } else {
      catalog = await catalogFor(profile, signal)
    }
    if (signal.aborted) throw signal.reason
    const next = await profileOf(profile, catalog.models, catalog.hasApiKey, config)
    if (!deepEqualJson(next, profile)) {
      observedRefreshKey = refreshKeyOf(next, config)
      await ctx.settings.mutate(PI_NS, [{
        op: 'set',
        path: ['providers', PROVIDER],
        value: next,
      }])
    }
    if (!authOnly && cpaAddon !== undefined) {
      try {
        await cpaAddon.refreshAccounts(signal)
      } catch (error) {
        if (signal.aborted) throw signal.reason ?? error
        const message = error instanceof Error ? error.message : String(error)
        ctx.logger.warn('CLIProxyAPI account/quota refresh failed: ' + message)
      }
    }
    return true
  }

  let stopped = false
  let running = false
  let rerun = false
  let authOnlyRequested = false
  let throwOnErrorRequested = false
  let activeController
  let wakeDispose
  let drainPromise
  let failures = 0
  let lastError = ''

  const cancelWake = () => {
    wakeDispose?.()
    wakeDispose = undefined
  }

  const drain = async () => {
    if (running || stopped) return
    running = true
    try {
      while (rerun && !stopped) {
        rerun = false
        const authOnly = authOnlyRequested
        authOnlyRequested = false
        const throwOnError = throwOnErrorRequested
        throwOnErrorRequested = false
        const controller = new AbortController()
        activeController = controller
        try {
          const hasProfile = await synchronize(controller.signal, authOnly)
          failures = 0
          lastError = ''
          if (authOnly) rerun = true
          else if (hasProfile && !rerun) wakeAfter(refreshIntervalOf(ctx, config))
        } catch (error) {
          if (controller.signal.aborted || stopped) continue
          failures += 1
          const message = error instanceof Error ? error.message : String(error)
          if (message !== lastError) {
            ctx.logger.warn('CLIProxyAPI provider refresh failed: ' + message)
            lastError = message
          }
          if (throwOnError) throw error
          wakeAfter(retryDelay(config, failures))
          break
        } finally {
          if (activeController === controller) activeController = undefined
        }
      }
    } finally {
      running = false
      if (rerun && !wakeDispose && !stopped) void startDrain()
    }
  }

  const startDrain = () => {
    if (running || stopped) return drainPromise ?? Promise.resolve()
    drainPromise = drain()
    return drainPromise
  }

  const wakeAfter = (delay) => {
    cancelWake()
    if (delay <= 0) return
    wakeDispose = ctx.timeout(() => {
      wakeDispose = undefined
      rerun = true
      void startDrain()
    }, delay)
  }

  const schedule = ({ authOnly = false, throwOnError = false } = {}) => {
    if (stopped) return Promise.resolve()
    // A full refresh supersedes a pending auth-only pass. This keeps the
    // unified manual refresh from being downgraded to a credential update.
    if (authOnly) authOnlyRequested = true
    else authOnlyRequested = false
    if (throwOnError) throwOnErrorRequested = true
    cancelWake()
    rerun = true
    activeController?.abort(new Error('CLIProxyAPI provider refresh superseded'))
    return startDrain()
  }

  ctx.on(MODEL_REFRESH_EVENT, () => schedule({ throwOnError: true }))

  const scheduleFromSettings = (force = false) => {
    const profile = ctx.settings.get(PI_NS)?.providers?.[PROVIDER]
    const refreshKey = refreshKeyOf(profile, config)
    if (!force && refreshKey === observedRefreshKey) return
    observedRefreshKey = refreshKey
    schedule()
  }

  ctx.on('settings/updated', (ns) => {
    if (ns === PI_NS) scheduleFromSettings()
    else if (ns === REFRESH_SETTINGS_NS) schedule()
  })
  ctx.on('credentials/updated', (ref) => {
    if (ref === API_KEY_REF) schedule({ authOnly: true })
  })

  ctx.effect(() => () => {
    stopped = true
    cancelWake()
    activeController?.abort(new Error('CLIProxyAPI provider plugin disposed'))
  })

  scheduleFromSettings(true)
}
