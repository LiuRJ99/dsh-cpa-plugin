/**
 * DeepSeek Harness external plugin — Host half.
 *
 * The package owns a small `/cpa` Connection RPC channel. The browser only
 * receives redacted account projections; the CPA management key is resolved
 * on the Host for every request.
 */
import { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { installSettingsSection, settingsNamespace } from '@deepseek-ai/dsh-settings'
import type { HostConnectionHandle } from '@deepseek-ai/dsh-client-connection'
import type { RpcResult } from '@deepseek-ai/dsh-host-apiproxy/api'
// @ts-expect-error Runtime JS module is exported without a sibling declaration file.
import { isImageOnlyModel } from './catalog.js'
import { streamCpaFast } from './cpa-fast-stream.ts'
import type { CpaFastRoute } from './cpa-fast-stream.ts'
import {
  createCpaImageGenerationService,
  IMAGE_GENERATION_SERVICE,
  type CpaImageGenerationService,
} from './image-generation.ts'
import { discoverCpaModels } from './model-discovery.ts'
import { MODEL_CAPABILITY_SERVICE, PRIORITY_SERVICE_TIER, type ModelCapabilityProvider } from './model-capabilities.ts'
import { MODEL_EXECUTION_SERVICE, type ModelExecutionProvider } from './model-execution.ts'
import type { CpaAccount, CpaAccountModelsRequest, CpaAccountModelsView, CpaAccountSelection, CpaAccountsView, CpaConfigView, CpaInputModality, CpaModelCapabilitiesView, CpaModelCapability, CpaModelInputCapabilitiesView, CpaModelInputCapability, CpaQuota, CpaQuotaWindow, CpaRpcValue, CpaSpeed, CpaSpeedSelection } from './protocol.ts'

export const name = 'dsh-cpa-plugin'

/** The model settings namespace whose CPA route carries the endpoint/models. */
const MODEL_SETTINGS_NS = settingsNamespace('llm-pi-ai')
const MODEL_DISCOVERY_NS = settingsNamespace('llm-cliproxyapi')
const MODEL_KEY_REF = 'CPA_MODEL_API_KEY'
/** The native CLIProxyAPI provider's credential reference. */
const NATIVE_MODEL_KEY_REF = 'DSH_CLIPROXY_API_KEY'
const MODEL_REFRESH_EVENT = 'dsh-cpa/refresh-models'
const REFRESH_SETTINGS_NS = settingsNamespace('dsh-cpa-plugin')
const REFRESH_INTERVALS = [0, 5 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000, 3 * 60 * 60 * 1000, 5 * 60 * 60 * 1000] as const

type RefreshSettings = { refreshIntervalMs: number }
const RefreshSettings: z<RefreshSettings> = z.object({
  refreshIntervalMs: z.natural().min(0).default(300000),
})

export interface Config {
  /** CPA base URL, normally http://localhost:8317. */
  endpoint: string
  /** Model-provider group id used for the unified account/model refresh. */
  providerId: string
  /** Credential reference holding CPA's management key. */
  managementKeyEnv: string
  /** Host-side request timeout. */
  timeoutMs: number
  /** Unified model/catalog and account quota refresh interval. */
  refreshIntervalMs: number
  /**
   * Keep the add-on from taking ownership of the provider's model catalog.
   * The upstream provider remains the source of truth for model metadata.
   */
  registerDiscovery?: boolean
}

export const Config: z<Config> = z.object({
  endpoint: z.string().default('http://localhost:8317'),
  providerId: z.string().default('cpa'),
  managementKeyEnv: z.string().default('CPA_MANAGEMENT_KEY'),
  timeoutMs: z.natural().min(1000).default(8000),
  refreshIntervalMs: z.natural().min(0).default(300000),
  registerDiscovery: z.boolean().default(true),
})

// The Host half can also be composed in a base/headless profile where the
// browser connection service does not exist. The RPC is registered lazily
// below when a Web profile provides `connection`.
export const inject: string[] = []

export interface CpaAddonHandle {
  /** Refresh and cache account status plus provider-specific quota data. */
  refreshAccounts: (signal: AbortSignal) => Promise<CpaAccountsView>
  /** Read the latest Host-side account snapshot without forcing upstream usage calls. */
  readAccounts: (signal: AbortSignal) => Promise<CpaAccountsView>
}

/** Apply the Host half without touching Harness or CLIProxyAPI source. */
export function apply(ctx: Context, config: Config): CpaAddonHandle {
  let readCredential: (ref: string) => Promise<string | undefined> = async (ref) => process.env[ref]
  let accountCacheKey = ''
  let accountCache: CpaAccountsView | undefined
  let accountRefreshPromise: Promise<CpaAccountsView> | undefined
  const selectedBySession = new Map<string, string | undefined>()
  let defaultSelectedAccount: string | undefined
  const speedBySessionModel = new Map<string, CpaSpeed>()
  const fastModelIds = new Set<string>()
  let capabilitiesCacheKey = ''
  let capabilitiesCache: CpaModelCapabilitiesView | undefined
  let capabilitiesPromise: Promise<CpaModelCapabilitiesView> | undefined
  let capabilitiesPromiseKey = ''
  let capabilitiesEpoch = 0
  const refreshEntry: RefreshSettings = { refreshIntervalMs: normalizeRefreshInterval(config.refreshIntervalMs) }

  installSettingsSection(ctx, REFRESH_SETTINGS_NS, RefreshSettings, refreshEntry, {
    setSource: () => {},
    onChange: () => {},
  })

  type CpaStreamOptions = Parameters<typeof streamCpaFast>[0]
  type CpaStream = ReturnType<typeof streamCpaFast>
  type CpaRequestExtension = { serviceTier?: unknown }

  // Credentials are optional at composition time. The environment fallback
  // keeps the plugin usable in a minimal profile; the normal web profile has
  // the provider-backed credential service and therefore never sends the key
  // to the browser.
  ctx.inject(['credentials'], (scope) => {
    readCredential = async (ref) => {
      try {
        const resolved = await scope.credentials.resolve(credentialRef(ref))
        return resolved?.value
      } catch (error) {
        return process.env[ref]
      }
    }
  })
  /**
   * The native CLIProxyAPI settings surface historically stored the model key
   * under DSH_CLIPROXY_API_KEY, while the add-on model editor defaults to
   * CPA_MODEL_API_KEY. Image generation is an add-on capability, so accept
   * either known reference and keep one DSH installation from requiring the
   * user to enter the same key twice.
   */
  const readImageCredential = async (ref: string): Promise<string | undefined> => {
    const primary = await readCredential(ref)
    if (primary !== undefined && primary.trim() !== '') return primary
    if (ref !== MODEL_KEY_REF && ref !== NATIVE_MODEL_KEY_REF) return primary
    const fallbackRef = ref === MODEL_KEY_REF ? NATIVE_MODEL_KEY_REF : MODEL_KEY_REF
    const fallback = await readCredential(fallbackRef)
    return fallback !== undefined && fallback.trim() !== '' ? fallback : primary
  }
  const imageService = createCpaImageGenerationService(
    (_engine) => {
      const route = cpaFastRoute(ctx, effectiveConfig(ctx, config))
      return route === undefined ? undefined : {
        baseURL: route.baseURL,
        apiKeyEnv: route.apiKeyEnv,
      }
    },
    readImageCredential,
  )
  ctx.provide(IMAGE_GENERATION_SERVICE, imageService satisfies CpaImageGenerationService)

  const capabilityCacheKeyOf = (currentConfig: Config): string => `${currentConfig.endpoint}\u0000${currentConfig.providerId}`
  const applyCapabilities = (value: CpaModelCapabilitiesView, key: string): CpaModelCapabilitiesView => {
    capabilitiesCacheKey = key
    capabilitiesCache = value
    fastModelIds.clear()
    for (const model of value.models) {
      if (!model.serviceTiers.some(tier => tier.id === PRIORITY_SERVICE_TIER)) continue
      if (isImageOnlyModel(model.id)) continue
      fastModelIds.add(model.id)
      for (const alias of model.aliases ?? []) {
        if (!isImageOnlyModel(alias)) fastModelIds.add(alias)
      }
    }
    return value
  }
  const invalidateModelCapabilities = (): void => {
    capabilitiesEpoch += 1
    capabilitiesCacheKey = ''
    capabilitiesCache = undefined
    capabilitiesPromise = undefined
    capabilitiesPromiseKey = ''
    fastModelIds.clear()
  }
  const loadModelCapabilities = (signal: AbortSignal): Promise<CpaModelCapabilitiesView> => {
    const epoch = capabilitiesEpoch
    const currentConfig = effectiveConfig(ctx, config)
    const key = capabilityCacheKeyOf(currentConfig)
    if (capabilitiesCache !== undefined && capabilitiesCacheKey === key) return Promise.resolve(capabilitiesCache)
    if (capabilitiesPromise !== undefined && capabilitiesPromiseKey === key) return capabilitiesPromise
    if (capabilitiesPromise !== undefined && capabilitiesPromiseKey !== key) invalidateModelCapabilities()
    const pending = fetchModelCapabilities(ctx, currentConfig, readCredential, signal).then(value => {
      if (epoch !== capabilitiesEpoch) return loadModelCapabilities(signal)
      return applyCapabilities(value, key)
    })
    capabilitiesPromise = pending
    capabilitiesPromiseKey = key
    void pending.then(
      () => { if (capabilitiesPromise === pending) { capabilitiesPromise = undefined; capabilitiesPromiseKey = '' } },
      () => { if (capabilitiesPromise === pending) { capabilitiesPromise = undefined; capabilitiesPromiseKey = '' } },
    )
    return pending
  }
  const capabilityProvider: ModelCapabilityProvider = {
    listModelCapabilities: async (signal) => {
      const value = await loadModelCapabilities(signal ?? new AbortController().signal)
      const provider = effectiveConfig(ctx, config).providerId
      return value.models.flatMap(model => [model.id, ...(model.aliases ?? [])].map(modelId => ({
        provider,
        model: modelId,
        serviceTiers: model.serviceTiers,
      })))
    },
  }
  ctx.provide(MODEL_CAPABILITY_SERVICE, capabilityProvider)

  const executionProvider: ModelExecutionProvider = {
    setSessionSpeed: (sessionId, provider, model, speed) => {
      if (provider !== effectiveConfig(ctx, config).providerId) return
      const key = speedKey(sessionId, model)
      if (speed === 'fast' && fastModelIds.has(model)) speedBySessionModel.set(key, 'fast')
      else speedBySessionModel.delete(key)
    },
  }
  ctx.provide(MODEL_EXECUTION_SERVICE, executionProvider)

  // Model discovery belongs to the upstream provider. The account/quota
  // add-on can still be used by itself in older profiles, so discovery is
  // retained as an opt-in compatibility path only.
  if (config.registerDiscovery !== false) {
    ctx.inject(['llm'], (scope) => {
      scope.llm.registerModelDiscovery(MODEL_DISCOVERY_NS, request => discoverCpaModels(
        request,
        () => readCredential(MODEL_KEY_REF),
      ))
    })
  }

  // The speed control is an external-plugin concern. The optional execution
  // bridge seeds session state for older DSH runtimes; newer runtimes also carry
  // the first-class serviceTier request field through the waterfall. The normal
  // route remains untouched when the user leaves the model at Standard.
  const handleCpaStream = (options: CpaStreamOptions, next: () => CpaStream): CpaStream => {
    const currentConfig = effectiveConfig(ctx, config)
    if (options.provider !== currentConfig.providerId || options.sessionId === undefined || fastModelIds.has(options.model) === false) return next()
    const extension = options as CpaStreamOptions & CpaRequestExtension
    const key = speedKey(String(options.sessionId), options.model)
    const requestedTier = extension.serviceTier === PRIORITY_SERVICE_TIER
    if (requestedTier) speedBySessionModel.set(key, 'fast')
    if (!requestedTier && speedBySessionModel.get(key) !== 'fast') return next()
    const route = cpaFastRoute(ctx, currentConfig)
    if (route === undefined) return next()
    return streamCpaFast(options, route, readCredential, () => ctx.get('attachments'))
  }
  // The workspace Harness package and the published plugin dependency may
  // carry different branded declaration copies during local development.
  // Their runtime stream protocol is the same; keep this compatibility cast
  // at the single middleware boundary instead of weakening the Host API.
  ctx.on('llm/stream', handleCpaStream as never)

  const cacheKeyOf = (currentConfig: Config): string => `${currentConfig.endpoint}\u0000${currentConfig.providerId}`
  const refreshAccounts = (signal: AbortSignal): Promise<CpaAccountsView> => {
    if (accountRefreshPromise !== undefined) return accountRefreshPromise
    const currentConfig = effectiveConfig(ctx, config)
    const promise = fetchAccounts(currentConfig, readCredential, signal, true).then(value => {
      accountCacheKey = cacheKeyOf(currentConfig)
      accountCache = value
      return value
    })
    accountRefreshPromise = promise
    const clear = (): void => {
      if (accountRefreshPromise === promise) accountRefreshPromise = undefined
    }
    void promise.then(clear, clear)
    return promise
  }
  const readAccounts = async (signal: AbortSignal): Promise<CpaAccountsView> => {
    const currentConfig = effectiveConfig(ctx, config)
    const key = cacheKeyOf(currentConfig)
    if (accountCache !== undefined && accountCacheKey === key) return accountCache
    const value = await fetchAccounts(currentConfig, readCredential, signal, false)
    accountCacheKey = key
    accountCache = value
    return value
  }

  ctx.inject(['connection'], (scope) => {
    const connection = scope.get('connection') as HostConnectionHandle
    void connection.rpc.handle('/cpa', async (endpoint, payload, signal) => {
      switch (endpoint) {
        case 'config':
          return ok(await configView(ctx, effectiveConfig(ctx, config), readCredential))
        case 'set-refresh-interval': {
          const intervalMs = parseRefreshInterval(payload)
          const settings = ctx.get('settings')
          if (settings === undefined) throw new Error('settings service is unavailable')
          await settings.mutate(REFRESH_SETTINGS_NS, [{
            op: 'set',
            path: ['refreshIntervalMs'],
            value: intervalMs,
          }])
          invalidateModelCapabilities()
           await refreshModelCatalog(ctx, signal)
          const current = await readAccounts(signal)
          const accounts = current.quotaFetchedAt === undefined ? await refreshAccounts(signal) : current
          return ok({ ...accounts, refreshIntervalMs: effectiveRefreshInterval(ctx, config) })
        }
        case 'accounts':
          return ok(await readAccounts(signal))
        case 'refresh': {
          invalidateModelCapabilities()
           await refreshModelCatalog(ctx, signal)
          // A user-triggered refresh must invalidate the Host-side snapshot.
          // `readAccounts()` is intentionally cache-friendly for model-scoped
          // consumers, but returning it here made Settings and the composer
          // keep different quota snapshots after one of them was refreshed.
          return ok(await refreshAccounts(signal))
        }
        case 'account-models': {
          const request = parseAccountModelsRequest(payload)
          return ok(await fetchAccountModels(effectiveConfig(ctx, config), readCredential, request, signal))
        }
        case 'model-capabilities':
          return ok(await loadModelCapabilities(signal))
        case 'model-input-capabilities':
          return ok(await fetchModelInputCapabilities(ctx, signal))
        case 'select-speed': {
          const selection = parseSpeedSelection(payload)
          // The UI may render a cached capability snapshot before the Host has
          // finished its first catalog request. Load capabilities on demand so
          // a valid Fast click is not silently normalized to Standard.
          if (selection.speed === 'fast' && fastModelIds.has(selection.model) === false) {
            try { await loadModelCapabilities(signal) } catch { /* unavailable means Standard */ }
          }
          const speed = selection.speed === 'fast' && fastModelIds.has(selection.model) ? 'fast' : 'standard'
          speedBySessionModel.set(speedKey(selection.sessionId, selection.model), speed)
          return ok({ selectedSpeed: speed })
        }
        case 'session-speed': {
          const selection = parseSessionSpeed(payload)
          const key = speedKey(selection.sessionId, selection.model)
          const speed = speedBySessionModel.get(key)
          return ok({
            sessionId: selection.sessionId,
            model: selection.model,
            ...(speed === undefined ? {} : { speed }),
          })
        }
        case 'select-account': {
          const selection = parseSelection(payload)
          selectedBySession.set(selection.sessionId, selection.authIndex)
          if (selection.persistDefault !== false) defaultSelectedAccount = selection.authIndex
          // This state is intentionally an integration seam. CPA's current
          // public HTTP API does not accept a per-request auth_index, so the
          // first version does not claim to pin traffic to this account.
          return ok({ selected: selection.authIndex })
        }
        case 'account-selection': {
          const sessionId = parseSessionId(payload)
          return ok({ selected: selectedBySession.get(sessionId) ?? defaultSelectedAccount })
        }
        case 'reset-quota': {
          const authIndex = parseAuthIndex(payload)
          await requestCpa(effectiveConfig(ctx, config), readCredential, '/v0/management/reset-quota', {
            method: 'POST',
            body: JSON.stringify({ auth_index: authIndex }),
          }, signal)
          await refreshAccounts(signal)
          return ok({ reset: true })
        }
        default:
          throw new Error(`dsh-cpa-plugin: unknown endpoint ${endpoint}`)
      }
    }, { authority: 'loopback' })
  })

  return { refreshAccounts, readAccounts }
}

/**
 * The Web settings proxy already exposes the pi-ai provider namespace. The
 * CPA model submodule writes `providers.cpa.baseURL` there, so the Host reads
 * that value for management calls as well and keeps the YAML endpoint only
 * as the bootstrap fallback before a model route exists.
 */
function effectiveConfig(ctx: Context, config: Config): Config {
  const settings = ctx.get('settings')
  const value = settings?.get(MODEL_SETTINGS_NS)
  const providers = valueObject(valueObject(value)?.providers)
  const providerId = providerCandidates(config).find(candidate => valueObject(providers?.[candidate]) !== undefined) ?? config.providerId
  const profile = valueObject(providers?.[providerId])
  const baseURL = stringValue(valueObject(profile)?.baseURL)
  return {
    ...config,
    providerId,
    ...baseURL === undefined ? {} : { endpoint: managementEndpoint(baseURL) },
  }
}

/**
 * `CLIProxyAPI` is the upstream provider id. Older plugin builds saved the
 * same route under `cpa`; accept either namespace, preserving the preferred
 * id supplied by the caller when both profiles exist.
 */
function providerCandidates(config: Config): string[] {
  const candidates = [config.providerId]
  if (config.providerId === 'CLIProxyAPI') candidates.push('cpa')
  else if (config.providerId === 'cpa') candidates.push('CLIProxyAPI')
  return [...new Set(candidates)]
}

function managementEndpoint(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  return normalized.replace(/\/v1$/i, '')
}

function ok<T extends CpaRpcValue>(value: T): RpcResult<T> {
  return { ok: true, value }
}

async function refreshModelCatalog(ctx: Context, signal: AbortSignal): Promise<void> {
  if (signal.aborted) throw signal.reason
  const parallel = (ctx as unknown as { parallel?: (event: string) => Promise<void> }).parallel
  if (typeof parallel === 'function') await parallel.call(ctx, MODEL_REFRESH_EVENT)
  if (signal.aborted) throw signal.reason
}

function effectiveRefreshInterval(ctx: Context, config: Config): number {
  const settings = ctx.get('settings')
  const section = valueObject(settings?.get(REFRESH_SETTINGS_NS))
  return normalizeRefreshInterval(section?.refreshIntervalMs ?? config.refreshIntervalMs)
}

function normalizeRefreshInterval(value: unknown): number {
  const parsed = optionalNumberValue(value)
  return parsed !== undefined && REFRESH_INTERVALS.includes(parsed as typeof REFRESH_INTERVALS[number])
    ? parsed
    : 300000
}

function parseRefreshInterval(value: unknown): number {
  const parsed = optionalNumberValue(valueObject(value)?.refreshIntervalMs)
  if (parsed === undefined || !REFRESH_INTERVALS.includes(parsed as typeof REFRESH_INTERVALS[number])) {
    throw new Error('invalid CLIProxyAPI refresh interval')
  }
  return parsed
}

async function configView(
  ctx: Context,
  config: Config,
  readCredential: (ref: string) => Promise<string | undefined>,
): Promise<CpaConfigView> {
  return {
    endpoint: config.endpoint,
    providerId: config.providerId,
    managementKeyEnv: config.managementKeyEnv,
    managementKeyConfigured: Boolean(await readCredential(config.managementKeyEnv)),
    refreshIntervalMs: effectiveRefreshInterval(ctx, config),
  }
}

/** Read the settings-owned CPA model route without exposing its key to the browser. */
function cpaFastRoute(ctx: Context, config: Config): CpaFastRoute | undefined {
  const settings = ctx.get('settings')
  const value = settings?.get(MODEL_SETTINGS_NS)
  const providers = valueObject(valueObject(value)?.providers)
  const profile = valueObject(valueObject(providers)?.[config.providerId])
  const api = stringValue(profile?.api) ?? 'openai-responses'
  if (api !== 'openai-responses') return undefined
  const baseURL = stringValue(profile?.baseURL) ?? modelEndpoint(config.endpoint)
  const rawModels = Array.isArray(profile?.models) ? profile.models : []
  const models = rawModels.flatMap(modelValue => {
    const model = valueObject(modelValue)
    const id = stringValue(model?.id)
    if (id === undefined) return []
    const reasoning = model?.reasoningEfforts === false
      ? []
      : objectKeys(model?.reasoningEfforts)
    return [{
      id,
      ...stringValue(model?.name) === undefined ? {} : { name: stringValue(model?.name) },
      ...Array.isArray(model?.input) ? { input: model.input.filter(value => value === 'text' || value === 'image') } : {},
      ...reasoning.length === 0 ? {} : { reasoningEfforts: reasoning },
      ...positiveNumber(model?.contextWindow) === undefined ? {} : { contextWindow: positiveNumber(model?.contextWindow) },
      ...positiveNumber(model?.maxTokens) === undefined ? {} : { maxTokens: positiveNumber(model?.maxTokens) },
    }]
  })
  return {
    provider: config.providerId,
    baseURL: modelEndpoint(baseURL),
    apiKeyEnv: stringValue(profile?.apiKeyEnv) ?? NATIVE_MODEL_KEY_REF,
    models,
  }
}

/** Fetch the extended CLIProXyAPI catalog; the plain endpoint omits service tiers. */
async function fetchModelCapabilities(
  ctx: Context,
  config: Config,
  readCredential: (ref: string) => Promise<string | undefined>,
  signal: AbortSignal,
): Promise<CpaModelCapabilitiesView> {
  const route = cpaFastRoute(ctx, config)
  if (route === undefined) return { models: [], fetchedAt: new Date().toISOString() }
  const key = route.apiKeyEnv === undefined ? undefined : await readCredential(route.apiKeyEnv)
  if (key === undefined || key.trim() === '') return { models: [], fetchedAt: new Date().toISOString() }
  const endpoint = new URL('models?client_version=0.144.0', ensureBaseUrl(route.baseURL)).toString()
  let body: unknown
  try {
    body = await requestModelCatalog(endpoint, key, config.timeoutMs, signal)
  } catch {
    return { models: [], fetchedAt: new Date().toISOString() }
  }
  return {
    models: parseModelCapabilities(body),
    fetchedAt: new Date().toISOString(),
  }
}

/** Resolve the exact modality metadata already used by Harness admission. */
async function fetchModelInputCapabilities(
  ctx: Context,
  signal: AbortSignal,
): Promise<CpaModelInputCapabilitiesView> {
  const groups: Array<Array<CpaModelInputCapability | undefined>> = await Promise.all(ctx.llm.listProviders().map(async provider => {
    try {
      const models = await ctx.llm.listModels(provider.id)
      return Promise.all(models.map(async model => {
        try {
          const resolved = await ctx.llm.resolveModelInfo(provider.id, model.id, signal)
          if (resolved.inputModalities === undefined) return undefined
          const input = resolved.inputModalities.filter((value): value is CpaInputModality => value === 'text' || value === 'image')
          return { provider: provider.id, model: model.id, input: [...input] } satisfies CpaModelInputCapability
        } catch {
          // Unknown metadata remains selectable; Harness will remain the final
          // authority when an adapter cannot resolve this route.
          return undefined
        }
      }))
    } catch {
      return []
    }
  }))
  return {
    models: groups.flat(1).filter((entry): entry is CpaModelInputCapability => entry !== undefined),
    fetchedAt: new Date().toISOString(),
  }
}

async function requestModelCatalog(
  endpoint: string,
  key: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort(new Error('CLIProXyAPI model catalog request timed out')) }, timeoutMs)
  const abort = () => { controller.abort(signal.reason) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
      },
    })
    const text = await response.text()
    let body: unknown
    try {
      body = text === '' ? {} : JSON.parse(text)
    } catch {
      body = { error: text.slice(0, 300) }
    }
    if (!response.ok) {
      const message = valueObject(body)?.error
      throw new Error(typeof message === 'string' ? message : `CLIProXyAPI returned HTTP ${String(response.status)}`)
    }
    return body
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

