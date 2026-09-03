import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { CpaAccount } from './protocol.ts'
import { CpaClient } from './cpa-client.ts'
import {
  accountAvailability,
  accountAvailabilityLabel,
  accountIdentity,
  accountLabel,
  accountQuotaProgress,
  accountWindowStats,
  type AccountQuotaProgress,
} from './cpa-account-display.ts'

type Props = PropsRuntime<'conversation.input.left'> & PropsLocale<'dsh-cpa'> & {
  cpa: CpaClient
  directory: SnapshotStore<ModelDirectoryState>
  sessionId: SessionId
}

/** Read-only current-account indicator with a model-scoped account switcher. */
export function CpaAccountIndicator({ cpa, directory, sessionId, t }: Props) {
  const cpaState = useSyncExternalStore(
    listener => cpa.store.subscribe(listener),
    () => cpa.store.getSnapshot(),
  )
  const directoryState = useSyncExternalStore(
    listener => directory.subscribe(listener),
    () => directory.getSnapshot(),
  )
  const current = directoryState.current
  const model = current?.provider === cpaState.providerId ? current.model : undefined
  const accountFingerprint = cpaState.accounts.map(account => account.authIndex).join('\u0000')
  const [supported, setSupported] = useState<readonly CpaAccount[] | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    let cancelled = false
    setOpen(false)
    setError(null)
    if (model === undefined) {
      setSupported(undefined)
      return () => { cancelled = true }
    }

    setSupported(undefined)
    setLoading(true)
    void (async () => {
      let accounts = cpa.store.getSnapshot().accounts
      if (accounts.length === 0) accounts = await cpa.loadAccounts()
      const matches = await Promise.all(accounts.map(async account => {
        try {
          const models = await cpa.loadAccountModels(account)
          return modelListContains(models, model) ? account : undefined
        } catch {
          return undefined
        }
      }))
      if (!cancelled) setSupported(matches.filter((account): account is CpaAccount => account !== undefined))
    })().catch(() => {
      if (!cancelled) setSupported([])
    }).finally(() => {
      if (!cancelled) setLoading(false)
    })
    return () => { cancelled = true }
  }, [accountFingerprint, cpa, model])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  const liveSupported = supported?.map(account => cpaState.accounts.find(currentAccount => currentAccount.authIndex === account.authIndex) ?? account) ?? []
  if (model === undefined || supported === undefined || liveSupported.length === 0 || loading) return null
  const account = currentAccount(liveSupported, cpa.selected(sessionId))
  if (account === undefined) return null

  const availability = accountAvailability(account)
  const availabilityLabel = accountAvailabilityLabel(account, t)
  const progress = accountQuotaProgress(account.quota, t)
  const primary = progress[0]
  const percent = primary?.percent
  const quotaLabel = primary === undefined
    ? t('account.quotaUnknown')
    : percent === undefined
      ? primary.label
      : `${primary.label} ${Math.round(percent)}%`
  const shortQuotaLabel = percent !== undefined
    ? `${Math.round(percent)}%`
    : primary !== undefined
      ? primary.label
      : quotaLabel
  const title = [
    accountLabel(account),
    accountIdentity(account),
    ...progress.map(formatProgress),
    availabilityLabel,
  ].join(' · ')

  const choose = (next: CpaAccount): void => {
    setError(null)
    void cpa.selectAccount(sessionId, next.authIndex).then(() => {
      setOpen(false)
    }).catch(cause => {
      setError(cause instanceof Error ? cause.message : String(cause))
    })
  }

  return (
    <div ref={rootRef} className="dsh-cpa-account-indicator-shell" role="status" aria-live="polite">
      <button
        type="button"
        className={`dsh-cpa-account-indicator is-${availability}`}
        aria-label={title}
        aria-haspopup="menu"
        aria-expanded={open}
        title={title}
        onClick={() => { setOpen(value => !value) }}
      >
        <span className="dsh-cpa-account-indicator-progress" style={percent === undefined ? undefined : { width: `${percent}%` }} />
        <span className="dsh-cpa-account-indicator-label">{accountLabel(account)}</span>
        <span className="dsh-cpa-account-indicator-quota">
          <span className="dsh-cpa-quota-full">{quotaLabel}</span>
          <span className="dsh-cpa-quota-short">{shortQuotaLabel}</span>
        </span>
        <span className="dsh-cpa-account-indicator-dot" aria-hidden="true" />
      </button>
      {open ? (
        <div className="dsh-cpa-account-menu" role="menu" aria-label={t('account.switcher')}>
          {liveSupported.map(option => <AccountOption key={option.authIndex} account={option} selected={option.authIndex === account.authIndex} onChoose={choose} t={t} />)}
          {error !== null ? <div className="dsh-cpa-account-menu-error" role="alert">{error}</div> : null}
        </div>
      ) : null}
    </div>
  )
}

function AccountOption({
  account,
  selected,
  onChoose,
  t,
}: {
  account: CpaAccount
  selected: boolean
  onChoose: (account: CpaAccount) => void
  t: Props['t']
}) {
  const availability = accountAvailability(account)
  const progress = accountQuotaProgress(account.quota, t)
  const primary = progress[0]
  const percent = primary?.percent
  const stats = accountWindowStats(account)
  return (
    <button
      type="button"
      className={`dsh-cpa-account-option is-${availability}${selected ? ' is-selected' : ''}`}
      role="menuitemradio"
      aria-checked={selected}
      onClick={() => { onChoose(account) }}
    >
      <span className="dsh-cpa-account-option-progress" style={percent === undefined ? undefined : { width: `${percent}%` }} />
      <span className="dsh-cpa-account-option-copy">
        <strong className="dsh-cpa-account-option-title">
          <span>{accountLabel(account)}</span>
          {stats.success > 0 ? <span className="dsh-cpa-count is-success">· {stats.success}</span> : null}
          {stats.failed > 0 ? <span className="dsh-cpa-count is-failed">· {stats.failed}</span> : null}
        </strong>
        <small>{accountIdentity(account)}</small>
      </span>
      <span className="dsh-cpa-account-option-quota">{primary === undefined ? t('account.quotaUnknown') : primary.percent === undefined ? primary.label : `${Math.round(primary.percent)}%`}</span>
      {selected ? <span className="dsh-cpa-account-option-check" aria-hidden="true">✓</span> : null}
    </button>
  )
}

function currentAccount(accounts: readonly CpaAccount[], selected: string | undefined): CpaAccount | undefined {
  if (selected !== undefined) {
    const explicit = accounts.find(account => account.authIndex === selected)
    if (explicit !== undefined) return explicit
  }
  return accounts.find(account => accountAvailability(account) === 'available') ?? accounts[0]
}

function modelListContains(models: readonly string[], modelId: string): boolean {
  const wanted = modelId.trim().toLowerCase()
  return wanted !== '' && models.some(model => model.trim().toLowerCase() === wanted)
}

function formatProgress(progress: AccountQuotaProgress): string {
  const percent = progress.percent === undefined ? '—' : `${Math.round(progress.percent)}%`
  return `${progress.label} ${percent}`
}
