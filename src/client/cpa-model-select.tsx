import {
  useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type KeyboardEvent,
} from 'react'
import type { ModelProviderGroup, ModelReasoningEffort, ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelCatalogModel } from '@deepseek-ai/dsh-client-connection/client'
import {
  IconCheckOutline16,
  IconChevronDownOutline14,
  IconChevronRightOutline14,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { ModelSelectInjected } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { SessionFace } from '@deepseek-ai/dsh-client-runtime/client'
import { hasFastSpeedCapability, type CpaClient } from './cpa-client.ts'
import { accountAvailability } from './cpa-account-display.ts'
import type { ModelDirectoryState } from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type { CpaSpeed } from './protocol.ts'

type Pane = 'root' | 'model' | 'effort' | 'speed'

interface EffortChoice {
  key: string
  effort: string | undefined
  label: string
  description?: string
}

interface CpaModelSelectInjected extends ModelSelectInjected {
  cpa: CpaClient
  sessionId: string
  session?: SessionFace
}

type Props = CpaModelSelectInjected & { locked: boolean } & PropsLocale<'dsh-cpa'>

interface DisplayGroup {
  id: string
  providerId: string
  name: string
  models: ModelCatalogModel[]
}

export function CpaModelSelect({ locked, available, directory, load, select, cpa, sessionId, session, t }: Props) {
  const state = useSyncExternalStore(
    listener => directory.subscribe(listener),
    () => directory.getSnapshot(),
  )
  const cpaState = useSyncExternalStore(
    listener => cpa.store.subscribe(listener),
    () => cpa.store.getSnapshot(),
  )
  const [open, setOpen] = useState(false)
  const [pane, setPane] = useState<Pane>('root')
  const rootRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const directoryActionRef = useRef<'load' | 'select'>('load')
  const id = useRef(`dsh-cpa-model-${Math.random().toString(36).slice(2)}`).current
  const hasImages = useSyncExternalStore(
    listener => session?.subscribe(listener) ?? (() => {}),
    () => session !== undefined && snapshotHasImages(session.getSnapshot()),
    () => false,
  )

  const choices = useMemo(() => state.groups.flatMap((group: ModelProviderGroup) => group.models.map((model: ModelCatalogModel) => ({
    group,
    model,
    selection: selectionForModel(group.id, model, null),
  }))), [state.groups])
  const displayGroups = useMemo(
    () => displayModelGroups(state.groups, cpaState.providerId, t),
    [state.groups, cpaState.providerId, t],
  )
  const currentChoice = state.current === null
    ? undefined
    : choices.find(choice => choice.selection.provider === state.current?.provider && choice.selection.model === state.current.model)
  const reasoning = currentChoice === undefined
    ? undefined
    : reasoningForModel(currentChoice.model, currentChoice.selection.provider === cpaState.providerId ? cpaState.providerId : undefined)
  const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort
  const effortLabel = reasoning === undefined
    ? undefined
    : effectiveEffort === undefined
      ? t('effort.providerDefault')
      : reasoning.efforts.find((level: ModelReasoningEffort) => level.id === effectiveEffort)?.name ?? effectiveEffort
  const effortChoices = useMemo<readonly EffortChoice[]>(() => reasoning === undefined
    ? []
    : [
      ...(reasoning.defaultEffort === undefined
        ? [{ key: 'provider-default', effort: undefined, label: t('effort.providerDefault') }]
        : []),
      ...reasoning.efforts.map((effort: ModelReasoningEffort) => ({
        key: `effort:${effort.id}`,
        effort: effort.id,
        label: effort.name,
        ...effort.description === undefined ? {} : { description: effort.description },
      })),
    ], [reasoning, t])
  const isCpa = state.current?.provider === cpaState.providerId
  const speedAvailable = isCpa
    && currentChoice !== undefined
    && hasFastSpeedCapability(currentChoice.model.id, cpaState.modelCapabilities)
  const selectedSpeed: CpaSpeed = isCpa && state.current !== null
    ? cpa.speed(sessionId, state.current.model)
    : 'standard'
  const speedLabel = speedAvailable
    ? selectedSpeed === 'fast' ? t('speed.fast') : t('speed.standard')
    : undefined
  const busy = state.status === 'selecting'

  useEffect(() => {
    if (!available) return
    directoryActionRef.current = 'load'
    load()
    void cpa.loadModelCapabilities().catch(() => { /* capability metadata is optional */ })
    void cpa.loadInputCapabilities().catch(() => { /* modality metadata is optional */ })
  }, [available, cpa, load, sessionId])

  useEffect(() => {
    if (!open) return
    const closeOutside = (event: MouseEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', closeOutside)
    return () => { document.removeEventListener('mousedown', closeOutside) }
  }, [open])

  if (!available) return null

  const refresh = (): void => {
    directoryActionRef.current = 'load'
    load()
    void cpa.refresh().then(() => {
      void cpa.loadModelCapabilities().catch(() => { /* capability metadata is optional */ })
      void cpa.loadInputCapabilities().catch(() => { /* modality metadata is optional */ })
    }).catch(() => { /* the menu renders the last error */ })
  }

  const show = (): void => {
    setPane('root')
    setOpen(true)
    refresh()
  }

  const close = (): void => {
    setOpen(false)
    setPane('root')
    queueMicrotask(() => { triggerRef.current?.focus() })
  }

  const choose = (selection: ModelSelection): void => {
    void (async () => {
      const targetModel = state.groups
        .find(group => group.id === selection.provider)
        ?.models.find((model: ModelCatalogModel) => model.id === selection.model)
      const nextSelection = targetModel === undefined
        ? selection
        : selectionForModel(selection.provider, targetModel, state.current, cpaState.providerId, effectiveEffort)
      const previousSpeed = state.current?.provider === cpaState.providerId && state.current !== null
        ? cpa.speed(sessionId, state.current.model)
        : 'standard'
      directoryActionRef.current = 'select'
      const accepted = await select(nextSelection)
      if (!accepted) return
      if (nextSelection.provider === cpaState.providerId) {
        await ensureDefaultAccountForModel(cpa, sessionId, nextSelection.model)
        if (hasFastSpeedCapability(nextSelection.model, cpa.store.getSnapshot().modelCapabilities)) {
          await cpa.selectSpeed(sessionId, nextSelection.model, previousSpeed === 'fast' ? 'fast' : 'standard')
        }
      }
      close()
    })().catch(() => { /* the directory exposes selection errors */ })
  }

  const chooseEffort = (effort: string | undefined): void => {
    if (state.current === null) return
    void select({
      provider: state.current.provider,
      model: state.current.model,
      ...effort === undefined ? {} : { reasoningEffort: effort },
    }).then(accepted => { if (accepted) close() })
  }

  const chooseSpeed = (speed: CpaSpeed): void => {
    if (!speedAvailable || state.current === null) return
    void cpa.selectSpeed(sessionId, state.current.model, speed).then(() => { close() }).catch(() => { /* status stays visible in Settings */ })
  }

  const modelLabel = currentChoice?.model.name ?? t('trigger.fallback')
  const triggerLabel = [modelLabel, effortLabel, speedLabel].filter((value): value is string => value !== undefined).join(' · ')
  const triggerAria = currentChoice === undefined
    ? t('trigger.selectAria')
    : effortLabel === undefined
      ? t('trigger.aria', { model: modelLabel })
      : t('trigger.ariaEffort', { model: modelLabel, effort: effortLabel })

  return (
    <div ref={rootRef} className="dsh-cpa-model-root" onKeyDown={onKeyDown(setPane, pane, close)}>
      <button
        ref={triggerRef}
        type="button"
        className="dsh-cpa-model-trigger"
        aria-label={triggerAria}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? `${id}-menu` : undefined}
        title={triggerLabel}
        disabled={locked}
        onClick={() => { open ? close() : show() }}
      >
        <span className="dsh-cpa-model-trigger-label">{modelLabel}</span>
        {effortLabel !== undefined ? <span className="dsh-cpa-model-trigger-effort">{effortLabel}</span> : null}
        {speedLabel !== undefined ? <span className="dsh-cpa-model-trigger-speed">{speedLabel}</span> : null}
        <IconChevronDownOutline14 className={`dsh-cpa-chevron${open ? ' is-open' : ''}`} />
      </button>

      {open ? (
        <div id={`${id}-menu`} className="dsh-cpa-model-menu" role="menu" aria-label={t('menu.aria')} aria-busy={busy}>
          {pane === 'root' ? (
            <>
              <MenuRow label={t('menu.model')} value={modelLabel} onClick={() => { setPane('model') }} />
              {reasoning !== undefined ? (
                <MenuRow label={t('menu.effort')} value={effortLabel ?? t('effort.providerDefault')} onClick={() => { setPane('effort') }} />
              ) : null}
              {speedAvailable ? (
                <MenuRow label={t('menu.speed')} value={speedLabel ?? t('speed.standard')} onClick={() => { setPane('speed') }} />
              ) : null}
            </>
          ) : null}

          {pane === 'model' ? (
            <div className="dsh-cpa-model-groups scrollable">
              {state.status === 'loading' ? <div className="dsh-cpa-status">{t('status.loading')}</div> : null}
              {state.error !== null && directoryActionRef.current === 'load' ? (
                <div className="dsh-cpa-error"><span>{t('error.action', { message: state.error })}</span><button type="button" onClick={refresh}>{t('retry')}</button></div>
              ) : null}
              {displayGroups.map(group => (
                <section key={`${group.providerId}/${group.id}`} className="dsh-cpa-model-group" role="group" aria-label={group.name}>
                  <div className="dsh-cpa-group-title">{group.name}</div>
                  {group.models.map((model: ModelCatalogModel) => {
                    const selected = state.current?.provider === group.providerId && state.current.model === model.id
                    const input = cpa.inputCapability(group.providerId, model.id)
                    const imageUnsupported = hasImages
                      && cpaState.inputCapabilitiesStatus === 'ready'
                      && input !== undefined
                      && !input.includes('image')
                    return (
                      <button
                        key={`${group.id}/${model.id}`}
                        type="button"
                        className={`dsh-cpa-option${selected ? ' is-selected' : ''}`}
                        disabled={busy || imageUnsupported}
                        title={imageUnsupported ? t('model.imageUnsupported') : undefined}
                        onClick={() => { choose({ provider: group.providerId, model: model.id }) }}
                      >
                        <span className="dsh-cpa-option-copy">
                          <span className="dsh-cpa-model-name">{model.name}</span>
                          {model.description !== undefined ? <span className="dsh-cpa-description">{model.description}</span> : null}
                        </span>
                        <span className="dsh-cpa-check" aria-hidden="true">{selected ? <IconCheckOutline16 /> : null}</span>
                      </button>
                    )
                  })}
                </section>
              ))}
              {state.status === 'ready' && choices.length === 0 ? <div className="dsh-cpa-status">{t('status.empty')}</div> : null}
            </div>
          ) : null}

          {pane === 'effort' ? (
            <div className="dsh-cpa-model-list">
              {effortChoices.map(choice => (
                <button key={choice.key} type="button" className="dsh-cpa-option" disabled={busy} onClick={() => { chooseEffort(choice.effort) }}>
                  <span><span>{choice.label}</span>{choice.description ? <small>{choice.description}</small> : null}</span>
                  {effectiveEffort === choice.effort ? <span aria-hidden="true">✓</span> : null}
                </button>
              ))}
            </div>
          ) : null}

          {pane === 'speed' && speedAvailable ? (
            <div className="dsh-cpa-model-list">
              <button type="button" className="dsh-cpa-option" disabled={busy} onClick={() => { chooseSpeed('standard') }}>
                <span>{t('speed.standard')}</span>
                {selectedSpeed === 'standard' ? <span aria-hidden="true">✓</span> : null}
              </button>
              <button type="button" className="dsh-cpa-option" disabled={busy} onClick={() => { chooseSpeed('fast') }}>
                <span><span>{t('speed.fast')}</span><small>{t('speed.fastDescription')}</small></span>
                {selectedSpeed === 'fast' ? <span aria-hidden="true">✓</span> : null}
              </button>
            </div>
          ) : null}

        </div>
      ) : null}
    </div>
  )
}

function MenuRow(props: { label: string; value: string; onClick: () => void }) {
  return (
    <button type="button" className="dsh-cpa-menu-row" role="menuitem" onClick={props.onClick}>
      <span className="dsh-cpa-menu-label">{props.label}</span><span className="dsh-cpa-menu-value">{props.value}</span><IconChevronRightOutline14 className="dsh-cpa-menu-chevron" />
    </button>
  )
}

function onKeyDown(setPane: (pane: Pane) => void, pane: Pane, close: () => void) {
  return (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    if (pane !== 'root') setPane('root')
    else close()
  }
}

function snapshotHasImages(snapshot: ReturnType<SessionFace['getSnapshot']>): boolean {
  return snapshot.nodes.some(node => hasImageContent((node as { content?: unknown }).content))
    || snapshot.queue.some(item => hasImageContent(item.content))
}

function hasImageContent(value: unknown): boolean {
  return Array.isArray(value) && value.some(block => (
    typeof block === 'object'
    && block !== null
    && (block as { type?: unknown }).type === 'image'
  ))
}

function displayModelGroups(
  groups: readonly ModelProviderGroup[],
  cpaProviderId: string,
  t: Props['t'],
): DisplayGroup[] {
  return groups.flatMap(group => {
    if (group.id !== cpaProviderId) return [{ ...group, providerId: group.id }]
    const buckets = new Map<ModelFamily, ModelCatalogModel[]>()
    for (const model of group.models) {
      const family = familyOf(model)
      const bucket = buckets.get(family)
      if (bucket === undefined) buckets.set(family, [model])
      else bucket.push(model)
    }
    return CPA_MODEL_FAMILY_ORDER.flatMap(family => {
      const models = buckets.get(family)
      if (models === undefined || models.length === 0) return []
      return [{
        id: `${group.id}:${family}`,
        providerId: group.id,
        name: familyLabel(family, t),
        models,
      }]
    })
  })
}

type ModelFamily = 'gpt' | 'claude' | 'gemini' | 'deepseek' | 'other'

const CPA_MODEL_FAMILY_ORDER: readonly ModelFamily[] = ['gpt', 'claude', 'gemini', 'deepseek', 'other']

function familyOf(model: ModelCatalogModel): ModelFamily {
  const value = `${model.id} ${model.name}`.toLowerCase()
  if (/(gpt|codex|chatgpt|(?:^|[-_])o[134](?:$|[-_]))/.test(value)) return 'gpt'
  if (value.includes('claude')) return 'claude'
  if (value.includes('gemini')) return 'gemini'
  if (value.includes('deepseek')) return 'deepseek'
  return 'other'
}

function familyLabel(family: ModelFamily, t: Props['t']): string {
  switch (family) {
    case 'gpt': return t('model.familyGpt')
    case 'claude': return t('model.familyClaude')
    case 'gemini': return t('model.familyGemini')
    case 'deepseek': return t('model.familyDeepSeek')
    default: return t('model.familyOther')
  }
}

async function ensureDefaultAccountForModel(cpa: CpaClient, sessionId: string, modelId: string): Promise<void> {
  const accounts = await cpa.loadAccounts()
  const selected = cpa.selected(sessionId)
  const current = accounts.find(account => account.authIndex === selected)
  const available = accounts.filter(account => accountAvailability(account) === 'available')
  if (available.length === 0) return

  // Keep the current account first so changing models does not unexpectedly
  // rotate a healthy selection when that account supports the new model.
  const ordered = current !== undefined && accountAvailability(current) === 'available'
    ? [current, ...available.filter(account => account.authIndex !== current.authIndex)]
    : available
  const matches = await Promise.all(ordered.map(async account => {
    try {
      const models = await cpa.loadAccountModels(account)
      return modelListContains(models, modelId) ? account : undefined
    } catch {
      // Older CPA versions may not expose per-account model discovery.
      return undefined
    }
  }))
  const matching = matches.find(account => account !== undefined)
  const currentAvailable = current !== undefined && accountAvailability(current) === 'available' ? current : undefined
  const fallback = matching ?? currentAvailable ?? available[0]
  if (fallback !== undefined && fallback.authIndex !== selected) {
    await cpa.selectAccount(sessionId, fallback.authIndex, { persistDefault: false })
  }
}

function modelListContains(models: readonly string[], modelId: string): boolean {
  const wanted = normalizeModelId(modelId)
  return wanted !== '' && models.some(model => normalizeModelId(model) === wanted)
}

function normalizeModelId(value: string): string {
  return value.trim().toLowerCase()
}

function selectionForModel(
  provider: string,
  model: ModelCatalogModel,
  current: ModelSelection | null,
  cpaProviderId?: string,
  currentEffectiveEffort?: string,
): ModelSelection {
  const currentEffort = current?.provider === provider
    ? current.reasoningEffort ?? currentEffectiveEffort
    : undefined
  const preservesCurrent = currentEffort !== undefined
    && supportsReasoningEffort(provider, model, currentEffort, cpaProviderId)
  const reasoningEffort = preservesCurrent ? currentEffort : model.reasoning?.defaultEffort
  return {
    provider,
    model: model.id,
    ...reasoningEffort === undefined ? {} : { reasoningEffort },
  }
}

function reasoningForModel(
  model: ModelCatalogModel,
  cpaProviderId?: string,
): ModelCatalogModel['reasoning'] {
  const base = model.reasoning
  if (cpaProviderId === undefined || !isKnownCpaReasoningModel(model.id)) return base
  const known = knownCpaReasoningEfforts(model.id)
  const efforts = base?.efforts === undefined ? [] : [...base.efforts]
  for (const id of known) {
    if (!efforts.some(effort => effort.id === id)) efforts.push({ id, name: id === 'max' ? 'Max' : id[0].toUpperCase() + id.slice(1) })
  }
  return { ...base, efforts }
}

function supportsReasoningEffort(
  provider: string,
  model: ModelCatalogModel,
  effort: string,
  cpaProviderId?: string,
): boolean {
  if (model.reasoning?.efforts.some(level => level.id === effort)) return true
  return provider === cpaProviderId && knownCpaReasoningEfforts(model.id).includes(effort)
}

function knownCpaReasoningEfforts(modelId: string): readonly string[] {
  if (isGpt56Model(modelId)) return ['low', 'medium', 'high', 'max']
  if (/^gemini-3\.(?:6|7)-flash-high$/i.test(modelId.trim())) return ['low', 'medium', 'high']
  return []
}

function isKnownCpaReasoningModel(modelId: string): boolean {
  return knownCpaReasoningEfforts(modelId).length > 0
}

function isGpt56Model(modelId: string): boolean {
  return /^gpt-5\.6(?:-|$)/i.test(modelId.trim())
}