export function parseModelCapabilities(value: unknown): CpaModelCapability[] {
  const root = valueObject(value)
  const entries = Array.isArray(root?.models)
    ? root.models
    : Array.isArray(root?.data) ? root.data : []
  return entries.flatMap(entryValue => {
    const entry = valueObject(entryValue)
    // CLIProxyAPI's extended catalog identifies models with `slug`; the
    // OpenAI-compatible fallback uses `id` or `model`.
    const ids = [...new Set([
      stringValue(entry?.slug),
      stringValue(entry?.id),
      stringValue(entry?.model),
    ].filter((value): value is string => value !== undefined))]
    const id = ids[0]
    if (id === undefined) return []
    const aliases = ids.slice(1)
    const tiers = Array.isArray(entry?.service_tiers)
      ? entry.service_tiers
      : Array.isArray(entry?.serviceTiers) ? entry.serviceTiers : []
    const parsedTiers = tiers.flatMap(tierValue => {
      const tier = valueObject(tierValue)
      const tierId = stringValue(tier?.id)
      if (tierId === undefined) return []
      return [{
        id: tierId,
        ...stringValue(tier?.name) === undefined ? {} : { name: stringValue(tier?.name) },
        ...stringValue(tier?.description) === undefined ? {} : { description: stringValue(tier?.description) },
      }]
    })
    return [{
      id,
      ...aliases.length > 0 ? { aliases } : {},
      serviceTiers: parsedTiers,
    }]
  })
}

