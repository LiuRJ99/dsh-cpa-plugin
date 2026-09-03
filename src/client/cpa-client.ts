import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { ClientConnectionRpc } from '@deepseek-ai/dsh-client-connection/client'
import type { CpaAccount, CpaAccountModelsView, CpaAccountsView, CpaConfigView, CpaInputModality, CpaModelCapabilitiesView, CpaModelCapability, CpaModelInputCapabilitiesView, CpaRefreshIntervalView, CpaSpeed } from './protocol.ts'
import type { ModelCapability } from '../model-capabilities.ts'

const QUOTA_CACHE_KEY = 'dsh-cliproxyapi:quota-cache:v1'
const ACCOUNT_PREFERENCES_KEY = 'dsh-cliproxyapi:account-preferences:v1'
const ACCOUNT_DEFAULT_KEY = 'dsh-cliproxyapi:account-default:v1'
const SPEED_PREFERENCES_KEY = 'dsh-cliproxyapi:speed-preferences:v1'

export interface CpaClientState {
  providerId: string
  endpoint: string
  managementKeyEnv: string
  managementKeyConfigured: boolean
  refreshIntervalMs: number
  status: 'idle' | 'loading' | 'ready' | 'error'
  accounts: readonly CpaAccount[]
  fetchedAt: string | undefined
  quotaFetchedAt: string | undefined
  modelCapabilities: readonly CpaModelCapability[]
  capabilitiesFetchedAt: string | undefined
  inputCapabilities: Readonly<Record<string, readonly CpaInputModality[]>>
  inputCapabilitiesFetchedAt: string | undefined
  inputCapabilitiesStatus: 'idle' | 'loading' | 'ready' | 'error'
  error: string | null
  selectedBySession: Readonly<Record<string, string | undefined>>
  defaultAccount: string | undefined
  speedBySessionModel: Readonly<Record<string, CpaSpeed>>
}

/** Browser-safe facade over the Host-owned `/cpa` RPC channel. */
export class CpaClient {
  readonly store: SnapshotStore<CpaClientState> = createSnapshotStore({
    providerId: 'cpa',
    endpoint: '',
    managementKeyEnv: 'CPA_MANAGEMENT_KEY',
    managementKeyConfigured: false,
    refreshIntervalMs: 300000,
    status: 'idle',
    accounts: [],
    fetchedAt: undefined,
    quotaFetchedAt: undefined,
    modelCapabilities: [],
    capabilitiesFetchedAt: undefined,
    inputCapabilities: {},
    inputCapabilitiesFetchedAt: undefined,
    inputCapabilitiesStatus: 'idle',
    error: null,
    selectedBySession: readAccountPreferences(),
    defaultAccount: readDefaultAccountPreference(),
    speedBySessionModel: readSpeedPreferences(),
  })

  private configPromise: Promise<CpaConfigView> | undefined
  private capabilitiesPromise: Promise<CpaModelCapabilitiesView> | undefined
  private capabilitiesEpoch = 0
  private inputCapabilitiesPromise: Promise<CpaModelInputCapabilitiesView> | undefined
  private readonly accountModels = new Map<string, Promise<readonly string[]>>()
  constructor(private readonly rpc: ClientConnectionRpc) {}

  async refreshConfig(): Promise<CpaConfigView> {
    this.configPromise = undefined
    this.invalidateModelCapabilities()
    this.inputCapabilitiesPromise = undefined
    return this.loadConfig()
  }

  async setRefreshInterval(refreshIntervalMs: number): Promise<number> {
    const value = await this.call<CpaRefreshIntervalView>('set-refresh-interval', { refreshIntervalMs })
    this.store.update((state) => { state.refreshIntervalMs = value.refreshIntervalMs })
    this.applyAccounts(value, true)
    return value.refreshIntervalMs
  }

  async loadConfig(): Promise<CpaConfigView> {
    this.configPromise ??= this.call<CpaConfigView>('config', {})
    try {
      const value = await this.configPromise
      this.store.update((state) => {
        state.providerId = value.providerId
        state.endpoint = value.endpoint
        state.managementKeyEnv = value.managementKeyEnv
        state.managementKeyConfigured = value.managementKeyConfigured
        state.refreshIntervalMs = value.refreshIntervalMs
        state.error = null
      })
      this.hydrateQuotaSnapshot(value.endpoint)
      return value
    } catch (error) {
      this.store.update((state) => { state.error = messageOf(error) })
      throw error
    }
  }

