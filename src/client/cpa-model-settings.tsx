import { useState, useSyncExternalStore } from 'react'
import type { DiscoveredModelView, IApiClient, SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-runtime/client'
import type { CpaLocaleKey } from './locales.ts'
import type { CpaClient } from './cpa-client.ts'

const SETTINGS_NS = 'llm-pi-ai'
const DISCOVERY_NS = 'llm-cliproxyapi'
const DEFAULT_KEY_REF = 'CPA_MODEL_API_KEY'
const DEFAULT_CPA_MODEL_API = 'openai-responses'

/**
 * CPA's OpenAI-compatible model catalog defaults to these named levels when
 * a model does not declare a narrower thinking capability. Keep this list
 * conservative: CPA may route the same model id to different upstreams, so
 * offering xhigh/max here would make otherwise valid accounts reject requests.
 */
type CpaReasoningEfforts = false | Readonly<Record<string, string | null>>

const DEFAULT_CPA_REASONING_EFFORTS: Readonly<Record<string, string | null>> = {
  off: null,
  low: 'low',
  medium: 'medium',
  high: 'high',
}

export interface CpaModelDraft {
  id: string
  name: string
  contextWindow?: number
  maxTokens?: number
  reasoningEfforts?: CpaReasoningEfforts
}

interface CpaModelSettingsState {
  available: boolean
  writable: boolean
  configured: boolean
  loading: boolean
  discovering: boolean
  saving: boolean
  dirty: boolean
  providerId: string
  baseURL: string
  apiKeyEnv: string
  keyDraft: string
  keyConfigured: boolean
  keyWritable: boolean
  models: readonly CpaModelDraft[]
  error: string | null
  discoveryError: string | null
}

export interface CpaModelSettingsFace {
  hooks: {
    cpaModelSettings: SnapshotStore<CpaModelSettingsState>
  }
  editKey: (value: string) => void
  editBaseURL: (value: string) => void
  editModel: (index: number, field: 'id' | 'name', value: string) => void
  addModel: () => void
  removeModel: (index: number) => void
  discover: () => void
  save: () => void
  discard: () => void
}

type ModelProfile = Record<string, unknown>

interface ModelDraftState {
  providerId: string
  api: string
  baseURL: string
  apiKeyEnv: string
  keyDraft: string
  models: CpaModelDraft[]
}

interface NormalizedCpaModel {
  id: string
  name?: string
  contextWindow?: number
  maxTokens?: number
  reasoningEfforts: CpaReasoningEfforts
}

/** Page-owned configuration for the CPA model route. */
export class CpaModelSettingsController {
  readonly store: SnapshotStore<CpaModelSettingsState>

  private namespace: SettingsNamespaceView | undefined
  private revision = 0
  private writable = false
  private loading = true
  private discovering = false
  private saving = false
  private configured = false
  private keyConfigured = false
  private keyWritable = true
  private migrating = false
  private error: string | null = null
  private discoveryError: string | null = null
  private draft: ModelDraftState = {
    providerId: 'cpa',
    api: DEFAULT_CPA_MODEL_API,
    baseURL: '',
    apiKeyEnv: DEFAULT_KEY_REF,
    keyDraft: '',
    models: [],
  }
  private baseline: ModelDraftState = cloneDraft(this.draft)

  constructor(
    private readonly api: Pick<IApiClient, 'settings' | 'credentials' | 'llm'>,
    private readonly cpa: CpaClient,
  ) {
    this.store = createSnapshotStore(this.projection())
    cpa.store.subscribe(() => {
      if (!this.isDirty()) void this.load()
      else this.publish()
    })
    void this.load()
  }

  inject(): CpaModelSettingsFace {
    return {
      hooks: { cpaModelSettings: this.store },
      editKey: (value) => {
        this.draft.keyDraft = value
        this.error = null
        this.publish()
      },
      editBaseURL: (value) => {
        this.draft.baseURL = value
        this.error = null
        this.discoveryError = null
        this.publish()
      },
      editModel: (index, field, value) => {
        const model = this.draft.models[index]
        if (model === undefined) return
        this.draft.models[index] = { ...model, [field]: value }
        this.error = null
        this.publish()
      },
      addModel: () => {
        this.draft.models.push({
          id: '',
          name: '',
          reasoningEfforts: cloneReasoningEfforts(DEFAULT_CPA_REASONING_EFFORTS),
        })
        this.error = null
        this.publish()
      },
      removeModel: (index) => {
        this.draft.models.splice(index, 1)
        this.error = null
        this.publish()
      },
      discover: () => { void this.discover() },
      save: () => { void this.save() },
      discard: () => { void this.discard() },
    }
  }

  /** Reload the redacted settings after the native Models page changes them. */
  reload(): void {
    if (this.migrating || this.saving || this.isDirty()) {
      this.publish()
      return
    }
    void this.load()
  }

  private async load(): Promise<void> {
    if (this.loading && this.namespace !== undefined) return
    this.loading = true
    this.error = null
    this.publish()
    try {
      const response = await this.api.settings.describe({})
      if (!response.result.ok) throw new Error(response.result.error.message)
      this.writable = response.result.value.writable
      this.namespace = response.result.value.namespaces.find((entry: SettingsNamespaceView) => entry.ns === SETTINGS_NS)
      const providerId = this.cpa.store.getSnapshot().providerId.trim() || 'cpa'
      const profile = profileAt(this.namespace, providerId)
      this.revision = this.namespace?.revision ?? 0
      this.configured = profile !== undefined
      this.draft = {
        providerId,
        api: stringValue(profile?.api) ?? DEFAULT_CPA_MODEL_API,
        baseURL: stringValue(profile?.baseURL) ?? modelBaseURL(this.cpa.store.getSnapshot().endpoint),
        apiKeyEnv: stringValue(profile?.apiKeyEnv) ?? DEFAULT_KEY_REF,
        keyDraft: '',
        models: modelsOf(profile?.models),
      }
      this.baseline = cloneDraft(this.draft)
      await this.readCredential()
      await this.ensureReasoningConfiguration(profile)
    } catch (cause) {
      this.error = messageOf(cause)
    } finally {
      this.loading = false
      this.publish()
    }
  }

  /**
   * Older plugin versions wrote only model ids. Migrate those profiles once so
   * the Host model catalog can expose the existing effort picker without
   * requiring the user to edit every model and press Save again.
   */
  private async ensureReasoningConfiguration(profile: ModelProfile | undefined): Promise<void> {
    if (!this.writable || this.namespace === undefined || this.migrating || profile === undefined) return

    const configuredApi = stringValue(profile?.api)
    const compat = valueObject(profile?.compat)
    const migrateLegacyCompletions = isCompletionsApi(configuredApi ?? '') && isLegacyCpaCompat(compat)
    const api = migrateLegacyCompletions ? DEFAULT_CPA_MODEL_API : configuredApi ?? DEFAULT_CPA_MODEL_API
    const rawModels = modelProfilesWithDefaultReasoning(profile.models, api)
    const ops: ({ op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] })[] = []
    if (configuredApi === undefined || migrateLegacyCompletions) {
      ops.push({
        op: 'set',
        path: ['providers', this.draft.providerId, 'api'],
        value: DEFAULT_CPA_MODEL_API,
      })
    }
    if (rawModels.changed) {
      ops.push({
        op: 'set',
        path: ['providers', this.draft.providerId, 'models'],
        value: rawModels.models,
      })
    }
    if ((!isCompletionsApi(api) || migrateLegacyCompletions) && hasCompletionCompat(compat)) {
      ops.push({
        op: 'unset',
        path: ['providers', this.draft.providerId, 'compat'],
      })
    }
    if (ops.length === 0) return

    this.migrating = true
    try {
      const response = await this.api.settings.mutate({
        ns: SETTINGS_NS,
        expectedRevision: this.revision,
        ops,
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      this.namespace = response.result.value
      this.revision = response.result.value.revision
      this.configured = true
    } finally {
      this.migrating = false
    }
  }

  private async readCredential(): Promise<void> {
    try {
      const response = await this.api.credentials.describe({ refs: [this.draft.apiKeyEnv] })
      if (!response.result.ok) return
      const view = response.result.value.credentials[this.draft.apiKeyEnv]
      this.keyConfigured = view?.configured ?? false
      this.keyWritable = view?.writable ?? true
    } catch {
      // Credential state is advisory; the model form remains usable offline.
    }
  }

  private async discover(): Promise<void> {
    if (this.discovering) return
    const baseURL = this.draft.baseURL.trim()
    if (baseURL === '') {
      this.discoveryError = 'CLIProXyAPI model endpoint is empty'
      this.publish()
      return
    }
    if (!this.draft.keyDraft.trim() && !this.keyConfigured && !this.configured) {
      this.discoveryError = 'Enter the CLIProXyAPI model key before fetching models'
      this.publish()
      return
    }
    this.discovering = true
    this.discoveryError = null
    this.publish()
    try {
      const response = await this.api.llm.discoverModels({
        settingsNs: DISCOVERY_NS,
        provider: this.draft.providerId,
        baseURL,
        api: this.draft.api,
        ...this.draft.keyDraft.trim() === '' ? {} : { apiKey: this.draft.keyDraft.trim() },
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      const found = response.result.value.models
      if (found.length === 0) throw new Error('CLIProXyAPI returned no models')
      this.draft.models = mergeModels(this.draft.models, found)
    } catch (cause) {
      this.discoveryError = messageOf(cause)
    } finally {
      this.discovering = false
      this.publish()
    }
  }

  async save(): Promise<void> {
    if (this.saving || !this.isDirty()) return
    const models = normalizeModels(this.draft.models)
    if ('error' in models) {
      this.error = models.error
      this.publish()
      return
    }
    if (this.draft.providerId.trim() === '') {
      this.error = 'CLIProXyAPI provider id is empty'
      this.publish()
      return
    }
    if (this.draft.baseURL.trim() === '') {
      this.error = 'CLIProXyAPI model endpoint is empty'
      this.publish()
      return
    }
    if (!this.draft.keyDraft.trim() && !this.keyConfigured) {
      this.error = 'Enter the CLIProXyAPI model key before saving'
      this.publish()
      return
    }
    this.saving = true
    this.error = null
    this.publish()
    try {
      if (this.draft.keyDraft.trim() !== '') {
        const key = await this.api.credentials.set({ ref: this.draft.apiKeyEnv as never, value: this.draft.keyDraft.trim() })
        if (!key.result.ok) throw new Error(key.result.error.message)
      }
      const ops: ({ op: 'set'; path: string[]; value: unknown } | { op: 'unset'; path: string[] })[] = [
        { op: 'set', path: ['providers', this.draft.providerId, 'api'], value: this.draft.api },
        { op: 'set', path: ['providers', this.draft.providerId, 'baseURL'], value: this.draft.baseURL.trim() },
        { op: 'set', path: ['providers', this.draft.providerId, 'apiKeyEnv'], value: this.draft.apiKeyEnv },
      ]
      if (!isCompletionsApi(this.draft.api)) {
        ops.push({ op: 'unset', path: ['providers', this.draft.providerId, 'compat'] })
      }
      ops.push({ op: 'set', path: ['providers', this.draft.providerId, 'models'], value: models.value })
      const response = await this.api.settings.mutate({
        ns: SETTINGS_NS,
        expectedRevision: this.revision,
        ops,
      })
      if (!response.result.ok) throw new Error(response.result.error.message)
      this.namespace = response.result.value
      this.revision = response.result.value.revision
      this.configured = true
      this.draft.keyDraft = ''
      this.draft.providerId = this.draft.providerId.trim()
      this.draft.baseURL = this.draft.baseURL.trim()
      this.draft.models = models.value.map(model => ({
        id: model.id,
        name: model.name ?? '',
        ...positiveInteger(model.contextWindow) === undefined ? {} : { contextWindow: positiveInteger(model.contextWindow) },
        ...positiveInteger(model.maxTokens) === undefined ? {} : { maxTokens: positiveInteger(model.maxTokens) },
        reasoningEfforts: cloneReasoningEfforts(model.reasoningEfforts),
      }))
      this.baseline = cloneDraft(this.draft, models.value)
      await this.readCredential()
    } catch (cause) {
      this.error = messageOf(cause)
    } finally {
      this.saving = false
      this.publish()
    }
  }

  async discard(): Promise<void> {
    await this.load()
  }

  private isDirty(): boolean {
    return !sameDraft(this.draft, this.baseline)
  }

  private projection(): CpaModelSettingsState {
    return {
      available: this.namespace !== undefined || this.loading,
      writable: this.writable,
      configured: this.configured,
      loading: this.loading,
      discovering: this.discovering,
      saving: this.saving,
      dirty: this.isDirty(),
      providerId: this.draft.providerId,
      baseURL: this.draft.baseURL,
      apiKeyEnv: this.draft.apiKeyEnv,
      keyDraft: this.draft.keyDraft,
      keyConfigured: this.keyConfigured,
      keyWritable: this.keyWritable,
      models: this.draft.models,
      error: this.error,
      discoveryError: this.discoveryError,
    }
  }

  private publish(): void {
    this.store.set(this.projection())
  }
}

type ModelModuleProps = CpaModelSettingsFace & { t: (key: CpaLocaleKey, params?: Record<string, string>) => string }

export function CpaModelSettingsModule(props: ModelModuleProps) {
  const state = useSyncExternalStore(
    listener => props.hooks.cpaModelSettings.subscribe(listener),
    () => props.hooks.cpaModelSettings.getSnapshot(),
    () => props.hooks.cpaModelSettings.getSnapshot(),
  )
  const [open, setOpen] = useState(!state.configured)
  if (!state.available) return null
  const disabled = !state.writable || state.loading || state.saving
  return (
    <section className="dsh-cpa-model-settings">
      <button type="button" className="dsh-cpa-model-settings-header" aria-expanded={open} onClick={() => { setOpen(value => !value) }}>
        <span><strong>{props.t('modelSettings.title')}</strong><small>{props.t(state.configured ? 'modelSettings.description' : 'modelSettings.unconfigured')}</small></span>
        <span aria-hidden="true">⌄</span>
      </button>
      {open ? (
        <div className="dsh-cpa-model-settings-body">
          <div className="dsh-cpa-settings-field">
            <label htmlFor="dsh-cpa-model-key">{props.t('modelSettings.key')}</label>
            <input id="dsh-cpa-model-key" type="password" autoComplete="off" value={state.keyDraft} disabled={disabled || !state.keyWritable} onChange={event => { props.editKey(event.target.value) }} />
            <small>{props.t('modelSettings.keyHint')}</small>
            <span className={state.keyConfigured ? 'dsh-cpa-key-state is-set' : 'dsh-cpa-key-state'}>{state.keyConfigured ? props.t('settings.keySet') : props.t('settings.keyUnset')}</span>
          </div>
          <div className="dsh-cpa-model-settings-list-head">
            <strong>{props.t('modelSettings.models')}</strong>
            <button type="button" disabled={disabled || state.discovering} onClick={props.discover}>{state.discovering ? props.t('modelSettings.fetching') : props.t('modelSettings.fetch')}</button>
          </div>
          <p className="dsh-cpa-settings-note">{props.t('modelSettings.modelsHint')}</p>
          {state.discoveryError ? <p className="dsh-cpa-settings-error">{state.discoveryError}</p> : null}
          {state.models.map((model, index) => (
            <div className="dsh-cpa-model-draft" key={`model-${index}`}>
              <input type="text" value={model.id} placeholder={props.t('modelSettings.id')} disabled={disabled} aria-label={props.t('modelSettings.id')} onChange={event => { props.editModel(index, 'id', event.target.value) }} />
              <input type="text" value={model.name} placeholder={props.t('modelSettings.name')} disabled={disabled} aria-label={props.t('modelSettings.name')} onChange={event => { props.editModel(index, 'name', event.target.value) }} />
              <button type="button" disabled={disabled} aria-label={props.t('modelSettings.remove')} onClick={() => { props.removeModel(index) }}>×</button>
            </div>
          ))}
          <button type="button" className="dsh-cpa-model-add" disabled={disabled} onClick={props.addModel}>＋ {props.t('modelSettings.add')}</button>
          {state.error ? <p className="dsh-cpa-settings-error">{state.error}</p> : null}
        </div>
      ) : null}
    </section>
  )
}

function profileAt(namespace: SettingsNamespaceView | undefined, providerId: string): ModelProfile | undefined {
  const providers = namespace?.value
  if (typeof providers !== 'object' || providers === null) return undefined
  const profile = (providers as { providers?: unknown }).providers
  if (typeof profile !== 'object' || profile === null) return undefined
  const value = (profile as Record<string, unknown>)[providerId]
  return typeof value === 'object' && value !== null ? value as ModelProfile : undefined
}

function modelsOf(value: unknown): CpaModelDraft[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) return []
    const raw = entry as Record<string, unknown>
    const id = stringValue(raw.id)
    if (id === undefined) return []
    const reasoningEfforts = reasoningEffortsForModel(reasoningEffortsOf(raw.reasoningEfforts))
    return [{
      id,
      name: stringValue(raw.name) ?? '',
      ...positiveInteger(raw.contextWindow) === undefined ? {} : { contextWindow: positiveInteger(raw.contextWindow) },
      ...positiveInteger(raw.maxTokens) === undefined ? {} : { maxTokens: positiveInteger(raw.maxTokens) },
      reasoningEfforts: cloneReasoningEfforts(reasoningEfforts),
    }]
  })
}

function mergeModels(current: readonly CpaModelDraft[], found: readonly DiscoveredModelView[]): CpaModelDraft[] {
  const existing = new Map(current.filter(model => model.id.trim() !== '').map(model => [model.id.trim(), model]))
  for (const model of found) {
    if (!existing.has(model.id)) {
      existing.set(model.id, {
        id: model.id,
        name: model.name ?? '',
        ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
        ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
        reasoningEfforts: cloneReasoningEfforts(reasoningEffortsForModel()),
      })
    }
  }
  return [...existing.values()]
}

function normalizeModels(models: readonly CpaModelDraft[]): { value: readonly NormalizedCpaModel[] } | { error: string } {
  const seen = new Set<string>()
  const value: NormalizedCpaModel[] = []
  for (const model of models) {
    const id = model.id.trim()
    if (id === '') return { error: 'Model id cannot be empty' }
    if (seen.has(id)) return { error: `Duplicate model id: ${id}` }
    seen.add(id)
    const name = model.name.trim()
    const reasoningEfforts = reasoningEffortsForModel(model.reasoningEfforts)
    value.push({
      ...(name === '' ? { id } : { id, name }),
      ...positiveInteger(model.contextWindow) === undefined ? {} : { contextWindow: positiveInteger(model.contextWindow) },
      ...positiveInteger(model.maxTokens) === undefined ? {} : { maxTokens: positiveInteger(model.maxTokens) },
      reasoningEfforts: cloneReasoningEfforts(reasoningEfforts),
    })
  }
  if (value.length === 0) return { error: 'Add at least one CLIProXyAPI model' }
  return { value }
}

function cloneDraft(draft: ModelDraftState, models: readonly NormalizedCpaModel[] | readonly CpaModelDraft[] = draft.models): ModelDraftState {
  return {
    ...draft,
    keyDraft: '',
    models: models.map(model => ({
      id: model.id,
      name: model.name ?? '',
      ...positiveInteger(model.contextWindow) === undefined ? {} : { contextWindow: positiveInteger(model.contextWindow) },
      ...positiveInteger(model.maxTokens) === undefined ? {} : { maxTokens: positiveInteger(model.maxTokens) },
      reasoningEfforts: cloneReasoningEfforts(reasoningEffortsForModel(model.reasoningEfforts)),
    })),
  }
}

function sameDraft(left: ModelDraftState, right: ModelDraftState): boolean {
  return left.providerId === right.providerId
    && left.api === right.api
    && left.baseURL === right.baseURL
    && left.apiKeyEnv === right.apiKeyEnv
    && left.keyDraft === right.keyDraft
    && JSON.stringify(left.models) === JSON.stringify(right.models)
}

function modelBaseURL(endpoint: string): string {
  const value = endpoint.trim().replace(/\/+$/, '')
  if (value === '') return ''
  return value.endsWith('/v1') ? value : `${value}/v1`
}

function modelProfilesWithDefaultReasoning(value: unknown, api: string): { models: readonly Record<string, unknown>[]; changed: boolean } {
  if (!Array.isArray(value)) return { models: [], changed: false }
  let changed = false
  const models = value.flatMap(entry => {
    if (typeof entry !== 'object' || entry === null) return []
    const raw = entry as Record<string, unknown>
    const id = stringValue(raw.id)
    if (id === undefined) return []
    const cleaned = isCompletionsApi(api) ? raw : withoutCompletionCompat(raw)
    if (cleaned !== raw) changed = true
    const configured = reasoningEffortsOf(cleaned.reasoningEfforts)
    const reasoningEfforts = reasoningEffortsForModel(configured)
    const hasReasoning = Object.prototype.hasOwnProperty.call(cleaned, 'reasoningEfforts')
    if (hasReasoning && configured !== undefined) return [cleaned]
    changed = true
    return [{ ...cleaned, reasoningEfforts: cloneReasoningEfforts(reasoningEfforts) }]
  })
  return { models, changed }
}

function withoutCompletionCompat(model: Record<string, unknown>): Record<string, unknown> {
  const compat = valueObject(model.compat)
  if (compat === undefined || !hasCompletionCompat(compat)) return model
  const rest = Object.fromEntries(Object.entries(compat).filter(([key]) => key !== 'thinkingFormat' && key !== 'supportsReasoningEffort'))
  const next = { ...model }
  if (Object.keys(rest).length === 0) delete next.compat
  else next.compat = rest
  return next
}

function reasoningEffortsOf(value: unknown): CpaReasoningEfforts | undefined {
  if (value === false) return false
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const result: Record<string, string | null> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry === null || typeof entry === 'string') result[key] = entry
  }
  return result
}

function cloneReasoningEfforts(value: CpaReasoningEfforts): CpaReasoningEfforts {
  return value === false ? false : { ...value }
}

function reasoningEffortsForModel(configured?: CpaReasoningEfforts): CpaReasoningEfforts {
  if (configured === false) return false
  return configured ?? DEFAULT_CPA_REASONING_EFFORTS
}

function valueObject(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function hasCompletionCompat(value: Record<string, unknown> | undefined): boolean {
  return value?.['thinkingFormat'] !== undefined || value?.['supportsReasoningEffort'] !== undefined
}

/** Compat written by pre-Responses versions of this plugin. */
function isLegacyCpaCompat(value: Record<string, unknown> | undefined): boolean {
  if (value?.['thinkingFormat'] !== 'openai' || value?.['supportsReasoningEffort'] !== true) return false
  return Object.keys(value).every(key => key === 'thinkingFormat' || key === 'supportsReasoningEffort')
}

function isCompletionsApi(value: string): boolean {
  return value.trim().toLowerCase() === 'openai-completions'
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined
}

function positiveInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : undefined
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
