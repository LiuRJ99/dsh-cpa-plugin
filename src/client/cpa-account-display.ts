import type { CpaAccount, CpaQuota, CpaQuotaWindow } from './protocol.ts'
import type { CpaLocaleKey } from './locales.ts'

type Translate = (key: CpaLocaleKey, params?: Record<string, string>) => string

export type AccountAvailability = 'available' | 'quota-low' | 'unavailable'
export type AccountQuotaDisplay = 'compact' | 'all'
export type ModelFamily = 'gpt' | 'claude' | 'gemini' | 'deepseek' | 'other'

/**
 * Model family classification shared by the composer quota display and the
 * model picker grouping. The CPA Antigravity quota response splits its limits
 * into per-family pools (e.g. "Gemini Models" vs "Claude and GPT models"),
 * so the composer must know which pool a selected model draws from.
 */
export function modelFamilyOf(value: string | undefined): ModelFamily {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (/(gpt|codex|chatgpt|(?:^|[-_])o[134](?:$|[-_]))/.test(normalized)) return 'gpt'
  if (normalized.includes('claude')) return 'claude'
  if (normalized.includes('gemini')) return 'gemini'
  if (normalized.includes('deepseek')) return 'deepseek'
  return 'other'
}

/**
 * CPA pool-name hints used to scope an Antigravity account's quota windows to
 * the model family currently in use. Gemini models draw from the "Gemini
 * Models" pool, while Claude and GPT models share "Claude and GPT models".
 */
const MODEL_FAMILY_POOL_HINTS: Readonly<Partial<Record<ModelFamily, readonly string[]>>> = {
  gemini: ['gemini'],
  claude: ['claude', 'gpt'],
  gpt: ['claude', 'gpt'],
}

export interface AccountQuotaProgress {
  key: string
  label: string
  percent?: number
  resetAt?: string
}

/**
 * Pick the single percentage the composer surfaces for an account's quota.
 * Rule: prefer the five-hour window; use the weekly window only when there is
 * no five-hour window or the five-hour window is exhausted (0%).
 */
export function accountQuotaPercent(progress: readonly AccountQuotaProgress[]): number | undefined {
  return accountQuotaPercentEntry(progress)?.percent
}

/**
 * The quota window (and its category label) behind the single percentage the
 * composer surfaces. Mirrors accountQuotaPercent(): prefer the five-hour
 * window; use the weekly window only when there is no five-hour window or the
 * five-hour window is exhausted (0%). Callers can label the figure with its
 * category (e.g. "5h" vs "Weekly limit") so the switcher popup makes clear
 * which quota window the shown percentage belongs to.
 */
export function accountQuotaPercentEntry(progress: readonly AccountQuotaProgress[]): AccountQuotaProgress | undefined {
  const fiveHour = progress.find(entry => entry.key === 'five_hour')
  const weekly = progress.find(entry => entry.key === 'weekly')
  if (fiveHour !== undefined) {
    if (fiveHour.percent === undefined) return weekly
    if (fiveHour.percent > 0) return fiveHour
    // five-hour window is exhausted (0%): fall back to the weekly window.
    return weekly ?? fiveHour
  }
  return weekly ?? progress.find(entry => entry.percent !== undefined)
}

export interface AccountWindowStats {
  success: number
  failed: number
}

export interface AccountCumulativeStats {
  success: number
  failed: number
  hasRecords: boolean
}

/** 3h20m sliding window stats for composer popup. */
export function accountWindowStats(
  account: Pick<CpaAccount, 'recentSuccess' | 'recentFailed'>,
): AccountWindowStats {
  return {
    success: account.recentSuccess ?? 0,
    failed: account.recentFailed ?? 0,
  }
}

/** Cumulative request stats for settings card. */
export function accountCumulativeStats(
  account: Pick<CpaAccount, 'success' | 'failed'>,
): AccountCumulativeStats {
  const success = account.success ?? 0
  const failed = account.failed ?? 0
  return {
    success,
    failed,
    hasRecords: success > 0 || failed > 0,
  }
}