  /** Read the latest Host-side account snapshot without starting another upstream refresh. */
  async loadAccounts(): Promise<readonly CpaAccount[]> {
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    try {
      const value = await this.call<CpaAccountsView>('accounts', {})
      return this.applyAccounts(value, false)
    } catch (error) {
      this.store.update((state) => { state.status = 'error'; state.error = messageOf(error) })
      throw error
    }
  }

  /** Unified refresh: synchronize the model catalog and account quota snapshot. */
  async refresh(): Promise<readonly CpaAccount[]> {
    // A refresh can complete the provider profile bootstrap that supplies the
    // API key and rich service-tier catalog. Any capability request started
    // before that point must not be reused afterward.
    this.invalidateModelCapabilities()
    this.store.update((state) => { state.status = 'loading'; state.error = null })
    try {
      await this.loadConfig()
      const value = await this.call<CpaAccountsView>('refresh', {})
      return this.applyAccounts(value, true)
    } catch (error) {
      this.store.update((state) => { state.status = 'error'; state.error = messageOf(error) })
      throw error
    } finally {
      this.invalidateModelCapabilities()
    }
  }

  private applyAccounts(value: CpaAccountsView, replace: boolean): readonly CpaAccount[] {
    const accounts = replace
      ? value.accounts
      : mergeAccountSnapshots(this.store.getSnapshot().accounts, value.accounts)
    this.store.update((state) => {
      state.accounts = accounts
      state.fetchedAt = value.fetchedAt
      if (value.quotaFetchedAt !== undefined) state.quotaFetchedAt = value.quotaFetchedAt
      state.status = 'ready'
      state.error = null
    })
    this.reconcileSelectedAccounts(accounts)
    if (value.quotaFetchedAt !== undefined) this.persistQuotaSnapshot(accounts, value.quotaFetchedAt)
    this.accountModels.clear()
    return accounts
  }

  async loadModelCapabilities(): Promise<readonly CpaModelCapability[]> {
    const epoch = this.capabilitiesEpoch
    const pending = this.capabilitiesPromise ??= this.call<CpaModelCapabilitiesView>('model-capabilities', {})
    try {
      const value = await pending
      if (epoch !== this.capabilitiesEpoch) return this.loadModelCapabilities()
      this.store.update((state) => {
        state.modelCapabilities = value.models
        state.capabilitiesFetchedAt = value.fetchedAt
      })
      void this.restorePersistedSpeeds(value.models)
      return value.models
    } catch (error) {
      if (this.capabilitiesPromise === pending) this.capabilitiesPromise = undefined
      if (epoch !== this.capabilitiesEpoch) return this.loadModelCapabilities()
      this.store.update((state) => {
        state.modelCapabilities = []
        state.capabilitiesFetchedAt = undefined
      })
      throw error
    }
  }

  /** Generic capability-provider view consumed by other optional plugins. */
  async listModelCapabilities(): Promise<readonly ModelCapability[]> {
    const provider = this.store.getSnapshot().providerId
    const models = await this.loadModelCapabilities()
    return models.map(model => ({ provider, model: model.id, serviceTiers: model.serviceTiers }))
  }

  hasSpeedPreference(sessionId: string, model: string): boolean {
    return Object.prototype.hasOwnProperty.call(this.store.getSnapshot().speedBySessionModel, speedKey(sessionId, model))
  }

  /** Pull a host-observed speed (for taskboard-created sessions) without overwriting absent preferences. */
  async syncSpeed(sessionId: string, model: string): Promise<CpaSpeed | undefined> {
    const value = await this.call<{ sessionId: string; model: string; speed?: CpaSpeed }>('session-speed', { sessionId, model })
    if (value.speed === undefined) return undefined
    const preferences = {
      ...this.store.getSnapshot().speedBySessionModel,
      [speedKey(sessionId, model)]: value.speed,
    }
    this.store.update((state) => { state.speedBySessionModel = preferences })
    persistSpeedPreferences(preferences)
    return value.speed
  }

  private invalidateModelCapabilities(): void {
    this.capabilitiesEpoch += 1
    this.capabilitiesPromise = undefined
  }