async function fetchAccounts(
  config: Config,
  readCredential: (ref: string) => Promise<string | undefined>,
  signal: AbortSignal,
  includeQuota: boolean,
): Promise<CpaAccountsView> {
  const body = await requestCpa(config, readCredential, '/v0/management/auth-files', { method: 'GET' }, signal)
  const files = Array.isArray((body as { files?: unknown }).files)
    ? (body as { files: unknown[] }).files
    : []
  const accounts = files.flatMap(toAccount)
  const enriched = includeQuota
    ? await Promise.all(accounts.map(async account => {
      try {
        const result = await fetchAccountQuota(config, readCredential, account, signal)
        return {
          ...account,
          ...result.plan === undefined ? {} : { plan: result.plan },
          ...result.quota === undefined ? {} : { quota: result.quota },
        }
      } catch {
        // Quota is an optional, provider-specific refresh. Keep the CPA
        // heartbeat/status record visible when an upstream usage endpoint is
        // unavailable or a provider has not implemented it.
        return account
      }
    }))
    : accounts
  const fetchedAt = new Date().toISOString()
  return {
    accounts: enriched,
    fetchedAt,
    ...includeQuota ? { quotaFetchedAt: fetchedAt } : {},
  }
}

interface AccountQuotaResult {
  plan?: string
  quota?: CpaQuota
}