export function accountLabel(account: Pick<CpaAccount, 'provider' | 'plan'>): string {
  const provider = providerLabel(account.provider)
  const plan = planLabel(account.plan)
  return plan === '' ? provider : `${provider} · ${plan}`
}

export function accountIdentity(account: Pick<CpaAccount, 'email' | 'account' | 'label'>): string {
  const email = account.email?.trim()
  if (email !== undefined && email !== '') return email
  const label = account.label?.trim()
  if (label !== undefined && label !== '') return label
  const value = account.account?.trim()
  return value !== undefined && value.includes('@') ? value : '—'
}

/**
 * User-facing account detail. Keep the quota first so the availability
 * signal is visible at a glance, without exposing CPA's internal auth index.
 */
export function accountQuotaDetail(
  account: Pick<CpaAccount, 'email' | 'account' | 'label' | 'quota'>,
  t: Translate,
  display: AccountQuotaDisplay = 'compact',
): string {
  const quota = accountQuotaLabel(account.quota, t, display)
  const identity = accountIdentity(account)
  return quota === t('account.quotaUnknown') ? identity : `${quota} · ${identity}`
}

/**
 * Account summaries deliberately omit CPA's internal auth_index. They show
 * the useful, user-facing values instead: identity, quota and availability.
 */
export function accountSummary(
  account: Pick<CpaAccount, 'email' | 'account' | 'label' | 'status' | 'statusMessage' | 'disabled' | 'unavailable' | 'nextRetryAfter' | 'quota'>,
  t: Translate,
): string {
  return `${accountQuotaDetail(account, t)} · ${accountAvailabilityLabel(account, t)}`
}

export function accountQuotaLabel(quota: CpaQuota | undefined, t: Translate, display: AccountQuotaDisplay = 'compact'): string {
  if (quota?.windows !== undefined && quota.windows.length > 0) {
    const windows = deduplicateQuotaWindows(quota.windows)
    const visible = display === 'all' ? windows : [compactQuotaWindow(windows)]
    return visible
      .filter((entry): entry is [string, CpaQuotaWindow] => entry !== undefined)
      .map(([kind, window]) => `${quotaWindowLabel(kind, window, t)} ${Math.round(window.remaining)}%`)
      .join(' · ')
  }
  if (quota?.label !== undefined && quota.label.trim() !== '') return quota.label.trim()
  if (quota?.unit?.trim() === '%' && quota.remaining !== undefined) {
    return `${formatNumber(quota.remaining)}%`
  }
  if (quota?.remaining !== undefined && quota.total !== undefined) {
    return `${formatNumber(quota.remaining)} / ${formatNumber(quota.total)}${unitSuffix(quota.unit)}`
  }
  if (quota?.remaining !== undefined) return `${formatNumber(quota.remaining)}${unitSuffix(quota.unit)}`
  if (quota?.used !== undefined && quota.total !== undefined) {
    return `${formatNumber(Math.max(0, quota.total - quota.used))} / ${formatNumber(quota.total)}${unitSuffix(quota.unit)}`
  }
  return t('account.quotaUnknown')
}

/**
 * Return the provider's quota windows in a form the settings page can render
 * as percentage bars. Compact account summaries continue to use
 * accountQuotaLabel(), so this does not change their layout or wording.
 *
 * When `model` is supplied and the account's quota is split into provider
 * pools (Antigravity "Gemini Models" vs "Claude and GPT models"), only the
 * windows belonging to the selected model's pool are returned. The composer
 * uses this so a Gemini session never shows the Claude/GPT pool's remaining
 * quota (and vice versa). Pass `model: undefined` to keep the settings page
 * showing every group's windows.
 */
export function accountQuotaProgress(
  quota: CpaQuota | undefined,
  t: Translate,
  model?: string,
): AccountQuotaProgress[] {
  if (quota?.windows !== undefined && quota.windows.length > 0) {
    return windowProgress(deduplicateQuotaWindows(quota.windows, model), t)
  }
  if (quota === undefined) return []
  const label = quota.label?.trim() || t('account.quotaOverall')
  const percent = quotaPercent(quota)
  if (percent === undefined && quota.resetAt === undefined && (quota.label?.trim() ?? '') === '') return []
  return [{
    key: 'overall',
    label,
    ...percent === undefined ? {} : { percent },
    ...quota.resetAt === undefined ? {} : { resetAt: quota.resetAt },
  }]
}

