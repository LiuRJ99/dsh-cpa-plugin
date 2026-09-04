/** Browser half of the external CPA integration. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { SessionFace } from '@deepseek-ai/dsh-api-session-controller/client'
import type { ConnectionHandle, SessionId } from '@deepseek-ai/dsh-client-connection/client'
import type { ModelSelection } from '@deepseek-ai/dsh-api-remotes/client'
import type { SettingsScope } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-connection/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-chat/client'
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client'
import type {} from '@deepseek-ai/dsh-client-ui-model-selection/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import { CpaAutoRefresh } from './cpa-auto-refresh.ts'
import type { CpaLocaleKey } from './locales.ts'
import { CpaAccountIndicator } from './cpa-account-indicator.tsx'
import { CpaModelSelect } from './cpa-model-select.tsx'
import { CpaClient } from './cpa-client.ts'
import { CpaModelSettingsController } from './cpa-model-settings.tsx'
import { CpaSettingsCard, CpaSettingsCardController } from './cpa-settings-card.tsx'
import { en, zh } from './locales.ts'
import { installStyles } from './styles.ts'
import { registerSettingsNavIcon } from './settings-nav-icon.ts'
import { MODEL_CAPABILITY_SERVICE, type ModelCapabilityProvider } from '../model-capabilities.ts'

const NS = 'dsh-cpa'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'dsh-cpa': CpaLocaleKey
  }
}

export const inject = [
  'connection', 'locale', 'modelDirectories', 'remote', 'remote.session', 'sessions', 'settingsScope', 'slots',
]

/**
 * Incremental model-selection extension used by the upstream client bundle.
 * It only occupies the existing model seat and leaves the upstream Settings
 * tab and model-directory owner in place.
 */
export function applyAdditive(ctx: ClientContext): CpaClient {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-cpa: dictionaries')
  ctx.effect(installStyles, 'dsh-cpa: styles')
  ctx.effect(() => registerSettingsNavIcon(() => 'CLIProxyAPI'), 'dsh-cpa: settings navigation icon')

  const connection = ctx.get('connection') as unknown as ConnectionHandle
  const cpa = new CpaClient(connection.rpc)
  // Drive the Host's cached snapshot into the browser at the configured
  // interval. The Host refreshes on its own timer, but its results never
  // reach the Web client on their own; this effect disposes with the context.
  let autoRefresh: CpaAutoRefresh | undefined
  ctx.effect(() => {
    autoRefresh = new CpaAutoRefresh(cpa)
    return () => autoRefresh?.dispose()
  }, 'dsh-cpa: auto refresh driver')
  const capabilityProvider: ModelCapabilityProvider = {
    listModelCapabilities: () => cpa.listModelCapabilities(),
  }
  ctx.provide(MODEL_CAPABILITY_SERVICE, capabilityProvider)
  // Load the add-on state in the composed upstream bundle as well. The
  // legacy standalone entry did this already, but the incremental entry is
  // now the one used by the original client.js composition.
  void cpa.loadConfig().then(() => {
    void cpa.refresh().catch(() => { /* settings surface reports errors */ })
    void cpa.loadModelCapabilities().catch(() => { /* capability metadata is optional */ })
    void cpa.loadInputCapabilities().catch(() => { /* modality metadata is optional */ })
  }).catch(() => { /* settings surface reports errors */ })

  // The only composer change is a lower-priority occupant of the existing
  // model seat. The original surface remains the visual baseline; the add-on
  // only contributes provider-specific model grouping and controls.
  ctx.inject(['slots', 'modelDirectories', 'remote.session', 'sessions'], (scope) => {
    const models = scope.modelDirectories
    const sessions = scope.sessions
    scope.slots.inject('conversation.input.model', () => scope.slots.register({
      name: 'conversation.input.model',
      priority: -1,
      locale: NS,
      inject: (sessionId: SessionId) => {
        const directory = models.directoryFor(sessionId)
        const session = sessions.binding(sessionId)?.session
        const available = sessions.subagentAddress(sessionId) === undefined
        return {
          available,
          directory: directory.store,
          load: () => { if (available) directory.load().catch(() => {}) },
          select: (selection: ModelSelection) => available
            ? directory.select(selection).then(() => true, () => false)
            : Promise.resolve(false),
          cpa,
          sessionId,
          session: session as SessionFace | undefined,
        }
      },
    }, CpaModelSelect))

    scope.slots.inject('conversation.input.left', () => scope.slots.register({
      name: 'conversation.input.left',
      id: 'cpa-account',
      order: 20,
      locale: NS,
      inject: (sessionId: SessionId) => ({ cpa, sessionId, directory: models.directoryFor(sessionId).store }),
    }, CpaAccountIndicator))
  })

  return cpa
}

/** Legacy standalone client entry retained for the pre-upstream layout. */
export function apply(ctx: ClientContext): void {
  const cpa = applyAdditive(ctx)
  void cpa.loadConfig().catch(() => { /* settings card exposes the error */ })

  // Settings → Plugins → Plugin configuration. No new main-panel button or
  // standalone quota route is introduced. The card is keyed on the settings
  // namespace the Host add-on serves (`dsh-cpa-plugin`), matching the
  // configurable-plugins tab's keyed `settings.plugin.item` dispatch.
  ctx.inject(['slots', 'settingsScope'], (scope) => {
    const modelSettings = scope.settingsScope.bind({ namespace: 'llm-pi-ai' })
    const model = new CpaModelSettingsController(ctx, modelSettings, cpa)
    const card = new CpaSettingsCardController(ctx, cpa, model)

    // The native Models page owns the route protocol. When it changes a CPA
    // profile from completions to Responses, reload the settings scope so the
    // migration can remove completion-only fields immediately.
    ctx.effect(() => {
      const stop = ctx.remote.$on('settings/document-updated', (namespace) => {
        if (namespace === 'llm-pi-ai') model.reload()
      })
      return stop
    }, 'dsh-cpa: model settings refresh')

    scope.slots.inject('settings.plugin.item', () => scope.slots.register({
      name: 'settings.plugin.item',
      key: 'dsh-cpa-plugin',
      locale: NS,
      inject: () => card.inject(),
    }, CpaSettingsCard))
  })
}
