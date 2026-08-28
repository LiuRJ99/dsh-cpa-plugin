import type { CpaAccount, CpaQuota, CpaQuotaWindow } from './protocol.ts'
import type { CpaLocaleKey } from './locales.ts'

type Translate = (key: CpaLocaleKey, params?: Record<string, string>) => string

export type AccountAvailability = 'available' | 'quota-low' | 'unavailable'
export type AccountQuotaDisplay = 'compact' | 'all'

export interface AccountQuotaProgress {
  key: string
  label: string
  percent?: number
  resetAt?: string
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
 */
export function accountQuotaProgress(quota: CpaQuota | undefined, t: Translate): AccountQuotaProgress[] {
  if (quota?.windows !== undefined && quota.windows.length > 0) {
    return deduplicateQuotaWindows(quota.windows).map(([kind, window]) => ({
      key: kind,
      label: quotaWindowLabel(kind, window, t),
      ...quotaPercent(window) === undefined ? {} : { percent: quotaPercent(window) },
      ...window.resetAt === undefined ? {} : { resetAt: window.resetAt },
    }))
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

function deduplicateQuotaWindows(windows: readonly CpaQuotaWindow[]): Array<[string, CpaQuotaWindow]> {
  const byKind = new Map<string, CpaQuotaWindow>()
  for (const window of windows) {
    const kind = quotaWindowKind(window.window)
    const current = byKind.get(kind)
    if (current === undefined || window.remaining < current.remaining) byKind.set(kind, window)
  }
  return [...byKind.entries()].sort(([left], [right]) => quotaWindowOrder(left) - quotaWindowOrder(right))
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
): string {
  switch (accountAvailability(account)) {
    case 'available': return t('account.available')
    case 'quota-low': return t('account.quotaLow')
    default: return t('account.unavailable')
  }
}

export function accountAvailability(
  account: Pick<CpaAccount, 'status' | 'statusMessage' | 'disabled' | 'unavailable' | 'nextRetryAfter' | 'quota'>,
): AccountAvailability {
  if (account.disabled || account.unavailable || statusLooksUnavailable(account.status, account.statusMessage)) return 'unavailable'
  if (quotaLooksInsufficient(account)) return 'quota-low'
  return 'available'
}

function quotaLooksInsufficient(
  account: Pick<CpaAccount, 'status' | 'statusMessage' | 'unavailable' | 'nextRetryAfter' | 'quota'>,
): boolean {
  if (account.quota?.windows?.some(window => window.exceeded === true || window.remaining <= 0 || (window.total !== undefined && window.total > 0 && window.remaining / window.total <= 0.2))) return true
  if (account.quota?.exceeded === true) return true
  if (account.quota?.remaining !== undefined && account.quota.remaining <= 0) return true
  if (
    account.quota?.remaining !== undefined
    && account.quota.total !== undefined
    && account.quota.total > 0
    && account.quota.remaining / account.quota.total <= 0.2
  ) return true
  if (account.nextRetryAfter !== undefined) return true
  return /(quota|limit|exhaust|insufficient|balance|credit|rate.?limit|too many|429)/i.test(
    `${account.status} ${account.statusMessage ?? ''}`,
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

function statusLooksUnavailable(status: string, message: string | undefined): boolean {
  return /(disabled|invalid|expired|error|failed|unauthor|forbidden|offline|removed)/i.test(`${status} ${message ?? ''}`)
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