async function fetchAccountQuota(
  config: Config,
  readCredential: (ref: string) => Promise<string | undefined>,
  account: Pick<CpaAccount, 'provider' | 'authIndex' | 'projectId'>,
  signal: AbortSignal,
): Promise<AccountQuotaResult> {
  const provider = account.provider.trim().toLowerCase()
  if (provider.includes('antigravity')) {
    const headers = {
      Authorization: 'Bearer $TOKEN$',
      'Content-Type': 'application/json',
      'User-Agent': 'antigravity/cli/1.0.13 (aidev_client; os_type=darwin; arch=arm64)',
    }
    const quotaRequest = account.projectId === undefined
      ? Promise.resolve<unknown>({})
      : callUpstream(
        config,
        readCredential,
        account.authIndex,
        'POST',
        'https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary',
        headers,
        JSON.stringify({ project: account.projectId }),
        signal,
      )
    const subscriptionRequest = callUpstream(
      config,
      readCredential,
      account.authIndex,
      'POST',
      'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist',
      headers,
      JSON.stringify({ metadata: { ideType: 'ANTIGRAVITY' } }),
      signal,
    )
    const [quotaResult, subscriptionResult] = await Promise.allSettled([quotaRequest, subscriptionRequest])
    return parseAntigravityQuota(
      quotaResult.status === 'fulfilled' ? quotaResult.value : {},
      subscriptionResult.status === 'fulfilled' ? subscriptionResult.value : {},
    )
  }
  if (provider.includes('codex')) {
    const body = await callUpstream(
      config,
      readCredential,
      account.authIndex,
      'GET',
      'https://chatgpt.com/backend-api/wham/usage',
      { Authorization: 'Bearer $TOKEN$', Accept: 'application/json' },
      undefined,
      signal,
    )
    return parseCodexQuota(body)
  }
  return {}
}

