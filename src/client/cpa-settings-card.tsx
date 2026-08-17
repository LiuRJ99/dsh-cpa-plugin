import { useState } from 'react'
import type { IApiClient } from '@deepseek-ai/dsh-client-connection/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { CpaAccount } from './protocol.ts'
import { CpaClient, type CpaClientState } from './cpa-client.ts'
import type { CpaLocaleKey } from './locales.ts'
import { accountAvailability, accountAvailabilityLabel, accountIdentity, accountLabel, accountQuotaProgress, formatQuotaResetAt, type AccountQuotaProgress } from './cpa-account-display.ts'
import { CpaModelSettingsModule, type CpaModelSettingsController, type CpaModelSettingsFace } from './cpa-model-settings.tsx'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'

const REFRESH_INTERVALS = [0, 5 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000, 3 * 60 * 60 * 1000, 5 * 60 * 60 * 1000] as const

interface CpaSettingsState {
  available: boolean
  writable: boolean
  dirty: boolean
  saving: boolean
  failed: boolean
  error: string | null
  endpoint: string
  providerId: string
  managementKeyEnv: string
  refreshIntervalMs: number
  keyDraft: string
  keyConfigured: boolean
  keyWritable: boolean
  modelConfigured: boolean
  accounts: readonly CpaAccount[]
  quotaFetchedAt: string | undefined
  accountStatus: CpaClientState['status']
  accountError: string | null
}

export interface CpaSettingsCardFace {
  hooks: {
    cpaSettings: SnapshotStore<CpaSettingsState>
  }
  model: CpaModelSettingsFace
  edit: (field: 'keyDraft' | 'endpoint', value: string) => void
  save: () => void
  discard: () => void
  refresh: () => void
  setRefreshInterval: (value: number) => void
}

export class CpaSettingsCardController {
  private keyDraft = ''
  private endpointDraft: string | undefined
  private saving = false
  private failed = false
  private error: string | null = null
  private keyConfigured = false
  private keyWritable = true
  private readonly store: SnapshotStore<CpaSettingsState>

  constructor(
    private readonly api: Pick<IApiClient, 'credentials'>,
    private readonly cpa: CpaClient,
    private readonly model: CpaModelSettingsController,
  ) {
    this.store = this.makeStore()
    cpa.store.subscribe(() => { this.publish() })
    model.store.subscribe(() => {
      if (!model.store.getSnapshot().dirty) this.endpointDraft = undefined
      this.publish()
    })
    void this.readCredential()
    void cpa.loadConfig().catch(() => { /* card reports the error through cpa state */ })
  }

  inject(): CpaSettingsCardFace {
    return {
      hooks: { cpaSettings: this.store },
      model: this.model.inject(),
      edit: (field, value) => {
        if (field === 'keyDraft') this.keyDraft = value
        if (field === 'endpoint') {
          this.endpointDraft = value
          this.model.inject().editBaseURL(toModelEndpoint(value))
        }
        this.failed = false
        this.error = null
        this.publish()
      },
      save: () => { void this.save() },
      discard: () => {
        this.keyDraft = ''
        this.endpointDraft = undefined
        this.failed = false
        this.error = null
        void this.model.discard()
        this.publish()
      },
      refresh: () => { void this.refresh() },
       setRefreshInterval: (value) => { void this.setRefreshInterval(value) },
    }
  }

  private makeStore(): SnapshotStore<CpaSettingsState> {
    return createSnapshotStore(this.projection())
  }

  private projection(): CpaSettingsState {
    const cpa = this.cpa.store.getSnapshot()
    const model = this.model.store.getSnapshot()
    return {
      available: true,
      writable: true,
      dirty: this.keyDraft.trim() !== '' || model.dirty,
      saving: this.saving || model.saving,
      failed: this.failed,
      error: this.error ?? cpa.error,
      endpoint: this.endpointDraft ?? (managementEndpoint(model.baseURL) || managementEndpoint(cpa.endpoint)),
      providerId: cpa.providerId,
      managementKeyEnv: cpa.managementKeyEnv,
      refreshIntervalMs: cpa.refreshIntervalMs,
       keyDraft: this.keyDraft,
      keyConfigured: this.keyConfigured || cpa.managementKeyConfigured,
      keyWritable: this.keyWritable,
      modelConfigured: model.configured,
      accounts: cpa.accounts,
      quotaFetchedAt: cpa.quotaFetchedAt,
      accountStatus: cpa.status,
      accountError: cpa.error,
    }
  }