function windowProgress(windows: Array<[string, CpaQuotaWindow]>, t: Translate): AccountQuotaProgress[] {
  return windows.map(([kind, window]) => ({
    key: kind,
    label: quotaWindowLabel(kind, window, t),
    ...quotaPercent(window) === undefined ? {} : { percent: quotaPercent(window) },
    ...window.resetAt === undefined ? {} : { resetAt: window.resetAt },
  }))
}

export function formatQuotaResetAt(value: string): string {
  const raw = value.trim()
  if (raw === '') return raw
  const numeric = Number(raw)
  const date = Number.isFinite(numeric)
    ? new Date(Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric)
    : new Date(raw)
  if (Number.isNaN(date.getTime())) return raw
  return date.toLocaleString(undefined, {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function quotaPercent(value: Pick<CpaQuota, 'remaining' | 'total' | 'used' | 'unit'>): number | undefined {
  const remaining = value.remaining ?? (
    value.total !== undefined && value.used !== undefined
      ? value.total - value.used
      : undefined
  )
  if (remaining === undefined || !Number.isFinite(remaining)) return undefined
  if (value.unit?.trim() === '%') return clampPercent(remaining)
  if (value.total !== undefined && value.total > 0) return clampPercent((remaining / value.total) * 100)
  // Some CPA versions omit the unit while returning a percentage-like value.
  if (remaining >= 0 && remaining <= 100) return clampPercent(remaining)
  return undefined
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value))
}

function deduplicateQuotaWindows(
  windows: readonly CpaQuotaWindow[],
  model?: string,
): Array<[string, CpaQuotaWindow]> {
  const scoped = model === undefined
    ? windows
    : windows.filter(window => windowMatchesModelPool(window, model))
  // When the caller scopes to a model but no window matches its pool (e.g. an
  // unusual provider group label), fall back to the full window set instead of
  // showing an empty quota.
  const usable = scoped.length === 0 ? windows : scoped
  const byKind = new Map<string, CpaQuotaWindow>()
  for (const window of usable) {
    const kind = quotaWindowKind(window.window)
    const current = byKind.get(kind)
    if (current === undefined || window.remaining < current.remaining) byKind.set(kind, window)
  }
  return [...byKind.entries()].sort(([left], [right]) => quotaWindowOrder(left) - quotaWindowOrder(right))
}

/**
 * True when a provider quota window belongs to the selected model's family
 * pool. Antigravity reports separate limits per model pool ("Gemini Models"
 * and "Claude and GPT models"); when the window carries a group label and the
 * caller selects a specific model, unrelated pools are excluded. Windows
 * without a group label, or callers without a model, always pass.
 */
export function windowMatchesModelPool(window: CpaQuotaWindow, model: string | undefined): boolean {
  if (model === undefined) return true
  const group = window.group?.trim().toLowerCase() ?? ''
  if (group === '') return true
  const family = modelFamilyOf(model)
  const hints = MODEL_FAMILY_POOL_HINTS[family]
  return hints === undefined || hints.some(hint => group.includes(hint))
}

function compactQuotaWindow(windows: Array<[string, CpaQuotaWindow]>): [string, CpaQuotaWindow] | undefined {
  return windows.find(([kind]) => kind === 'five_hour')
    ?? windows.reduce<[string, CpaQuotaWindow] | undefined>((best, entry) => best === undefined || entry[1].remaining < best[1].remaining ? entry : best, undefined)
}

function quotaWindowOrder(kind: string): number {
  if (kind === 'five_hour') return 0
  if (kind === 'weekly') return 1
  return 2
}

export function accountAvailabilityLabel(
  account: Pick<CpaAccount, 'status' | 'statusMessage' | 'disabled' | 'unavailable' | 'nextRetryAfter' | 'quota'>,
  t: Translate,
  model?: string,
): string {
  switch (accountAvailability(account, model)) {
    case 'available': return t('account.available')
    case 'quota-low': return t('account.quotaLow')
    default: return t('account.unavailable')
  }
}

/**
 * Availability of an account for a (possibly model-scoped) quota. When the
 * account's quota is split into provider pools and `model` is supplied, only
 * the windows belonging to the selected model's pool determine the signal;
 * an exhausted Claude/GPT pool must not flag a Gemini session as quota-low.
 */
export function accountAvailability(
  account: Pick<CpaAccount, 'status' | 'statusMessage' | 'disabled' | 'unavailable' | 'nextRetryAfter' | 'quota'>,
  model?: string,
): AccountAvailability {
  if (account.disabled || account.unavailable || statusLooksUnavailable(account.status, account.statusMessage)) return 'unavailable'
  if (quotaLooksInsufficient(account, model)) return 'quota-low'
  return 'available'
}

function quotaLooksInsufficient(
  account: Pick<CpaAccount, 'status' | 'statusMessage' | 'unavailable' | 'nextRetryAfter' | 'quota'>,
  model?: string,
): boolean {
  const allWindows = account.quota?.windows ?? []
  const poolWindows = allWindows.filter(window => windowMatchesModelPool(window, model))
  // A model-scoped lookup with no matching pool falls back to the whole set so
  // an unusual provider group label never makes a healthy account look low.
  const windows = model !== undefined && poolWindows.length === 0 ? allWindows : poolWindows
  if (windows.some(window => window.exceeded === true || window.remaining <= 0 || (window.total !== undefined && window.total > 0 && window.remaining / window.total <= 0.2))) return true
  if (account.quota?.exceeded === true) return true
  if (account.quota?.remaining !== undefined && account.quota.remaining <= 0) return true
  if (
    account.quota?.remaining !== undefined
    && account.quota.total !== undefined
    && account.quota.total > 0
    && account.quota.remaining / account.quota.total <= 0.2
  ) return true
  if (account.nextRetryAfter !== undefined) return true
  // Match only the status field. CPA sometimes attaches the full upstream
  // error payload (e.g. a past 429 RESOURCE_EXHAUSTED body) as statusMessage;
  // that historical detail must not make a quota-healthy account look low.
  return /(quota|limit|exhaust|insufficient|balance|credit|rate.?limit|too many|429)/i.test(
    `${account.status}`,
  )
}

function quotaWindowKind(value: string): string {
  const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, '_')
  if (normalized === 'five_hour' || normalized === '5h' || normalized.includes('five_hour')) return 'five_hour'
  if (normalized === 'weekly' || normalized === 'week' || normalized.includes('week')) return 'weekly'
  return normalized
}