async function callUpstream(
  config: Config,
  readCredential: (ref: string) => Promise<string | undefined>,
  authIndex: string,
  method: string,
  url: string,
  header: Record<string, string>,
  data: string | undefined,
  signal: AbortSignal,
): Promise<unknown> {
  const wrapper = valueObject(await requestCpa(config, readCredential, '/v0/management/api-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_index: authIndex,
      method,
      url,
      header,
      ...data === undefined ? {} : { data },
    }),
  }, signal))
  const statusCode = numberValue(wrapper?.status_code)
  const responseBody = stringValue(wrapper?.body) ?? ''
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`CLIProXyAPI upstream returned HTTP ${String(statusCode)}`)
  }
  if (responseBody === '') return {}
  try {
    return JSON.parse(responseBody) as unknown
  } catch {
    throw new Error('CLIProXyAPI upstream returned invalid JSON')
  }
}

export function parseCodexQuota(body: unknown): AccountQuotaResult {
  const root = valueObject(body)
  if (root === undefined) return {}
  const rateLimit = valueObject(root.rate_limit) ?? valueObject(root.rateLimit) ?? {}
  const primary = valueObject(rateLimit.primary_window)
    ?? valueObject(rateLimit.primaryWindow)
    ?? valueObject(root.primary_window)
    ?? valueObject(root.primaryWindow)
  const secondary = valueObject(rateLimit.secondary_window)
    ?? valueObject(rateLimit.secondaryWindow)
    ?? valueObject(root.secondary_window)
    ?? valueObject(root.secondaryWindow)
  const credits = valueObject(root.credits)
  const spendControl = valueObject(root.spend_control) ?? valueObject(root.spendControl)
  const limitReached = booleanValue(rateLimit.limit_reached) === true
    || booleanValue(rateLimit.limitReached) === true
    || booleanValue(root.rate_limit_reached) === true
    || booleanValue(root.rateLimitReached) === true

  // Codex exposes independent rolling windows. `primary_window` is normally
  // the five-hour limit and `secondary_window` is normally the weekly limit,
  // but use the explicit window size when present so either order remains
  // correct across CPA/ChatGPT response versions.
  const parsedWindows = [
    parseCodexQuotaWindow(primary, 'five_hour'),
    parseCodexQuotaWindow(secondary, 'weekly'),
  ].filter((window): window is CpaQuotaWindow => window !== undefined)
  if (Array.isArray(rateLimit.windows)) {
    for (const [index, value] of rateLimit.windows.entries()) {
      const fallback = index === 0 ? 'five_hour' : index === 1 ? 'weekly' : 'quota'
      const window = parseCodexQuotaWindow(valueObject(value), fallback)
      if (window !== undefined) parsedWindows.push(window)
    }
  }
  const windows = deduplicateCodexQuotaWindows(parsedWindows)
  const activeWindow = primary ?? secondary
  const fallbackUsed = firstNumber(root.used_percent, root.usedPercent)
  const fallbackRemaining = percentRemaining(fallbackUsed)
  if (windows.length === 0 && fallbackRemaining !== undefined) {
    windows.push({
      window: 'quota',
      remaining: fallbackRemaining,
      total: 100,
      unit: '%',
      exceeded: limitReached || fallbackRemaining <= 0,
    })
  }

  const balance = firstNumber(credits?.balance)
  const quotaExceeded = limitReached
    || booleanValue(credits?.overage_limit_reached) === true
    || booleanValue(credits?.overageLimitReached) === true
    || booleanValue(spendControl?.reached) === true
    || windows.some(window => window.exceeded === true || window.remaining <= 0)
  // Keep the legacy top-level fields focused on the primary/five-hour window;
  // consumers that understand multiple windows should use `quota.windows`.
  const primaryQuotaWindow = windows.find(window => window.window === 'five_hour') ?? windows[0]
  const remaining = primaryQuotaWindow?.remaining
  const resetAfterSeconds = firstNumber(activeWindow?.reset_after_seconds, activeWindow?.resetAfterSeconds)
  const resetAt = epochToIso(activeWindow?.reset_at ?? activeWindow?.resetAt)
  const windowSeconds = firstNumber(activeWindow?.limit_window_seconds, activeWindow?.limitWindowSeconds)
  const quota = remaining !== undefined
    ? {
      remaining,
      total: 100,
      used: 100 - remaining,
      unit: '%',
      exceeded: quotaExceeded,
      window: primaryQuotaWindow?.window ?? 'quota',
      windows,
      ...resetAt === undefined ? {} : { resetAt },
      ...resetAfterSeconds === undefined ? {} : { resetAfterSeconds },
      ...windowSeconds === undefined ? {} : { windowSeconds },
    }
    : balance !== undefined
      ? { remaining: Math.max(0, balance), unit: 'credits', exceeded: quotaExceeded || balance <= 0 }
      : undefined
  return {
    ...stringValue(root.plan_type) === undefined && stringValue(root.planType) === undefined
      ? {}
      : { plan: normalizePlan(stringValue(root.plan_type) ?? stringValue(root.planType)!) },
    ...quota === undefined ? {} : { quota },
  }
}

