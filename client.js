window.__ModuleLoader__.load({
  id: '@router-for-me/dsh-cliproxyapi-provider',
  factory: () => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const PI_NS = 'llm-pi-ai'
    const DISCOVERY_NS = 'llm-cliproxyapi'
    const CREDENTIAL_REF = 'DSH_CLIPROXY_API_KEY'
    const PROVIDER = 'CLIProxyAPI'
    const DEFAULT_BASE_URL = 'http://127.0.0.1:8317/v1'
    const PROFILE_SYNC_HEADER = 'x-dsh-provider-cpa-sync'
    const PROFILE_SYNC_TIMEOUT_MS = 30000
    const PLACEHOLDER_AUTHORIZATION = 'Bearer dsh-cliproxyapi-no-key'
    const ROW_ATTRIBUTE = 'data-dsh-provider-cpa-row'
    const HIDDEN_ATTRIBUTE = 'data-dsh-provider-cpa-hidden'
    const OPENED_ATTRIBUTE = 'data-dsh-provider-cpa-opened'
    const BOOTSTRAP_ATTRIBUTE = 'data-dsh-provider-cpa-bootstrap'
    const STYLE_ID = 'dsh-provider-cpa-model-settings'
    const inject = ['connection', 'remote']

    const copy = {
      en: {
        edit: 'Edit',
        editLabel: 'Edit CLIProxyAPI',
        baseURL: 'Base URL',
        apiKey: 'API key',
        apiKeyPlaceholder: 'Optional for a keyless CLIProxyAPI server',
        cancel: 'Cancel',
        save: 'Save & Enable',
        saving: 'Saving…',
        saved: 'Saved. The CLIProxyAPI model catalog is synchronized.',
        syncTimeout: 'Timed out waiting for CLIProxyAPI to write the complete model catalog.',
        baseRequired: 'Base URL is required.',
        baseInvalid: 'Base URL must be a valid HTTP or HTTPS URL.',
        noModels: 'CLIProxyAPI returned no usable models.',
      },
      zh: {
        edit: '编辑',
        editLabel: '编辑 CLIProxyAPI',
        baseURL: 'Base URL',
        apiKey: 'API Key',
        apiKeyPlaceholder: '无鉴权的 CLIProxyAPI 可留空',
        cancel: '取消',
        save: '保存并启用',
        saving: '保存中…',
        saved: '已保存，CLIProxyAPI 模型目录已同步。',
        syncTimeout: '等待 CLIProxyAPI 写入完整模型目录超时。',
        baseRequired: '请填写 Base URL。',
        baseInvalid: 'Base URL 必须是有效的 HTTP 或 HTTPS 地址。',
        noModels: 'CLIProxyAPI 未返回可用模型。',
      },
    }

    const stylesheet = `
[${ROW_ATTRIBUTE}] > div > details > summary {
  display: none !important;
}

[${ROW_ATTRIBUTE}] > div > details {
  margin: 0 !important;
  border: 0 !important;
  background: transparent !important;
}

[${ROW_ATTRIBUTE}] > div > details > div {
  margin: 0 !important;
  padding: 0 !important;
}

[${ROW_ATTRIBUTE}] > div > details section[aria-label] {
  display: none !important;
}

[${HIDDEN_ATTRIBUTE}] {
  display: none !important;
}

[${BOOTSTRAP_ATTRIBUTE}] {
  list-style: none;
  border: 1px solid var(--dsw-alias-border-primary);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  padding: 14px 16px;
}

[${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-row-head,
[${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

[${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-name {
  font-size: 14px;
  font-weight: 600;
}

[${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-form {
  display: grid;
  grid-template-columns: minmax(120px, 160px) minmax(0, 1fr);
  gap: 12px 16px;
  align-items: center;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--dsw-alias-border-primary);
}

[${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-form[hidden] {
  display: none !important;
}

[${BOOTSTRAP_ATTRIBUTE}] label {
  font-size: 14px;
  font-weight: 500;
}

[${BOOTSTRAP_ATTRIBUTE}] input {
  box-sizing: border-box;
  width: 100%;
  height: 38px;
  border: 1px solid var(--dsw-alias-border-primary);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  padding: 8px 12px;
  font: inherit;
}

[${BOOTSTRAP_ATTRIBUTE}] button {
  cursor: pointer;
  border: 1px solid var(--dsw-alias-border-primary);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  padding: 8px 14px;
  font: inherit;
}

[${BOOTSTRAP_ATTRIBUTE}] button.dsh-cpa-primary {
  border-color: transparent;
  background: var(--dsw-alias-brand-primary, #4d6bfe);
  color: #fff;
}

[${BOOTSTRAP_ATTRIBUTE}] button:disabled {
  cursor: default;
  opacity: .55;
}

[${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-actions,
[${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-feedback {
  grid-column: 2;
}

[${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-feedback {
  min-height: 1.4em;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  line-height: 1.4;
}

[${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-feedback[data-error='true'] {
  color: #d84a4a;
}

@media (max-width: 640px) {
  [${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-form {
    grid-template-columns: 1fr;
  }

  [${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-actions,
  [${BOOTSTRAP_ATTRIBUTE}] .dsh-cpa-feedback {
    grid-column: 1;
  }
}
`

    function unwrap(response) {
      if (!response || !response.result || !response.result.ok) {
        const message = response && response.result && response.result.error
          ? response.result.error.message
          : 'Harness request failed'
        throw new Error(message)
      }
      return response.result.value
    }

    function validBaseURL(value, messages) {
      if (!value) throw new Error(messages.baseRequired)
      let parsed
      try {
        parsed = new URL(value)
      } catch {
        throw new Error(messages.baseInvalid)
      }
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error(messages.baseInvalid)
      }
    }

    function modelsHeading() {
      return [...document.querySelectorAll('dialog h2, [role="dialog"] h2')].find((heading) => {
        const text = heading.textContent.trim()
        return text === 'Models' || text === '模型'
      })
    }

    function configuredRows() {
      return [...document.querySelectorAll('li')].filter((row) => {
        if (row.hasAttribute(BOOTSTRAP_ATTRIBUTE)) return false
        return [...row.querySelectorAll('button[aria-label]')].some((button) => {
          return (button.getAttribute('aria-label') || '').includes(PROVIDER)
        })
      })
    }

    function directTextInputFields(body) {
      return [...body.children].filter((child) => {
        return [...child.children].some((element) => element.matches('input[type="text"]'))
      })
    }

    function markHidden(element) {
      if (element && !element.hasAttribute(HIDDEN_ATTRIBUTE)) element.setAttribute(HIDDEN_ATTRIBUTE, '')
    }

    function decorateConfiguredRows() {
      const rows = configuredRows()
      for (const row of rows) {
        if (!row.hasAttribute(ROW_ATTRIBUTE)) row.setAttribute(ROW_ATTRIBUTE, '')
        // Installed providers keep Edit as their sole row action. The Models
        // page orders Edit first and conditional destructive actions after it.
        const header = row.firstElementChild
        const actionButtons = header ? [...header.querySelectorAll('button')] : []
        for (const action of actionButtons.slice(1)) markHidden(action)

        const details = row.querySelector(':scope > div > details')
        if (!details) continue
        if (!details.open) {
          details.open = true
          details.setAttribute(OPENED_ATTRIBUTE, '')
        }
        const body = [...details.children].find((child) => child.tagName !== 'SUMMARY')
        if (!body) continue

        const textFields = directTextInputFields(body)
        for (const field of textFields.slice(0, -1)) markHidden(field)
        for (const select of body.querySelectorAll(':scope > div > select')) markHidden(select.parentElement)
        for (const catalog of body.querySelectorAll(':scope > section[aria-label]')) markHidden(catalog)
      }
      return rows
    }

    function languageFor(heading) {
      return heading.textContent.trim() === '模型' ? 'zh' : 'en'
    }

    function element(tag, options = {}) {
      const node = document.createElement(tag)
      if (options.className) node.className = options.className
      if (options.text !== undefined) node.textContent = options.text
      if (options.type) node.type = options.type
      return node
    }

    function syncValueOf(headers) {
      const key = Object.keys(headers || {}).find((candidate) => {
        return candidate.toLowerCase() === PROFILE_SYNC_HEADER
      })
      return key === undefined ? undefined : String(headers[key])
    }

    function createSyncToken() {
      return globalThis.crypto?.randomUUID?.()
        || String(Date.now()) + '-' + Math.random().toString(36).slice(2)
    }

    function bootstrapProfileOf(baseURL, models, hasCredential, syncToken) {
      return {
        displayName: PROVIDER,
        api: 'openai-responses',
        baseURL,
        models: models.map((model) => ({
          id: model.id,
          name: model.name || model.id,
          contextWindow: model.contextWindow || 262144,
          maxTokens: model.maxTokens || 32768,
        })),
        defaultContextWindow: 262144,
        defaultMaxTokens: 32768,
        defaultInput: ['text'],
        headers: {
          [PROFILE_SYNC_HEADER]: 'rich:' + syncToken,
          ...(hasCredential ? {} : { authorization: PLACEHOLDER_AUTHORIZATION }),
        },
        ...(hasCredential ? { apiKeyEnv: CREDENTIAL_REF } : {}),
      }
    }

    async function waitForProfileSynchronization(api, remote, baseURL, initial, messages) {
      let done = false
      let reading = false
      let rerun = false
      let timeout
      let disposeEvent = () => {}
      let resolveReady
      let rejectReady
      const ready = new Promise((resolve, reject) => {
        resolveReady = resolve
        rejectReady = reject
      })

      const finish = (error, profile) => {
        if (done) return
        done = true
        if (timeout !== undefined) clearTimeout(timeout)
        disposeEvent()
        if (error) rejectReady(error)
        else resolveReady(profile)
      }
      const inspect = (namespace) => {
        const profile = namespace?.value?.providers?.[PROVIDER]
        if (!profile || profile.baseURL !== baseURL) return
        const pending = syncValueOf(profile.headers)
        if (pending !== undefined) return
        finish(undefined, profile)
      }
      const refresh = async () => {
        if (done) return
        if (reading) {
          rerun = true
          return
        }
        reading = true
        try {
          do {
            rerun = false
            const described = unwrap(await api.settings.describe({}))
            inspect(described.namespaces.find((entry) => entry.ns === PI_NS))
          } while (rerun && !done)
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        } finally {
          reading = false
        }
      }

      disposeEvent = remote.$on('settings/document-updated', (ns) => {
        if (ns === PI_NS) void refresh()
      })
      timeout = setTimeout(() => finish(new Error(messages.syncTimeout)), PROFILE_SYNC_TIMEOUT_MS)
      inspect(initial)
      if (!done) void refresh()
      return ready
    }

    async function installInitialProfile(api, remote, baseURL, apiKey, messages) {
      const described = unwrap(await api.settings.describe({}))
      const namespace = described.namespaces.find((entry) => entry.ns === PI_NS)
      if (!namespace) throw new Error('The llm-pi-ai settings namespace is unavailable')

      const credentialResult = unwrap(await api.credentials.describe({ refs: [CREDENTIAL_REF] }))
      const credential = credentialResult.credentials[CREDENTIAL_REF] || { configured: false }
      const discovered = unwrap(await api.llm.discoverModels({
        settingsNs: DISCOVERY_NS,
        provider: PROVIDER,
        baseURL,
        api: 'openai-responses',
        ...(apiKey ? { apiKey } : {}),
      })).models
      if (!discovered.length) throw new Error(messages.noModels)

      if (apiKey) unwrap(await api.credentials.set({ ref: CREDENTIAL_REF, value: apiKey }))
      const hasCredential = Boolean(apiKey || credential.configured)
      const syncToken = createSyncToken()
      const updated = unwrap(await api.settings.mutate({
        ns: PI_NS,
        ops: [{
          op: 'set',
          path: ['providers', PROVIDER],
          value: bootstrapProfileOf(baseURL, discovered, hasCredential, syncToken),
        }],
        ...(Number.isInteger(namespace.revision) ? { expectedRevision: namespace.revision } : {}),
      }))
      return waitForProfileSynchronization(api, remote, baseURL, updated, messages)
    }

    function buildBootstrapRow(api, remote, heading) {
      const messages = copy[languageFor(heading)]
      const row = element('li')
      row.setAttribute(BOOTSTRAP_ATTRIBUTE, '')

      const head = element('div', { className: 'dsh-cpa-row-head' })
      head.append(element('span', { className: 'dsh-cpa-name', text: PROVIDER }))
      const edit = element('button', { type: 'button', text: messages.edit })
      edit.setAttribute('aria-label', messages.editLabel)
      edit.setAttribute('aria-expanded', 'false')
      head.append(edit)

      const form = element('form', { className: 'dsh-cpa-form' })
      form.hidden = true
      form.noValidate = true

      const baseId = 'dsh-cpa-base-url'
      const keyId = 'dsh-cpa-api-key'
      const baseLabel = element('label', { text: messages.baseURL })
      baseLabel.htmlFor = baseId
      const baseInput = element('input')
      baseInput.id = baseId
      baseInput.type = 'url'
      baseInput.value = DEFAULT_BASE_URL
      baseInput.autocomplete = 'url'

      const keyLabel = element('label', { text: messages.apiKey })
      keyLabel.htmlFor = keyId
      const keyInput = element('input')
      keyInput.id = keyId
      keyInput.type = 'password'
      keyInput.autocomplete = 'off'
      keyInput.placeholder = messages.apiKeyPlaceholder

      const feedback = element('div', { className: 'dsh-cpa-feedback' })
      feedback.setAttribute('role', 'status')
      feedback.setAttribute('aria-live', 'polite')

      const actions = element('div', { className: 'dsh-cpa-actions' })
      const cancel = element('button', { type: 'button', text: messages.cancel })
      const save = element('button', { className: 'dsh-cpa-primary', type: 'submit', text: messages.save })
      actions.append(cancel, save)
      form.append(baseLabel, baseInput, keyLabel, keyInput, feedback, actions)
      row.append(head, form)

      const setOpen = (open) => {
        form.hidden = !open
        edit.setAttribute('aria-expanded', String(open))
        if (open) baseInput.focus()
      }
      edit.addEventListener('click', () => setOpen(form.hidden))
      cancel.addEventListener('click', () => setOpen(false))
      form.addEventListener('submit', async (event) => {
        event.preventDefault()
        const baseURL = baseInput.value.trim().replace(/\/+$/, '')
        const apiKey = keyInput.value.trim()
        save.disabled = true
        cancel.disabled = true
        baseInput.disabled = true
        keyInput.disabled = true
        form.setAttribute('aria-busy', 'true')
        feedback.dataset.error = 'false'
        feedback.setAttribute('role', 'status')
        feedback.textContent = ''
        save.textContent = messages.saving
        try {
          validBaseURL(baseURL, messages)
          await installInitialProfile(api, remote, baseURL, apiKey, messages)
          keyInput.value = ''
          feedback.textContent = messages.saved
        } catch (error) {
          feedback.dataset.error = 'true'
          feedback.setAttribute('role', 'alert')
          feedback.textContent = error instanceof Error ? error.message : String(error)
        } finally {
          save.disabled = false
          cancel.disabled = false
          baseInput.disabled = false
          keyInput.disabled = false
          form.removeAttribute('aria-busy')
          save.textContent = messages.save
        }
      })
      return row
    }

    function ensureBootstrapRow(api, remote, heading, hasConfiguredRow) {
      const existing = document.querySelector(`[${BOOTSTRAP_ATTRIBUTE}]`)
      if (hasConfiguredRow) {
        existing?.remove()
        return
      }
      if (existing) return
      const section = heading.parentElement
      const list = section && section.querySelector('ul')
      if (list) list.append(buildBootstrapRow(api, remote, heading))
    }

    function cleanupDOM() {
      document.querySelector(`[${BOOTSTRAP_ATTRIBUTE}]`)?.remove()
      for (const hidden of document.querySelectorAll(`[${HIDDEN_ATTRIBUTE}]`)) {
        hidden.removeAttribute(HIDDEN_ATTRIBUTE)
      }
      for (const details of document.querySelectorAll(`[${OPENED_ATTRIBUTE}]`)) {
        details.open = false
        details.removeAttribute(OPENED_ATTRIBUTE)
      }
      for (const row of document.querySelectorAll(`[${ROW_ATTRIBUTE}]`)) {
        row.removeAttribute(ROW_ATTRIBUTE)
      }
      document.getElementById(STYLE_ID)?.remove()
    }

    function apply(ctx) {
      const api = ctx.get('connection').api
      const remote = ctx.get('remote')
      ctx.effect(() => {
        const style = document.createElement('style')
        style.id = STYLE_ID
        style.textContent = stylesheet
        document.head.append(style)

        let scheduledFrame
        const reconcile = () => {
          const heading = modelsHeading()
          if (heading) {
            const rows = decorateConfiguredRows()
            ensureBootstrapRow(api, remote, heading, rows.length > 0)
          }
        }
        const schedule = () => {
          if (scheduledFrame !== undefined) return
          scheduledFrame = requestAnimationFrame(() => {
            scheduledFrame = undefined
            reconcile()
          })
        }
        const observer = new MutationObserver(schedule)
        observer.observe(document.body, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['open', 'aria-label'],
        })
        const disposers = [
          remote.$on('settings/document-updated', schedule),
          remote.$on('credentials/updated', schedule),
          remote.$on('llm/adapters-updated', schedule),
          ctx.on('connection/reset', schedule),
        ]
        schedule()
        return () => {
          observer.disconnect()
          if (scheduledFrame !== undefined) cancelAnimationFrame(scheduledFrame)
          for (const dispose of disposers) dispose()
          cleanupDOM()
        }
      })
    }

    exports.apply = apply
    exports.inject = inject
    exports.installInitialProfile = installInitialProfile
    return module.exports
  },
})