  async loadInputCapabilities(): Promise<readonly CpaModelInputCapabilitiesView['models'][number][]> {
    this.store.update((state) => { state.inputCapabilitiesStatus = 'loading' })
    this.inputCapabilitiesPromise ??= this.call<CpaModelInputCapabilitiesView>('model-input-capabilities', {})
    try {
      const value = await this.inputCapabilitiesPromise
      const inputCapabilities: Record<string, readonly CpaInputModality[]> = {}
      for (const model of value.models) inputCapabilities[modelKey(model.provider, model.model)] = model.input
      this.store.update((state) => {
        state.inputCapabilities = inputCapabilities
        state.inputCapabilitiesFetchedAt = value.fetchedAt
        state.inputCapabilitiesStatus = 'ready'
      })
      return value.models
    } catch (error) {
      this.inputCapabilitiesPromise = undefined
      this.store.update((state) => { state.inputCapabilitiesStatus = 'error' })
      throw error
    }
  }

  async selectAccount(
    sessionId: string,
    authIndex: string | undefined,
    options: { persistDefault?: boolean } = {},
  ): Promise<void> {
    await this.call<{ selected: string | undefined }>('select-account', {
      sessionId,
      authIndex,
      persistDefault: options.persistDefault !== false,
    })
    const preferences = { ...this.store.getSnapshot().selectedBySession }
    if (authIndex === undefined) delete preferences[sessionId]
    else preferences[sessionId] = authIndex
    const persistDefault = options.persistDefault !== false
    this.store.update((state) => {
      state.selectedBySession = preferences
      if (persistDefault) state.defaultAccount = authIndex
    })
    persistAccountPreferences(preferences)
    if (persistDefault) persistDefaultAccountPreference(authIndex)
  }

  /** Restore the Host-side fallback when the browser creates a new client session. */
  async loadSelectedAccount(sessionId: string): Promise<string | undefined> {
    const value = await this.call<{ selected: string | undefined }>('account-selection', { sessionId })
    const preferences = { ...this.store.getSnapshot().selectedBySession }
    if (value.selected === undefined) delete preferences[sessionId]
    else preferences[sessionId] = value.selected
    this.store.update((state) => { state.selectedBySession = preferences })
    persistAccountPreferences(preferences)
    return value.selected
  }

  /** Fetch the model catalog associated with one account when CPA supports it. */
  async loadAccountModels(account: Pick<CpaAccount, 'authIndex' | 'name'>): Promise<readonly string[]> {
    const cacheKey = `${account.authIndex}\u0000${account.name}`
    const pending = this.accountModels.get(cacheKey) ?? this.call<CpaAccountModelsView>('account-models', {
      authIndex: account.authIndex,
      name: account.name,
    }).then(value => value.models)
    this.accountModels.set(cacheKey, pending)
    try {
      return await pending
    } catch (error) {
      this.accountModels.delete(cacheKey)
      throw error
    }
  }

  async resetQuota(authIndex: string): Promise<void> {
    await this.call<{ reset: boolean }>('reset-quota', { authIndex })
    await this.refresh()
  }

  selected(sessionId: string): string | undefined {
    const state = this.store.getSnapshot()
    return state.selectedBySession[sessionId] ?? state.defaultAccount
  }

  async selectSpeed(sessionId: string, model: string, speed: CpaSpeed): Promise<void> {
    const value = await this.call<{ selectedSpeed: CpaSpeed }>('select-speed', { sessionId, model, speed })
    const preferences = {
      ...this.store.getSnapshot().speedBySessionModel,
      [speedKey(sessionId, model)]: value.selectedSpeed,
    }
    this.store.update((state) => {
      state.speedBySessionModel = preferences
    })
    persistSpeedPreferences(preferences)
  }

  speed(sessionId: string, model: string): CpaSpeed {
    return this.store.getSnapshot().speedBySessionModel[speedKey(sessionId, model)] ?? 'standard'
  }

  inputCapability(provider: string, model: string): readonly CpaInputModality[] | undefined {
    return this.store.getSnapshot().inputCapabilities[modelKey(provider, model)]
  }