function parseCodexQuotaWindow(
  value: Record<string, unknown> | undefined,
  fallbackWindow: string,
): CpaQuotaWindow | undefined {
  if (value === undefined) return undefined
  const used = firstNumber(value.used_percent, value.usedPercent)
  const reportedRemaining = firstNumber(value.remaining_percent, value.remainingPercent)
  const remaining = reportedRemaining === undefined ? percentRemaining(used) : clampPercent(reportedRemaining)
  if (remaining === undefined) return undefined
  const windowSeconds = firstNumber(value.limit_window_seconds, value.limitWindowSeconds)
  const windowLabel = stringValue(value.window) ?? stringValue(value.name) ?? stringValue(value.label)
  const window = codexWindowKey(windowSeconds, fallbackWindow, windowLabel)
  const resetAt = epochToIso(value.reset_at ?? value.resetAt)
  const exceeded = booleanValue(value.limit_reached) === true
    || booleanValue(value.limitReached) === true
    || booleanValue(value.exceeded) === true
    || remaining <= 0
  return {
    window,
    remaining,
    total: 100,
    unit: '%',
    exceeded,
    ...resetAt === undefined ? {} : { resetAt },
  }
}

function deduplicateCodexQuotaWindows(windows: CpaQuotaWindow[]): CpaQuotaWindow[] {
  const byWindow = new Map<string, CpaQuotaWindow>()
  for (const window of windows) {
    const current = byWindow.get(window.window)
    if (current === undefined || window.remaining < current.remaining) byWindow.set(window.window, window)
  }
  return [...byWindow.values()].sort((left, right) => codexWindowOrder(left.window) - codexWindowOrder(right.window))
}

function codexWindowOrder(window: string): number {
  if (window === 'five_hour') return 0
  if (window === 'weekly') return 1
  return 2
}

function percentRemaining(used: number | undefined): number | undefined {
  return used === undefined ? undefined : clampPercent(100 - clampPercent(used))
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function codexWindowKey(seconds: number | undefined, fallback = 'quota', label?: string): string {
  if (seconds !== undefined) {
    if (Math.abs(seconds - 18_000) <= 60) return 'five_hour'
    if (Math.abs(seconds - 604_800) <= 60) return 'weekly'
    if (seconds >= 2_419_200) return 'monthly'
    return `window_${seconds}`
  }
  const normalized = label?.trim().toLowerCase().replace(/[-\s]+/g, '_')
  if (normalized === '5h' || normalized?.includes('five_hour') || normalized?.includes('5_hour')) return 'five_hour'
  if (normalized === 'week' || normalized?.includes('week')) return 'weekly'
  return fallback
}

function parseAntigravityQuota(body: unknown, subscriptionBody: unknown): AccountQuotaResult {
  const root = valueObject(body)
  const subscription = valueObject(subscriptionBody)
  const windows = root === undefined || !Array.isArray(root.groups)
    ? []
    : root.groups.flatMap(groupValue => {
      const group = valueObject(groupValue)
      const groupLabel = stringValue(group?.displayName) ?? stringValue(group?.label)
      if (group === undefined || !Array.isArray(group.buckets)) return []
      return group.buckets.flatMap(bucketValue => {
        const bucket = valueObject(bucketValue)
        if (bucket === undefined) return []
        const remainingFraction = firstNumber(bucket.remainingFraction, bucket.remaining_fraction)
        const window = antigravityWindow(bucket)
        if (remainingFraction === undefined || window === undefined) return []
        const remaining = Math.max(0, Math.min(100, remainingFraction <= 1 ? remainingFraction * 100 : remainingFraction))
        const resetAt = stringValue(bucket.resetTime) ?? stringValue(bucket.reset_at)
        return [{
          window,
          ...groupLabel === undefined ? {} : { group: groupLabel },
          remaining,
          total: 100,
          unit: '%',
          exceeded: remaining <= 0,
          ...resetAt === undefined ? {} : { resetAt },
        }]
      })
    })
  const remaining = windows.length === 0 ? undefined : Math.min(...windows.map(window => window.remaining))
  const quota = remaining === undefined
    ? undefined
    : { remaining, total: 100, unit: '%', exceeded: windows.some(window => window.exceeded === true), windows }
  const subscriptionRoot = valueObject(subscription)
  const currentTier = valueObject(subscriptionRoot?.currentTier) ?? valueObject(subscriptionRoot?.current_tier)
  const paidTier = valueObject(subscriptionRoot?.paidTier) ?? valueObject(subscriptionRoot?.paid_tier)
  // A free current tier can coexist with a paid Google AI tier. Prefer the
  // paid tier so the account label reflects the subscription that supplies
  // the available credits; fall back to the current tier when CPA omits it.
  const plan = antigravityPlan(paidTier) ?? antigravityPlan(currentTier)
  return {
    ...plan === undefined ? {} : { plan },
    ...quota === undefined ? {} : { quota },
  }
}

function antigravityWindow(bucket: Record<string, unknown>): string | undefined {
  const value = `${stringValue(bucket.window) ?? ''} ${stringValue(bucket.bucketId) ?? ''} ${stringValue(bucket.displayName) ?? ''}`.trim().toLowerCase()
  if (value.includes('5h') || value.includes('five hour') || value.includes('five-hour')) return 'five_hour'
  if (value.includes('week')) return 'weekly'
  return stringValue(bucket.window)?.trim().toLowerCase().replace(/[-\s]+/g, '_')
}

function antigravityPlan(tier: Record<string, unknown> | undefined): string | undefined {
  if (tier === undefined) return undefined
  const id = stringValue(tier.id)?.toLowerCase()
  if (id?.includes('ultra')) return 'ultra'
  if (id?.includes('pro')) return 'pro'
  if (id?.includes('standard')) return 'standard'
  if (id?.includes('free')) return 'free'
  const name = stringValue(tier.name) ?? stringValue(tier.description)
  if (name === undefined || name.trim().toLowerCase() === 'antigravity') return undefined
  const normalizedName = name.trim().toLowerCase()
  if (normalizedName.includes('google ai pro') || /(^|[^a-z])pro([^a-z]|$)/.test(normalizedName)) return 'pro'
  if (normalizedName.includes('google ai ultra') || /(^|[^a-z])ultra([^a-z]|$)/.test(normalizedName)) return 'ultra'
  if (normalizedName.includes('standard')) return 'standard'
  if (normalizedName.includes('free')) return 'free'
  return normalizePlan(name)
}

function normalizePlan(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_]+/g, '-')
}