  private async readCredential(): Promise<void> {
    const ref = this.cpa.store.getSnapshot().managementKeyEnv.trim()
    if (!isCredentialRef(ref)) {
      this.keyConfigured = false
      this.keyWritable = true
      this.publish()
      return
    }
    try {
      const response = await this.api.credentials.describe({ refs: [ref] })
      if (!response.result.ok || ref !== this.cpa.store.getSnapshot().managementKeyEnv.trim()) return
      const view = response.result.value.credentials[ref]
      this.keyConfigured = view?.configured ?? false
      this.keyWritable = view?.writable ?? true
      this.publish()
    } catch {
      // A key status is advisory; settings remain editable while the API is offline.
    }
  }

  private async save(): Promise<void> {
    const modelDirty = this.model.store.getSnapshot().dirty
    if (this.saving || (this.keyDraft.trim() === '' && !modelDirty)) return
    const ref = this.cpa.store.getSnapshot().managementKeyEnv.trim()
    if (this.keyDraft.trim() !== '' && !isCredentialRef(ref)) {
      this.failed = true
      this.error = 'invalid management key reference'
      this.publish()
      return
    }
    this.saving = true
    this.failed = false
    this.error = null
    this.publish()
    try {
      if (this.model.store.getSnapshot().dirty) await this.model.save()
      if (this.keyDraft.trim() !== '') {
        const response = await this.api.credentials.set({ ref: ref as never, value: this.keyDraft.trim() })
        if (!response.result.ok) throw new Error(response.result.error.message)
        this.keyDraft = ''
      }
      await this.cpa.refreshConfig().catch(() => { /* unified refresh below reports it */ })
      await this.refresh()
    } catch (error) {
      this.failed = true
      this.error = error instanceof Error ? error.message : String(error)
    } finally {
      this.saving = false
      this.publish()
    }
  }

  private async refresh(): Promise<void> {
    await this.cpa.refreshConfig().catch(() => { /* unified refresh retains the cause */ })
    await this.cpa.refresh().catch(() => {})
    this.publish()
  }

  private async setRefreshInterval(value: number): Promise<void> {
    await this.cpa.setRefreshInterval(value).catch(() => {})
    this.publish()
  }

  private publish(): void {
    this.store.set(this.projection())
  }
}

type CardProps = PropsRuntime<'settings.plugin.item'> & PropsLocale<'dsh-cpa'> & InjectFace<CpaSettingsCardFace>

export function CpaSettingsCard(props: CardProps) {
  const state = props.useCpaSettings(snapshot => snapshot)
  const [open, setOpen] = useState(false)
  const t = props.t
  if (!state.available) return null
  const cpaState = state
  const disabled = !cpaState.writable || cpaState.saving
  return (
    <li className="dsh-cpa-settings-card">
      <button type="button" className="dsh-cpa-settings-header" aria-expanded={open} onClick={() => {
        const next = !open
        setOpen(next)
        if (next) props.refresh()
      }}>
        <span><strong>{t('settings.title')}</strong><small>{t('settings.description')}</small></span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="dsh-cpa-settings-body">
          {!cpaState.writable ? <p className="dsh-cpa-settings-muted">{t('settings.readOnly')}</p> : null}
          <div className="dsh-cpa-settings-field">
            <label htmlFor="dsh-cpa-management-endpoint">{t('settings.endpoint')}</label>
            <input id="dsh-cpa-management-endpoint" type="text" autoComplete="off" value={cpaState.endpoint} disabled={disabled} onChange={event => { props.edit('endpoint', event.target.value) }} />
            <small>{t('settings.endpointHint')}</small>
          </div>
          <div className="dsh-cpa-settings-field">
            <label htmlFor="dsh-cpa-management-key">{t('settings.key')}</label>
            <input id="dsh-cpa-management-key" type="password" autoComplete="off" value={cpaState.keyDraft} disabled={disabled || !cpaState.keyWritable} onChange={event => { props.edit('keyDraft', event.target.value) }} />
            <small>{t('settings.keyHint')}</small>
            <span className={cpaState.keyConfigured ? 'dsh-cpa-key-state is-set' : 'dsh-cpa-key-state'}>{cpaState.keyConfigured ? t('settings.keySet') : t('settings.keyUnset')}</span>
          </div>
          <div className="dsh-cpa-settings-accounts">
            <div className="dsh-cpa-settings-accounts-head"><strong>{t('settings.accounts')}</strong><span><button type="button" disabled={cpaState.accountStatus === 'loading'} onClick={props.refresh}>{cpaState.accountStatus === 'loading' ? t('settings.refreshing') : t('settings.refresh')}</button><select disabled={disabled} aria-label={t('settings.refresh')} value={String(cpaState.refreshIntervalMs)} onChange={event => { props.setRefreshInterval(Number(event.target.value)) }}>
               <option value="0">{t('settings.refreshManual')}</option>
               <option value={String(REFRESH_INTERVALS[1])}>{t('settings.refresh5m')}</option>
               <option value={String(REFRESH_INTERVALS[2])}>{t('settings.refresh30m')}</option>
               <option value={String(REFRESH_INTERVALS[3])}>{t('settings.refresh1h')}</option>
               <option value={String(REFRESH_INTERVALS[4])}>{t('settings.refresh3h')}</option>
               <option value={String(REFRESH_INTERVALS[5])}>{t('settings.refresh5h')}</option>
             </select></span></div>
            <small className="dsh-cpa-settings-muted">{t('settings.refreshHint')}</small>
             {cpaState.accountError ? <p className="dsh-cpa-settings-error">{cpaState.accountError}</p> : null}
            {cpaState.accounts.length === 0 && !cpaState.accountError ? <p className="dsh-cpa-settings-muted">{t('settings.noAccounts')}</p> : null}
            {cpaState.accounts.map(account => <AccountRow key={account.authIndex} account={account} t={t} />)}
          </div>
          <CpaModelSettingsModule {...props.model} t={t} />
          {cpaState.error && !cpaState.accountError ? <p className="dsh-cpa-settings-error">{cpaState.error}</p> : null}
          <div className="dsh-cpa-settings-actions">
            <button type="button" disabled={!cpaState.dirty || cpaState.saving} onClick={props.discard}>{t('settings.discard')}</button>
            <button type="button" className="is-primary" disabled={!cpaState.dirty || cpaState.saving} onClick={props.save}>{cpaState.saving ? t('settings.saving') : t('settings.save')}</button>
          </div>
          {cpaState.failed ? <p className="dsh-cpa-settings-error">{cpaState.error ?? t('settings.saveFailed')}</p> : null}
        </div>
      ) : null}
    </li>
  )
}