  private async restorePersistedSpeeds(capabilities: readonly CpaModelCapability[]): Promise<void> {
    const persisted = this.store.getSnapshot().speedBySessionModel
    const fastPreferences = Object.entries(persisted).filter(([, speed]) => speed === 'fast')
    if (fastPreferences.length === 0) return

    const restored = await Promise.all(fastPreferences.map(async ([key]) => {
      const parsed = parseSpeedKey(key)
      if (parsed === undefined) return [key, 'standard'] as const
      if (!hasFastSpeedCapability(parsed.model, capabilities)) return [key, 'standard'] as const
      try {
        const value = await this.call<{ selectedSpeed: CpaSpeed }>('select-speed', {
          sessionId: parsed.sessionId,
          model: parsed.model,
          speed: 'fast',
        })
        return [key, value.selectedSpeed] as const
      } catch {
        // If the Host is still coming up, retain the local preference and let
        // the next menu refresh re-apply it.
        return [key, 'fast'] as const
      }
    }))
    const next = { ...this.store.getSnapshot().speedBySessionModel }
    let changed = false
    for (const [key, speed] of restored) {
      if (next[key] !== speed) {
        next[key] = speed
        changed = true
      }
    }
    if (!changed) return
    this.store.update((state) => { state.speedBySessionModel = next })
    persistSpeedPreferences(next)
  }