function toAccount(value: unknown): CpaAccount[] {
  if (typeof value !== 'object' || value === null) return []
  const raw = value as Record<string, unknown>
  const authIndex = stringValue(raw.auth_index) ?? stringValue(raw.id)
  const id = stringValue(raw.id) ?? authIndex
  if (authIndex === undefined || id === undefined) return []
  const name = stringValue(raw.name) ?? id
  const provider = stringValue(raw.provider) ?? stringValue(raw.type) ?? 'CLIProXyAPI'
  const plan = accountPlan(raw)
  const quota = accountQuota(raw)
  const projectId = stringValue(raw.project_id) ?? stringValue(raw.projectId)
  const rawRecent = Array.isArray(raw.recent_requests)
    ? raw.recent_requests
    : Array.isArray(raw.recentRequests) ? raw.recentRequests : undefined
  const recentSuccess = rawRecent === undefined
    ? undefined
    : rawRecent.reduce((sum, item) => sum + numberValue(valueObject(item)?.success), 0)
  const recentFailed = rawRecent === undefined
    ? undefined
    : rawRecent.reduce((sum, item) => sum + numberValue(valueObject(item)?.failed), 0)
  return [{
    id,
    authIndex,
    name,
    provider,
    ...plan === undefined ? {} : { plan },
    ...stringValue(raw.label) === undefined ? {} : { label: stringValue(raw.label) },
    ...stringValue(raw.email) === undefined ? {} : { email: stringValue(raw.email) },
    ...stringValue(raw.account) === undefined ? {} : { account: stringValue(raw.account) },
    ...projectId === undefined ? {} : { projectId },
    status: stringValue(raw.status) ?? 'unknown',
    ...stringValue(raw.status_message) === undefined ? {} : { statusMessage: stringValue(raw.status_message) },
    ...quota === undefined ? {} : { quota },
    disabled: raw.disabled === true,
    unavailable: raw.unavailable === true,
    ...stringValue(raw.next_retry_after) === undefined ? {} : { nextRetryAfter: stringValue(raw.next_retry_after) },
    ...stringValue(raw.last_refresh) === undefined ? {} : { lastRefresh: stringValue(raw.last_refresh) },
    success: numberValue(raw.success),
    failed: numberValue(raw.failed),
    ...recentSuccess === undefined ? {} : { recentSuccess },
    ...recentFailed === undefined ? {} : { recentFailed },
  }]
}

async function fetchAccountModels(
  config: Config,
  readCredential: (ref: string) => Promise<string | undefined>,
  request: CpaAccountModelsRequest,
  signal: AbortSignal,
): Promise<CpaAccountModelsView> {
  const query = new URLSearchParams({ name: request.name, auth_index: request.authIndex })
  const body = await requestCpa(config, readCredential, `/v0/management/auth-files/models?${query.toString()}`, { method: 'GET' }, signal)
  const response = valueObject(body)
  const models = Array.isArray(response?.models)
    ? response.models.flatMap(model => {
      if (typeof model === 'string') return stringValue(model) === undefined ? [] : [model.trim()]
      const record = valueObject(model)
      const id = stringValue(record?.id) ?? stringValue(record?.model)
      return id === undefined ? [] : [id]
    })
    : []
  return { authIndex: request.authIndex, models: [...new Set(models)] }
}

/**
 * CPA deliberately returns only a safe subset of the auth record. Codex's
 * plan is nested in the decoded ID-token claims; newer CPA versions may also
 * expose a top-level plan/tier field, so accept those forms without sending
 * the token itself to the browser.
 */
function accountPlan(raw: Record<string, unknown>): string | undefined {
  const idToken = valueObject(raw.id_token)
  const subscription = valueObject(raw.subscription)
  const currentTier = valueObject(raw.current_tier) ?? valueObject(raw.currentTier)
  const candidates = [
    raw.plan_type,
    raw.plan,
    raw.subscription_plan,
    raw.subscription_type,
    raw.tier_id,
    raw.tier,
    idToken?.plan_type,
    idToken?.chatgpt_plan_type,
    subscription?.plan_type,
    subscription?.plan,
    currentTier?.id,
  ]
  for (const candidate of candidates) {
    const value = stringValue(candidate)
    if (value !== undefined) return value.toLowerCase().replace(/[\s_]+/g, '-')
  }
  return undefined
}

/**
 * CPA releases quota information at different layers and versions. Accept
 * only the small, display-safe projection we need; never forward raw auth
 * metadata or tokens to the browser.
 */