function AccountRow({ account, t }: { account: CpaAccount; t: (key: CpaLocaleKey, params?: Record<string, string>) => string }) {
  const availability = accountAvailability(account)
  const status = accountAvailabilityLabel(account, t)
  const quota = accountQuotaProgress(account.quota, t)
  return (
    <div className="dsh-cpa-account-row">
      <span className="dsh-cpa-account-copy">
        <strong>{accountLabel(account)}</strong>
        <small>{accountIdentity(account)}</small>
        {quota.length > 0 ? <span className="dsh-cpa-account-quota">{quota.map(window => <QuotaProgress key={window.key} progress={window} availability={availability} t={t} />)}</span> : <small className="dsh-cpa-account-quota-empty">{t('account.quotaUnknown')}</small>}
      </span>
      <span className={`dsh-cpa-account-status-dot is-${availability}`} role="img" aria-label={status} title={status} />
    </div>
  )
}

function QuotaProgress({
  progress,
  availability,
  t,
}: {
  progress: AccountQuotaProgress
  availability: ReturnType<typeof accountAvailability>
  t: (key: CpaLocaleKey, params?: Record<string, string>) => string
}) {
  const value = progress.percent === undefined ? undefined : Math.round(progress.percent)
  const reset = progress.resetAt === undefined ? undefined : formatQuotaResetAt(progress.resetAt)
  const progressAttributes = value === undefined ? {} : { 'aria-valuenow': value }
  return (
    <span className={`dsh-cpa-account-quota-window is-${availability}${value === undefined ? ' is-unknown' : ''}`}>
      <span className="dsh-cpa-account-quota-label">{progress.label}</span>
      <span className="dsh-cpa-account-quota-track" role="progressbar" aria-label={`${progress.label}${value === undefined ? '' : ` ${value}%`}`} aria-valuemin={0} aria-valuemax={100} {...progressAttributes}>
        <span className="dsh-cpa-account-quota-fill" style={value === undefined ? undefined : { width: `${value}%` }} />
      </span>
      <span className="dsh-cpa-account-quota-value">{value === undefined ? t('account.quotaUnknown') : `${value}%`}</span>
      {reset === undefined ? null : <small className="dsh-cpa-account-quota-reset">{t('account.nextReset', { time: reset })}</small>}
    </span>
  )
}

function managementEndpoint(value: string): string {
  return value.trim().replace(/\/+$/, '').replace(/\/v1$/i, '')
}

function toModelEndpoint(value: string): string {
  const normalized = value.trim().replace(/\/+$/, '')
  if (normalized === '') return ''
  return /\/v1$/i.test(normalized) ? normalized : `${normalized}/v1`
}

function isCredentialRef(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
}
