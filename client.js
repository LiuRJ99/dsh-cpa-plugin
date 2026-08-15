window.__ModuleLoader__.load({
  id: '@router-for-me/dsh-cliproxyapi-provider',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })

    const React = require('react')
    const {
      useEffect,
      useMemo,
      useState,
      useSyncExternalStore,
    } = React

    const PI_NS = 'llm-pi-ai'
    const DISCOVERY_NS = 'llm-cliproxyapi'
    const CREDENTIAL_REF = 'DSH_CLIPROXY_API_KEY'
    const PROVIDER = 'CLIProxyAPI'
    const DEFAULT_BASE_URL = 'http://127.0.0.1:8317/v1'
    const PROFILE_SYNC_HEADER = 'x-dsh-provider-cpa-sync'
    const PROFILE_SYNC_TIMEOUT_MS = 30000
    const PLACEHOLDER_AUTHORIZATION = 'Bearer dsh-cliproxyapi-no-key'
    const SETTINGS_SLOT = 'settings.plugins.tab'
    const SETTINGS_TAB_ID = 'cliproxyapi'
    const SETTINGS_LOCALE_NS = 'settings.cliProxyApi'
    const inject = ['connection', 'remote', 'slots', 'locale', 'settingsScope']

    const copy = {
      en: {
        tab: 'CLIProxyAPI',
        title: 'CLIProxyAPI',
        intro: 'Connect a CLIProxyAPI server and synchronize its model catalog.',
        loading: 'Loading CLIProxyAPI settings…',
        unavailable: 'CLIProxyAPI settings are unavailable in this Web profile.',
        readOnly: 'Settings are read-only for this connection.',
        baseURL: 'Base URL',
        apiKey: 'API key',
        apiKeyPlaceholder: 'Optional for a keyless CLIProxyAPI server',
        apiKeyConfiguredPlaceholder: 'API key already saved',
        credentialConfiguredLabel: 'Configured',
        save: 'Save & Enable',
        saving: 'Saving…',
        saved: 'Saved. The CLIProxyAPI model catalog is synchronized.',
        syncTimeout: 'Timed out waiting for CLIProxyAPI to write the complete model catalog.',
        baseRequired: 'Base URL is required.',
        baseInvalid: 'Base URL must be a valid HTTP or HTTPS URL.',
        noModels: 'CLIProxyAPI returned no usable models.',
      },
      zh: {
        tab: 'CLIProxyAPI',
        title: 'CLIProxyAPI',
        intro: '连接 CLIProxyAPI 服务并同步其模型目录。',
        loading: '正在读取 CLIProxyAPI 设置…',
        unavailable: '当前 Web 配置中无法访问 CLIProxyAPI 设置。',
        readOnly: '当前连接的设置为只读。',
        baseURL: 'Base URL',
        apiKey: 'API Key',
        apiKeyPlaceholder: '无鉴权的 CLIProxyAPI 可留空',
        apiKeyConfiguredPlaceholder: '已保存 API Key',
        credentialConfiguredLabel: '已配置',
        save: '保存并启用',
        saving: '保存中…',
        saved: '已保存，CLIProxyAPI 模型目录已同步。',
        syncTimeout: '等待 CLIProxyAPI 写入完整模型目录超时。',
        baseRequired: '请填写 Base URL。',
        baseInvalid: 'Base URL 必须是有效的 HTTP 或 HTTPS 地址。',
        noModels: 'CLIProxyAPI 未返回可用模型。',
      },
    }

    const styles = {
      section: {
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        maxWidth: '720px',
        padding: '24px 16px 40px',
        margin: '0 auto',
        color: 'var(--dsw-alias-label-primary, #1f2329)',
      },
      heading: {
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      },
      title: {
        margin: 0,
        fontSize: '16px',
        fontWeight: 600,
      },
      intro: {
        margin: 0,
        color: 'var(--dsw-alias-label-secondary, #717782)',
        fontSize: '13px',
        lineHeight: 1.5,
      },
      form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      },
      field: {
        display: 'flex',
        flexDirection: 'column',
        gap: '7px',
      },
      label: {
        fontSize: '14px',
        fontWeight: 500,
      },
      labelRow: {
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      },
      credentialStatus: {
        color: 'var(--dsw-alias-label-secondary, #717782)',
        fontSize: '12px',
        fontWeight: 400,
      },
      input: {
        boxSizing: 'border-box',
        width: '100%',
        minHeight: '38px',
        border: '1px solid var(--dsw-alias-border-primary, rgba(31, 35, 41, 0.14))',
        borderRadius: '10px',
        background: 'var(--dsw-alias-bg-layer-1, transparent)',
        color: 'var(--dsw-alias-label-primary, #1f2329)',
        padding: '8px 12px',
        font: 'inherit',
      },
      status: {
        margin: 0,
        color: 'var(--dsw-alias-label-secondary, #717782)',
        fontSize: '13px',
        lineHeight: 1.4,
      },
      statusError: {
        margin: 0,
        color: '#d84a4a',
        fontSize: '13px',
        lineHeight: 1.4,
      },
      actions: {
        display: 'flex',
        justifyContent: 'flex-end',
        gap: '10px',
        paddingTop: '4px',
      },
      button: {
        cursor: 'pointer',
        minHeight: '38px',
        border: '1px solid transparent',
        borderRadius: '10px',
        background: 'var(--dsw-alias-brand-primary, #111827)',
        color: '#fff',
        padding: '8px 14px',
        font: 'inherit',
      },
      buttonDisabled: {
        cursor: 'default',
        opacity: 0.55,
      },
    }

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

    function waitForProfileSynchronization(scope, baseURL, initial, messages) {
      let done = false
      let timeout
      let disposeScope = () => {}
      const initialRevision = Number.isInteger(initial?.revision) ? initial.revision : undefined
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
        disposeScope()
        if (error) rejectReady(error)
        else resolveReady(profile)
      }
      const inspect = (namespace, requireNewRevision) => {
        if (
          requireNewRevision
          && initialRevision !== undefined
          && (!Number.isInteger(namespace?.revision) || namespace.revision <= initialRevision)
        ) return
        const profile = namespace?.value?.providers?.[PROVIDER]
        if (!profile || profile.baseURL !== baseURL) return
        const pending = syncValueOf(profile.headers)
        if (pending !== undefined) return
        finish(undefined, profile)
      }
      const refresh = () => {
        if (!done) inspect(scope.getSnapshot(), true)
      }

      disposeScope = scope.subscribe(refresh)
      timeout = setTimeout(() => finish(new Error(messages.syncTimeout)), PROFILE_SYNC_TIMEOUT_MS)
      inspect(initial, false)
      refresh()
      return ready
    }

    async function installInitialProfile(api, scope, baseURL, apiKey, messages) {
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
      return waitForProfileSynchronization(scope, baseURL, updated, messages)
    }

    function profileOf(snapshot) {
      const value = snapshot?.value
      if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
      const providers = value.providers
      if (!providers || typeof providers !== 'object' || Array.isArray(providers)) return undefined
      return providers[PROVIDER]
    }

    function messagesOf(t) {
      return {
        baseRequired: t('baseRequired'),
        baseInvalid: t('baseInvalid'),
        noModels: t('noModels'),
        syncTimeout: t('syncTimeout'),
      }
    }

    async function credentialStatusOf(api) {
      try {
        const described = unwrap(await api.credentials.describe({ refs: [CREDENTIAL_REF] }))
        return described.credentials[CREDENTIAL_REF]?.configured === true
          ? 'configured'
          : 'missing'
      } catch {
        return 'unknown'
      }
    }

    function SettingsTab({ api, remote, scope, t }) {
      const snapshot = useSyncExternalStore(
        (listener) => scope.subscribe(listener),
        () => scope.getSnapshot(),
        () => scope.getSnapshot(),
      )
      const profile = profileOf(snapshot)
      const [baseURL, setBaseURL] = useState(DEFAULT_BASE_URL)
      const [apiKey, setApiKey] = useState('')
      const [loadedRevision, setLoadedRevision] = useState(undefined)
      const [credentialStatus, setCredentialStatus] = useState('unknown')
      const [saving, setSaving] = useState(false)
      const [feedback, setFeedback] = useState({ text: '', error: false })
      const messages = useMemo(() => messagesOf(t), [t])
      const readOnly = snapshot.status === 'ready' && !snapshot.writable
      const canSave = snapshot.status === 'ready' && snapshot.writable && !saving

      useEffect(() => {
        if (snapshot.status !== 'ready' || snapshot.revision === undefined) return
        if (snapshot.revision === loadedRevision) return
        setBaseURL(typeof profile?.baseURL === 'string' && profile.baseURL.length > 0
          ? profile.baseURL
          : DEFAULT_BASE_URL)
        setApiKey('')
        setLoadedRevision(snapshot.revision)
      }, [loadedRevision, profile?.baseURL, snapshot.revision, snapshot.status])

      useEffect(() => {
        let active = true
        const refresh = async () => {
          const status = await credentialStatusOf(api)
          if (active) setCredentialStatus(status)
        }
        void refresh()
        const dispose = remote.$on('credentials/updated', (ref) => {
          if (ref === CREDENTIAL_REF) void refresh()
        })
        return () => {
          active = false
          dispose()
        }
      }, [api, remote])

      const submit = async (event) => {
        event.preventDefault()
        if (!canSave) return
        const nextBaseURL = baseURL.trim().replace(/\/+$/, '')
        const nextApiKey = apiKey.trim()
        setSaving(true)
        setFeedback({ text: '', error: false })
        try {
          validBaseURL(nextBaseURL, messages)
          await installInitialProfile(api, scope, nextBaseURL, nextApiKey, messages)
          setApiKey('')
          setFeedback({ text: t('saved'), error: false })
        } catch (error) {
          setFeedback({
            text: error instanceof Error ? error.message : String(error),
            error: true,
          })
        } finally {
          setSaving(false)
        }
      }

      const statusText = snapshot.status === 'loading'
        ? t('loading')
        : ''
      return React.createElement(
        'div',
        { style: styles.section, 'aria-busy': saving || snapshot.status === 'loading' },
        React.createElement(
          'div',
          { style: styles.heading },
          React.createElement('h2', { style: styles.title }, t('title')),
          React.createElement('p', { style: styles.intro }, t('intro')),
        ),
        snapshot.status === 'unavailable'
          ? React.createElement('p', { style: styles.statusError, role: 'alert' }, t('unavailable'))
          : null,
        readOnly
          ? React.createElement('p', { style: styles.status, role: 'status' }, t('readOnly'))
          : null,
        statusText && snapshot.status !== 'unavailable'
          ? React.createElement('p', { style: styles.status, role: 'status' }, statusText)
          : null,
        React.createElement(
          'form',
          { style: styles.form, onSubmit: submit, noValidate: true },
          React.createElement(
            'label',
            { style: styles.field },
            React.createElement('span', { style: styles.label }, t('baseURL')),
            React.createElement('input', {
              style: styles.input,
              type: 'url',
              value: baseURL,
              autoComplete: 'url',
              disabled: !canSave,
              onChange: (event) => setBaseURL(event.currentTarget.value),
            }),
          ),
          React.createElement(
            'label',
            { style: styles.field },
            React.createElement(
              'span',
              { style: styles.labelRow },
              React.createElement('span', { style: styles.label }, t('apiKey')),
              credentialStatus === 'configured'
                ? React.createElement(
                  'span',
                  { style: styles.credentialStatus, role: 'status' },
                  t('credentialConfiguredLabel'),
                )
                : null,
            ),
            React.createElement('input', {
              style: styles.input,
              type: 'password',
              value: apiKey,
              placeholder: credentialStatus === 'configured'
                ? t('apiKeyConfiguredPlaceholder')
                : t('apiKeyPlaceholder'),
              autoComplete: 'off',
              disabled: !canSave,
              onChange: (event) => setApiKey(event.currentTarget.value),
            }),
          ),
          feedback.text
            ? React.createElement(
              'p',
              { style: feedback.error ? styles.statusError : styles.status, role: feedback.error ? 'alert' : 'status' },
              feedback.text,
            )
            : null,
          React.createElement(
            'div',
            { style: styles.actions },
            React.createElement(
              'button',
              {
                type: 'submit',
                style: canSave ? styles.button : { ...styles.button, ...styles.buttonDisabled },
                disabled: !canSave,
              },
              saving ? t('saving') : t('save'),
            ),
          ),
        ),
      )
    }

    function apply(ctx) {
      const api = ctx.get('connection').api
      const remote = ctx.get('remote')
      const locale = ctx.locale
      const settingsScope = ctx.settingsScope
      const t = locale.bind(SETTINGS_LOCALE_NS)
      const scope = settingsScope.bind({ namespace: PI_NS })

      ctx.effect(
        () => locale.register(SETTINGS_LOCALE_NS, copy),
        'dsh-provider-cpa: dictionaries',
      )

      ctx.slots.inject(SETTINGS_SLOT, () => ctx.slots.register({
        name: SETTINGS_SLOT,
        id: SETTINGS_TAB_ID,
        order: 30,
        label: () => t('tab'),
        locale: SETTINGS_LOCALE_NS,
        inject: () => ({ api, remote, scope }),
      }, SettingsTab))
    }

    exports.apply = apply
    exports.inject = inject
    exports.installInitialProfile = installInitialProfile
    exports.settingsTab = SettingsTab
    return module.exports
  },
})