function accountQuota(raw: Record<string, unknown>): CpaQuota | undefined {
  const quota = valueObject(raw.quota) ?? {}
  const remaining = firstNumber(
    quota.remaining,
    quota.remaining_quota,
    quota.balance,
    quota.credits,
    raw.quota_remaining,
    raw.remaining_quota,
    raw.balance,
    raw.credits,
  )
  const total = firstNumber(quota.total, quota.limit, quota.quota_limit, raw.quota_limit, raw.limit, raw.total_quota)
  const used = firstNumber(quota.used, quota.usage, quota.used_quota, raw.quota_used, raw.used_quota, raw.usage)
  const unit = stringValue(quota.unit) ?? stringValue(quota.type) ?? stringValue(raw.quota_unit)
  const label = stringValue(quota.display) ?? stringValue(quota.label) ?? stringValue(quota.text) ?? stringValue(raw.quota_label)
  const exceeded = booleanValue(quota.exceeded) ?? booleanValue(raw.quota_exceeded)
  if (remaining === undefined && total === undefined && used === undefined && unit === undefined && label === undefined && exceeded === undefined) {
    return undefined
  }
  return {
    ...remaining === undefined ? {} : { remaining },
    ...total === undefined ? {} : { total },
    ...used === undefined ? {} : { used },
    ...unit === undefined ? {} : { unit },
    ...label === undefined ? {} : { label },
    ...exceeded === undefined ? {} : { exceeded },
  }
}

async function requestCpa(
  config: Config,
  readCredential: (ref: string) => Promise<string | undefined>,
  path: string,
  init: RequestInit,
  signal: AbortSignal,
): Promise<unknown> {
  const key = await readCredential(config.managementKeyEnv)
  if (key === undefined || key.trim() === '') {
    throw new Error(`CLIProXyAPI management key is not configured (${config.managementKeyEnv})`)
  }
  const endpoint = new URL(path, ensureBaseUrl(config.endpoint)).toString()
  const controller = new AbortController()
  const timer = setTimeout(() => { controller.abort(new Error('CLIProXyAPI request timed out')) }, config.timeoutMs)
  const abort = () => { controller.abort(signal.reason) }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const response = await fetch(endpoint, {
      ...init,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${key}`,
        ...init.headers,
      },
    })
    const text = await response.text()
    let body: unknown
    try {
      body = text === '' ? {} : JSON.parse(text)
    } catch {
      body = { error: text.slice(0, 300) }
    }
    if (!response.ok) {
      const message = typeof body === 'object' && body !== null && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : `CLIProXyAPI responded with HTTP ${String(response.status)}`
      throw new Error(message)
    }
    return body
  } finally {
    clearTimeout(timer)
    signal.removeEventListener('abort', abort)
  }
}

function ensureBaseUrl(value: string): string {
  const trimmed = value.trim()
  if (trimmed === '') throw new Error('CLIProXyAPI endpoint is empty')
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`
}

function parseSelection(value: unknown): CpaAccountSelection {
  if (typeof value !== 'object' || value === null) throw new Error('invalid CLIProXyAPI account selection')
  const raw = value as Record<string, unknown>
  const sessionId = stringValue(raw.sessionId)
  const authIndex = raw.authIndex === undefined ? undefined : stringValue(raw.authIndex)
  const persistDefault = raw.persistDefault === undefined ? undefined : raw.persistDefault
  if (sessionId === undefined
    || (raw.authIndex !== undefined && authIndex === undefined)
    || (persistDefault !== undefined && typeof persistDefault !== 'boolean')) {
    throw new Error('invalid CLIProXyAPI account selection')
  }
  return {
    sessionId,
    ...(authIndex === undefined ? {} : { authIndex }),
    ...(persistDefault === undefined ? {} : { persistDefault }),
  }
}

function parseSessionId(value: unknown): string {
  if (typeof value !== 'object' || value === null) throw new Error('invalid CLIProXyAPI session selection')
  const sessionId = stringValue((value as Record<string, unknown>).sessionId)
  if (sessionId === undefined) throw new Error('CLIProXyAPI session id is required')
  return sessionId
}

function parseSpeedSelection(value: unknown): CpaSpeedSelection {
  if (typeof value !== 'object' || value === null) throw new Error('invalid CLIProXyAPI speed selection')
  const raw = value as Record<string, unknown>
  const sessionId = stringValue(raw.sessionId)
  const model = stringValue(raw.model)
  const speed = stringValue(raw.speed)
  if (sessionId === undefined || model === undefined || (speed !== 'standard' && speed !== 'fast')) {
    throw new Error('invalid CLIProXyAPI speed selection')
  }
  return { sessionId, model, speed }
}

function parseSessionSpeed(value: unknown): { sessionId: string; model: string } {
  if (typeof value !== 'object' || value === null) throw new Error('invalid CLIProXyAPI session speed request')
  const raw = value as Record<string, unknown>
  const sessionId = stringValue(raw.sessionId)
  const model = stringValue(raw.model)
  if (sessionId === undefined || model === undefined) throw new Error('CLIProXyAPI session speed requires sessionId and model')
  return { sessionId, model }
}

function parseAuthIndex(value: unknown): string {
  if (typeof value !== 'object' || value === null) throw new Error('invalid CLIProXyAPI auth_index')
  const authIndex = stringValue((value as Record<string, unknown>).authIndex)
  if (authIndex === undefined || authIndex === '') throw new Error('CLIProXyAPI auth_index is required')
  return authIndex
}

function parseAccountModelsRequest(value: unknown): CpaAccountModelsRequest {
  if (typeof value !== 'object' || value === null) throw new Error('invalid CLIProXyAPI account models request')
  const raw = value as Record<string, unknown>
  const authIndex = stringValue(raw.authIndex)
  const name = stringValue(raw.name)
  if (authIndex === undefined || name === undefined) throw new Error('CLIProXyAPI account auth_index and name are required')
  return { authIndex, name }
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function modelEndpoint(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (normalized === '') return ''
  return normalized.endsWith('/v1') ? normalized : `${normalized}/v1`
}

function objectKeys(value: unknown): string[] {
  const record = valueObject(value)
  if (record === undefined) return []
  return Object.keys(record).filter(key => key !== 'off' && record[key] !== false)
}

function positiveNumber(value: unknown): number | undefined {
  const number = optionalNumberValue(value)
  return number !== undefined && number > 0 ? number : undefined
}

function speedKey(sessionId: string, model: string): string {
  return `${sessionId}\u0000${model}`
}

function epochToIso(value: unknown): string | undefined {
  const numeric = optionalNumberValue(value)
  if (numeric !== undefined) {
    const date = new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000)
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
  }
  return stringValue(value)
}

function valueObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = optionalNumberValue(value)
    if (parsed !== undefined) return parsed
  }
  return undefined
}

function optionalNumberValue(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return undefined
  const parsed = Number(value.trim().replace(/,/g, ''))
  return Number.isFinite(parsed) ? parsed : undefined
}

function booleanValue(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return undefined
  if (value.trim().toLowerCase() === 'true') return true
  if (value.trim().toLowerCase() === 'false') return false
  return undefined
}