function quotaWindowLabel(kind: string, window: CpaQuotaWindow, t: Translate): string {
  if (kind === 'five_hour') return t('account.quotaFiveHour')
  if (kind === 'weekly') return t('account.quotaWeekly')
  return window.window.trim() || t('account.quotaUnknown')
}

/**
 * A transient probe failure (CPA status "error"/"failed") does not mean the
 * credential is unusable: the account may still have healthy quota and serve
 * requests on the next attempt. Only explicit credential/account-level states
 * mark an account unavailable.
 */
function statusLooksUnavailable(status: string, message: string | undefined): boolean {
  return /(disabled|invalid|expired|revoked|unauthor|forbidden|offline|removed)/i.test(`${status} ${message ?? ''}`)
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function unitSuffix(unit: string | undefined): string {
  const value = unit?.trim()
  return value === undefined || value === '' ? '' : ` ${value}`
}

function providerLabel(provider: string): string {
  switch (provider.trim().toLowerCase()) {
    case 'codex': return 'Codex'
    case 'antigravity': return 'Antigravity'
    default: return provider.trim() || 'CLIProXyAPI'
  }
}

function planLabel(plan: string | undefined): string {
  if (plan === undefined || plan.trim() === '') return ''
  const normalized = plan.trim().toLowerCase()
  if (normalized === 'plus') return 'Plus'
  if (normalized === 'team') return 'Team'
  if (normalized === 'business') return 'Business'
  if (normalized === 'pro') return 'Pro'
  if (normalized === 'free' || normalized === 'free-tier') return 'Free'
  return plan.trim()
}
