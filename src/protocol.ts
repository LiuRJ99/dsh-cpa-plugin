/** Safe account projection returned by the CLIProxyAPI management endpoint. */
export interface CpaQuota {
  /** Remaining amount, when CPA exposes a numeric quota field. */
  remaining?: number
  /** Total quota, when CPA exposes it. */
  total?: number
  /** Used amount, when CPA exposes it. */
  used?: number
  /** Provider supplied unit such as requests or credits. */
  unit?: string
  /** Provider supplied display value, kept only when it is already safe to show. */
  label?: string
  /** True when CPA reports that the quota is exhausted. */
  exceeded?: boolean
  /** Provider reset time, when the upstream exposes it. */
  resetAt?: string
  /** Seconds until the provider resets the current window. */
  resetAfterSeconds?: number
  /** Size of the provider window in seconds. */
  windowSeconds?: number
  /** Stable key for the primary quota window, when the provider exposes one. */
  window?: string
  /** Multiple provider-specific windows, such as Antigravity 5h and weekly limits. */
  windows?: readonly CpaQuotaWindow[]
}

export interface CpaQuotaWindow {
  /** Stable provider window key, for example five_hour or weekly. */
  window: string
  /** Optional provider model group that owns this window. */
  group?: string
  /** Remaining amount in the window. */
  remaining: number
  /** Total amount represented by the remaining value. */
  total?: number
  /** Display unit, usually %. */
  unit?: string
  /** True when the provider reports this window as exhausted. */
  exceeded?: boolean
  /** Provider reset time, when available. */
  resetAt?: string
}

export interface CpaAccount {
  id: string
  authIndex: string
  name: string
  provider: string
  /** Subscription/entitlement value reported by CPA, when available. */
  plan?: string
  label?: string
  email?: string
  account?: string
  /** Antigravity project id used only by the Host for quota lookup. */
  projectId?: string
  status: string
  statusMessage?: string
  quota?: CpaQuota
  disabled: boolean
  unavailable: boolean
  nextRetryAfter?: string
  lastRefresh?: string
  success: number
  failed: number
}

export interface CpaConfigView {
  endpoint: string
  providerId: string
  managementKeyEnv: string
  managementKeyConfigured: boolean
  /** Unified model/catalog and account refresh interval in milliseconds. */
  refreshIntervalMs: number
}

export interface CpaAccountsView {
  accounts: readonly CpaAccount[]
  /** Time at which the account/status snapshot was read. */
  fetchedAt: string
  /** Time at which provider-specific quota data was last refreshed. */
  quotaFetchedAt?: string
}

export interface CpaRefreshIntervalView extends CpaAccountsView {
  refreshIntervalMs: number
}

export interface CpaServiceTier {
  id: string
  name?: string
  description?: string
}

export interface CpaModelCapability {
  id: string
  serviceTiers: readonly CpaServiceTier[]
}

export interface CpaModelCapabilitiesView {
  models: readonly CpaModelCapability[]
  fetchedAt: string
}

export type CpaSpeed = 'standard' | 'fast'

export type CpaInputModality = 'text' | 'image'

/** Host-resolved input capabilities used to keep image sessions on safe models. */
export interface CpaModelInputCapability {
  provider: string
  model: string
  input: readonly CpaInputModality[]
}

export interface CpaModelInputCapabilitiesView {
  models: readonly CpaModelInputCapability[]
  fetchedAt: string
}

export interface CpaSpeedSelection {
  sessionId: string
  model: string
  speed: CpaSpeed
}

export interface CpaAccountSelection {
  sessionId: string
  authIndex?: string
  /** Persist an explicit account as the process-level fallback for a reload. */
  persistDefault?: boolean
}

export interface CpaAccountModelsRequest {
  authIndex: string
  name: string
}

export interface CpaAccountModelsView {
  authIndex: string
  models: readonly string[]
}

export type CpaRpcValue =
  | CpaConfigView
  | CpaAccountsView
  | CpaAccountModelsView
  | CpaRefreshIntervalView
  | CpaModelCapabilitiesView
  | CpaModelInputCapabilitiesView
  | { selected: string | undefined }
  | { selectedSpeed: CpaSpeed }
  | { reset: boolean }