  private async call<T>(endpoint: string, payload: unknown): Promise<T> {
    const result = await this.rpc.call('/cpa', endpoint, payload)
    if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`)
    return result.value as T
  }

  private hydrateQuotaSnapshot(endpoint: string): void {
    const snapshot = readQuotaSnapshot(endpoint)
    if (snapshot === undefined) return
    const current = this.store.getSnapshot()
    // Keep values returned by a live request. The cached snapshot only fills
    // the first paint (and quota fields omitted by older CPA endpoints).
    const accounts = mergeAccountSnapshots(snapshot.accounts, current.accounts)
    this.store.update((state) => {
      state.accounts = accounts
      if (state.fetchedAt === undefined && snapshot.fetchedAt !== undefined) state.fetchedAt = snapshot.fetchedAt
      if (state.quotaFetchedAt === undefined && snapshot.fetchedAt !== undefined) state.quotaFetchedAt = snapshot.fetchedAt
    })
    this.reconcileSelectedAccounts(accounts)
  }

  private reconcileSelectedAccounts(accounts: readonly CpaAccount[]): void {
    const known = new Set(accounts.map(account => account.authIndex))
    const state = this.store.getSnapshot()
    const current = state.selectedBySession
    const next = { ...current }
    let changed = false
    for (const [sessionId, authIndex] of Object.entries(current)) {
      if (authIndex !== undefined && !known.has(authIndex)) {
        delete next[sessionId]
        changed = true
      }
    }
    const defaultAccount = state.defaultAccount !== undefined && known.has(state.defaultAccount)
      ? state.defaultAccount
      : undefined
    const defaultChanged = defaultAccount !== state.defaultAccount
    if (!changed && !defaultChanged) return
    this.store.update((nextState) => {
      if (changed) nextState.selectedBySession = next
      if (defaultChanged) nextState.defaultAccount = defaultAccount
    })
    if (changed) persistAccountPreferences(next)
    if (defaultChanged) persistDefaultAccountPreference(defaultAccount)
  }

  private persistQuotaSnapshot(accounts: readonly CpaAccount[], fetchedAt: string): void {
    const endpoint = this.store.getSnapshot().endpoint.trim().replace(/\/+$/, '')
    if (endpoint === '') return
    const keys = quotaCacheKeys(endpoint)
    const existingKey = keys.find(key => {
      try { return globalThis.localStorage?.getItem(key) !== null } catch { return false }
    })
    const key = existingKey ?? keys[keys.length - 1]
    try {
      const previous = JSON.parse(globalThis.localStorage?.getItem(key) || '{}') as Record<string, unknown>
      delete previous.refreshIntervalMs
      globalThis.localStorage?.setItem(key, JSON.stringify({
        ...previous,
        accounts,
        fetchedAt,
      }))
    } catch {
      // A private browsing context or a full storage quota must not break CPA.
    }
  }
}

export function hasFastSpeedCapability(model: string, capabilities: readonly CpaModelCapability[]): boolean {
  return capabilities.some(entry => {
    const ids = [entry.id, ...(entry.aliases ?? [])]
    return ids.includes(model) && entry.serviceTiers.some(tier => tier.id === 'priority')
  })
}

function speedKey(sessionId: string, model: string): string {
  return `${sessionId}\u0000${model}`
}

function modelKey(provider: string, model: string): string {
  return `${provider}\u0000${model}`
}

function parseSpeedKey(value: string): { sessionId: string; model: string } | undefined {
  const separator = value.indexOf('\u0000')
  if (separator <= 0 || separator === value.length - 1) return undefined
  return { sessionId: value.slice(0, separator), model: value.slice(separator + 1) }
}

function readSpeedPreferences(): Readonly<Record<string, CpaSpeed>> {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(SPEED_PREFERENCES_KEY) ?? '{}') as unknown
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
    const result: Record<string, CpaSpeed> = {}
    for (const [key, speed] of Object.entries(value)) {
      if (speed === 'standard' || speed === 'fast') result[key] = speed
    }
    return result
  } catch {
    return {}
  }
}

function readAccountPreferences(): Readonly<Record<string, string>> {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(ACCOUNT_PREFERENCES_KEY) ?? '{}') as unknown
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return {}
    const result: Record<string, string> = {}
    for (const [sessionId, authIndex] of Object.entries(value)) {
      if (typeof authIndex === 'string' && sessionId.trim() !== '' && authIndex.trim() !== '') result[sessionId] = authIndex
    }
    return result
  } catch {
    return {}
  }
}

function readDefaultAccountPreference(): string | undefined {
  try {
    const value = globalThis.localStorage?.getItem(ACCOUNT_DEFAULT_KEY)?.trim()
    return value === undefined || value === '' ? undefined : value
  } catch {
    return undefined
  }
}

function persistAccountPreferences(value: Readonly<Record<string, string | undefined>>): void {
  try {
    globalThis.localStorage?.setItem(ACCOUNT_PREFERENCES_KEY, JSON.stringify(value))
  } catch {
    // Private browsing and storage quotas must not block account selection.
  }
}

function persistDefaultAccountPreference(value: string | undefined): void {
  try {
    if (value === undefined) globalThis.localStorage?.removeItem(ACCOUNT_DEFAULT_KEY)
    else globalThis.localStorage?.setItem(ACCOUNT_DEFAULT_KEY, value)
  } catch {
    // Private browsing and storage quotas must not block account selection.
  }
}

function persistSpeedPreferences(value: Readonly<Record<string, CpaSpeed>>): void {
  try {
    globalThis.localStorage?.setItem(SPEED_PREFERENCES_KEY, JSON.stringify(value))
  } catch {
    // Private browsing and storage quotas must not block model selection.
  }
}

function mergeAccountSnapshots(previous: readonly CpaAccount[], next: readonly CpaAccount[]): readonly CpaAccount[] {
  const oldByIndex = new Map(previous.map(account => [account.authIndex, account]))
  return next.map(account => {
    const old = oldByIndex.get(account.authIndex)
    if (old === undefined) return account
    return {
      ...account,
      ...account.plan === undefined && old.plan !== undefined ? { plan: old.plan } : {},
      ...account.quota === undefined && old.quota !== undefined ? { quota: old.quota } : {},
    }
  })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function quotaCacheKeys(endpoint: string): string[] {
  const normalized = endpoint.trim().replace(/\/+$/, '')
  const withoutV1 = normalized.replace(/\/v1$/, '')
  return [...new Set([
    `${QUOTA_CACHE_KEY}:${normalized}`,
    `${QUOTA_CACHE_KEY}:${withoutV1}/v1`,
  ])]
}

function readQuotaSnapshot(endpoint: string): { accounts: readonly CpaAccount[]; fetchedAt?: string } | undefined {
  for (const key of quotaCacheKeys(endpoint)) {
    try {
      const value = JSON.parse(globalThis.localStorage?.getItem(key) ?? 'null') as unknown
      if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
      const snapshot = value as { accounts?: unknown; fetchedAt?: unknown }
      if (!Array.isArray(snapshot.accounts)) continue
      const accounts = snapshot.accounts.filter(isCachedAccount)
      return {
        accounts,
        ...typeof snapshot.fetchedAt === 'string' ? { fetchedAt: snapshot.fetchedAt } : {},
      }
    } catch {
      // Ignore malformed cache entries and continue with the next candidate.
    }
  }
  return undefined
}

function isCachedAccount(value: unknown): value is CpaAccount {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const account = value as { authIndex?: unknown; name?: unknown; provider?: unknown }
  return typeof account.authIndex === 'string' && typeof account.name === 'string' && typeof account.provider === 'string'
}
