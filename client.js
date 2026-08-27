window.__ModuleLoader__.load({
  id: '@LiuRJ99/dsh-cpa-plugin',
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
    const MANAGEMENT_CREDENTIAL_REF = 'CPA_MANAGEMENT_KEY'
    const PROVIDER = 'CLIProxyAPI'
    const DEFAULT_BASE_URL = 'http://localhost:8317/v1'
    const PROFILE_SYNC_HEADER = 'x-dsh-provider-cpa-sync'
    const PROFILE_SYNC_TIMEOUT_MS = 30000
    const PLACEHOLDER_AUTHORIZATION = 'Bearer dsh-cliproxyapi-no-key'
    const SETTINGS_SLOT = 'settings.section'
    const SETTINGS_TAB_ID = 'cliproxyapi'
    const SETTINGS_LOCALE_NS = 'settings.cliProxyApi'
    const ADDITIVE_CLIENT_ID = '@LiuRJ99/dsh-cpa-plugin/legacy-client-addon'
    const QUOTA_CACHE_KEY = 'dsh-cliproxyapi:quota-cache:v1'
     const REFRESH_INTERVALS = [0, 5 * 60 * 1000, 30 * 60 * 1000, 60 * 60 * 1000, 3 * 60 * 60 * 1000, 5 * 60 * 60 * 1000]
    const EMPTY_CPA_STATE = { accounts: [], status: 'idle', quotaFetchedAt: undefined, refreshIntervalMs: 300000 }
        const inject = ['connection', 'remote', 'slots', 'locale', 'settingsScope']

    const copy = {
      en: {
        tab: 'CLIProxyAPI',
        title: 'CLIProxyAPI',
        intro: 'Connect CLIProxyAPI and synchronize models, account status and quota.',
        loading: 'Loading CLIProxyAPI settings…',
        unavailable: 'CLIProxyAPI settings are unavailable in this Web profile.',
        readOnly: 'Settings are read-only for this connection.',
        baseURL: 'CLIProxyAPI endpoint',
        apiKey: 'API key',
        apiKeyPlaceholder: 'Optional for a keyless CLIProxyAPI server',
        apiKeyConfiguredPlaceholder: 'API key already saved',
        credentialConfiguredLabel: 'Configured',
        managementKey: 'Management key',
        managementKeyPlaceholder: 'Optional for account status and quota',
        managementKeyConfiguredLabel: 'Configured',
        accounts: 'Accounts',
        refresh: 'Refresh',
        loadingRefresh: 'Refreshing…',
         refreshManual: 'Manual',
         refresh5m: '5 minutes',
         refresh30m: '30 minutes',
         refresh1h: '1 hour',
         refresh3h: '3 hours',
         refresh5h: '5 hours',
         refreshHint: 'Host automatically synchronizes models and account quota at the selected interval.',
        quotaUnavailable: '—',
        resetAt: 'Reset',
        cancel: 'Cancel',
        save: 'Save',
        saving: 'Saving…',
        saved: 'Saved. CLIProxyAPI models and account quota are synchronized.',
        syncTimeout: 'Timed out waiting for CLIProxyAPI to write the complete model catalog.',
        baseRequired: 'Base URL is required.',
        baseInvalid: 'Base URL must be a valid HTTP or HTTPS URL.',
        noModels: 'CLIProxyAPI returned no usable models.',
      },
      zh: {
        tab: 'CLIProxyAPI',
        title: 'CLIProxyAPI',
        intro: '连接 CLIProxyAPI，并同步模型、账号状态和额度。',
        loading: '正在读取 CLIProxyAPI 设置…',
        unavailable: '当前 Web 配置中无法访问 CLIProxyAPI 设置。',
        readOnly: '当前连接的设置为只读。',
        baseURL: 'CLIProxyAPI 接口地址',
        apiKey: 'API Key',
        apiKeyPlaceholder: '无鉴权的 CLIProxyAPI 可留空',
        apiKeyConfiguredPlaceholder: '已保存 API Key',
        credentialConfiguredLabel: '已配置',
        managementKey: '管理密钥',
        managementKeyPlaceholder: '可选，用于读取账号状态和额度',
        managementKeyConfiguredLabel: '已配置',
        accounts: '账号额度',
        refresh: '刷新',
        loadingRefresh: '正在刷新…',
         refreshManual: '手动',
         refresh5m: '5 分钟',
         refresh30m: '30 分钟',
         refresh1h: '1 小时',
         refresh3h: '3 小时',
         refresh5h: '5 小时',
         refreshHint: '由 Host 按所选间隔自动同步模型和账号额度。',
        quotaUnavailable: '—',
        resetAt: '重置',
        cancel: '取消',
        save: '保存',
        saving: '保存中…',
        saved: '已保存，CLIProxyAPI 模型和账号额度已同步。',
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
      accountSection: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        borderTop: '1px solid var(--dsw-alias-border-primary, rgba(31, 35, 41, 0.12))',
        paddingTop: '16px',
      },
      accountHeader: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      },
      select: {
        minHeight: '32px',
        border: '1px solid var(--dsw-alias-border-primary, rgba(31, 35, 41, 0.14))',
        borderRadius: '9px',
        background: 'var(--dsw-alias-bg-layer-1, transparent)',
        color: 'var(--dsw-alias-label-primary, #1f2329)',
        padding: '5px 28px 5px 10px',
        font: 'inherit',
        fontSize: '12px',
      },
      accountList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
      },
      accountRow: {
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '12px 14px',
        border: '1px solid var(--dsw-alias-border-primary, rgba(31, 35, 41, 0.10))',
        borderRadius: '12px',
        background: 'var(--dsw-alias-bg-layer-1, transparent)',
      },
      accountTitle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '8px',
        fontSize: '14px',
        fontWeight: 600,
      },
      accountMeta: {
        color: 'var(--dsw-alias-label-secondary, #717782)',
        fontSize: '12px',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      },
      statusDot: {
        width: '8px',
        height: '8px',
        flex: '0 0 auto',
        borderRadius: '50%',
      },
      quotaWindow: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      },
      quotaGroup: {
        marginTop: '4px',
        color: 'var(--dsw-alias-label-secondary, #717782)',
        fontSize: '11px',
        fontWeight: 600,
      },
      quotaLabel: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        gap: '8px',
        color: 'var(--dsw-alias-label-secondary, #717782)',
        fontSize: '12px',
      },
      quotaValue: {
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'flex-end',
        gap: '6px',
        minWidth: 0,
        color: 'var(--dsw-alias-label-primary, #1f2329)',
        fontVariantNumeric: 'tabular-nums',
        whiteSpace: 'nowrap',
      },
      quotaReset: {
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        color: 'var(--dsw-alias-label-secondary, #717782)',
        fontSize: '11px',
        fontWeight: 400,
      },
      progressTrack: {
        width: '100%',
        height: '5px',
        overflow: 'hidden',
        borderRadius: '999px',
        background: 'var(--dsw-alias-fill-tertiary, rgba(31, 35, 41, 0.10))',
      },
      progressBar: {
        height: '100%',
        borderRadius: 'inherit',
      },
      secondaryButton: {
        cursor: 'pointer',
        minHeight: '32px',
        border: '1px solid var(--dsw-alias-border-primary, rgba(31, 35, 41, 0.14))',
        borderRadius: '9px',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary, #1f2329)',
        padding: '6px 10px',
        font: 'inherit',
        fontSize: '12px',
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

    function unwrapRpc(response) {
      if (!response || response.ok !== true) {
        const error = response && response.error
        throw new Error(error && error.message ? error.message : 'CLIProxyAPI request failed')
      }
      return response.value
    }

    async function cpaRpc(connection, endpoint, payload) {
      return unwrapRpc(await connection.rpc.call('/cpa', endpoint, payload))
    }

    function quotaCacheKey(baseURL) {
      return `${QUOTA_CACHE_KEY}:${String(baseURL || '').trim().replace(/\/+$/, '')}`
    }

    function readQuotaCache(baseURL) {
      if (!baseURL) return undefined
      try {
        const raw = globalThis.localStorage?.getItem(quotaCacheKey(baseURL))
        if (!raw) return undefined
        const value = JSON.parse(raw)
        if (!value || typeof value !== 'object' || !Array.isArray(value.accounts)) return undefined
        return {
          accounts: value.accounts,
          fetchedAt: typeof value.fetchedAt === 'string' ? value.fetchedAt : undefined,
        }
      } catch {
        return undefined
      }
    }

    function writeQuotaCache(baseURL, accounts, fetchedAt) {
      if (!baseURL) return
      try {
        globalThis.localStorage?.setItem(quotaCacheKey(baseURL), JSON.stringify({
          accounts,
          fetchedAt,
        }))
      } catch {
        // A private browsing context or a full storage quota must not break
        // account status and quota refreshes.
      }
    }

    function mergeCachedAccounts(previous, next) {
      const oldByIndex = new Map((previous || []).map(account => [account.authIndex || account.id, account]))
      return (next || []).map(account => {
        const old = oldByIndex.get(account.authIndex || account.id)
        if (!old) return account
        return {
          ...account,
          ...account.plan === undefined && old.plan !== undefined ? { plan: old.plan } : {},
          ...account.quota === undefined && old.quota !== undefined ? { quota: old.quota } : {},
        }
      })
    }

    function normalizedPlan(account) {
      const provider = String(account?.provider || '').toLowerCase()
      const plan = String(account?.plan || '').trim().toLowerCase()
      if (provider.includes('antigravity') || provider.includes('gemini')) {
        if (plan.includes('pro')) return 'Pro'
        if (plan.includes('ultra')) return 'Ultra'
        if (plan.includes('free')) return 'Free'
      }
      if (plan.includes('team')) return 'Team'
      if (plan.includes('plus')) return 'Plus'
      if (plan.includes('pro')) return 'Pro'
      if (plan.includes('free')) return 'Free'
      return plan ? plan : ''
    }

    function accountTitle(account) {
      const provider = String(account?.provider || '').toLowerCase()
      const name = provider.includes('antigravity') || provider.includes('gemini')
        ? 'Antigravity'
        : provider.includes('codex') || provider.includes('openai') || provider.includes('chatgpt')
          ? 'Codex'
          : account?.provider || 'CLIProxyAPI'
      const plan = normalizedPlan(account)
      return plan ? `${name} · ${plan}` : name
    }

    function accountContact(account) {
      return String(account?.email || account?.account || account?.label || '').trim()
    }

    function quotaPercent(window) {
      const remaining = Number(window?.remaining ?? (window?.total !== undefined && window?.used !== undefined
        ? Number(window.total) - Number(window.used)
        : NaN))
      const total = Number(window?.total)
      if (!Number.isFinite(remaining)) return undefined
      if (String(window?.unit || '').trim() === '%') return Math.max(0, Math.min(100, remaining))
      if (Number.isFinite(total) && total > 0) return Math.max(0, Math.min(100, remaining / total * 100))
      return remaining >= 0 && remaining <= 100 ? remaining : undefined
    }

    function quotaWindows(account) {
      const quota = account?.quota
      if (!quota) return []
      if (Array.isArray(quota.windows) && quota.windows.length > 0) return quota.windows
      return [quota]
    }

    function quotaWindowName(window) {
      const key = String(window?.window || '').toLowerCase()
      if (key === 'five_hour') return '5小时'
      if (key === 'weekly') return '周限额'
      if (key === 'monthly') return '月'
      return window?.window || '额度'
    }

    function quotaStatus(account) {
      if (account?.disabled || account?.unavailable) return 'unavailable'
      const status = String(account?.status || '').toLowerCase()
      if (status && !['active', 'available', 'ok', 'ready'].includes(status)) return 'unavailable'
      const windows = quotaWindows(account)
      if (windows.some(window => {
        const percent = quotaPercent(window)
        return percent !== undefined && percent <= 0
      })) return 'low'
      return 'available'
    }

    function quotaColor(status) {
      if (status === 'unavailable') return '#dc322f'
      if (status === 'low') return '#d8892f'
      return '#5bb378'
    }

    function accountQuotaSummary(account, emptyLabel) {
      const windows = quotaWindows(account)
      if (windows.length === 0) return emptyLabel
      return windows.map(window => {
        const percent = quotaPercent(window)
        return `${quotaWindowName(window)} ${percent === undefined ? String(window?.label || emptyLabel) : `${Math.round(percent)}%`}`
      }).join(' · ')
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

    function bootstrapProfileOf(baseURL, models, hasCredential, syncToken, previousModels) {
      const previousById = new Map(
        Array.isArray(previousModels)
          ? previousModels.flatMap((model) => {
            const id = typeof model?.id === 'string' && model.id.trim() !== '' ? model.id.trim() : undefined
            return id === undefined ? [] : [[id, model]]
          })
          : [],
      )
      return {
        displayName: PROVIDER,
        api: 'openai-responses',
        baseURL,
        models: models.map((model) => ({
          id: model.id,
          name: model.name || model.id,
          contextWindow: previousById.get(model.id)?.contextWindow ?? (model.contextWindow || 262144),
          maxTokens: previousById.get(model.id)?.maxTokens ?? (model.maxTokens || 32768),
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
      const existingProfile = namespace.value?.providers?.[PROVIDER]
      const existingBaseURL = typeof existingProfile?.baseURL === 'string'
        ? existingProfile.baseURL.trim().replace(/\/+$/, '')
        : undefined
      const updated = unwrap(await api.settings.mutate({
        ns: PI_NS,
        ops: [{
          op: 'set',
          path: ['providers', PROVIDER],
          value: bootstrapProfileOf(
            baseURL,
            discovered,
            hasCredential,
            syncToken,
            existingBaseURL === baseURL ? existingProfile.models : undefined,
          ),
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

    async function credentialStatusOf(api, ref = CREDENTIAL_REF) {
      try {
        const described = unwrap(await api.credentials.describe({ refs: [ref] }))
        return described.credentials[ref]?.configured === true
          ? 'configured'
          : 'missing'
      } catch {
        return 'unknown'
      }
    }

    function resetMeta(value) {
      if (!value) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      const pad = (part) => String(part).padStart(2, '0')
      const formatted = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
      const remainingMs = date.getTime() - Date.now()
      if (remainingMs <= 0) return `${formatted} · 已到期`
      const days = Math.floor(remainingMs / 86400000)
      if (days > 0) return `${formatted} · ${days}天后`
      const hours = Math.floor(remainingMs / 3600000)
      if (hours > 0) return `${formatted} · ${hours}小时后`
      const minutes = Math.max(1, Math.floor(remainingMs / 60000))
      return `${formatted} · ${minutes}分钟后`
    }

    function AccountRows({ accounts, loading, onRefresh, refreshIntervalMs, onRefreshIntervalChange, t }) {
      return React.createElement(
        'div',
        { style: styles.accountSection },
        React.createElement(
          'div',
          { style: styles.accountHeader },
          React.createElement('span', { style: styles.label }, t('accounts')),
          React.createElement(
            'button',
            {
              type: 'button',
              style: loading ? { ...styles.secondaryButton, ...styles.buttonDisabled } : styles.secondaryButton,
              disabled: loading,
              onClick: onRefresh,
            },
            loading ? t('loadingRefresh') : t('refresh'),
          ),
          ),
        React.createElement(
           'select',
           {
             style: styles.select,
             value: String(refreshIntervalMs),
             onChange: (event) => onRefreshIntervalChange(Number(event.currentTarget.value)),
           },
           React.createElement('option', { value: String(REFRESH_INTERVALS[0]) }, t('refreshManual')),
           React.createElement('option', { value: String(REFRESH_INTERVALS[1]) }, t('refresh5m')),
           React.createElement('option', { value: String(REFRESH_INTERVALS[2]) }, t('refresh30m')),
           React.createElement('option', { value: String(REFRESH_INTERVALS[3]) }, t('refresh1h')),
           React.createElement('option', { value: String(REFRESH_INTERVALS[4]) }, t('refresh3h')),
           React.createElement('option', { value: String(REFRESH_INTERVALS[5]) }, t('refresh5h')),
         ),
         React.createElement('p', { style: styles.status }, t('refreshHint')),
        accounts.length === 0 && !loading
          ? React.createElement('p', { style: styles.status }, t('quotaUnavailable'))
          : React.createElement(
            'div',
            { style: styles.accountList },
            accounts.map((account) => {
              const status = quotaStatus(account)
              const color = quotaColor(status)
              const contact = accountContact(account)
              const windows = quotaWindows(account)
              return React.createElement(
                'div',
                { key: account.authIndex || account.id, style: styles.accountRow },
                React.createElement(
                  'div',
                  { style: styles.accountTitle },
                  React.createElement('span', null, accountTitle(account)),
                  React.createElement('span', { style: { ...styles.statusDot, background: color }, title: status }),
                ),
                contact
                  ? React.createElement('div', { style: styles.accountMeta, title: contact }, contact)
                  : null,
                windows.length === 0
                  ? React.createElement('div', { style: styles.accountMeta }, t('quotaUnavailable'))
                  : windows.map((window, index) => {
                    const percent = quotaPercent(window)
                    const label = percent === undefined
                      ? String(window?.label || t('quotaUnavailable'))
                      : `${Math.round(percent)}%`
                    const reset = window?.resetAt ? resetMeta(window.resetAt) : ''
                    const group = String(window?.group || '').trim()
                    const previousGroup = String(windows[index - 1]?.group || '').trim()
                    return React.createElement(
                      React.Fragment,
                      { key: `${account.authIndex || account.id}-${index}` },
                      group && group !== previousGroup
                        ? React.createElement('div', { style: styles.quotaGroup }, group)
                        : null,
                      React.createElement(
                        'div',
                        { style: styles.quotaWindow },
                        React.createElement(
                          'div',
                          { style: styles.quotaLabel },
                          React.createElement('span', null, quotaWindowName(window)),
                          React.createElement(
                            'span',
                            { style: styles.quotaValue },
                            React.createElement('span', null, label),
                            reset ? React.createElement('span', { style: styles.quotaReset, title: reset }, reset) : null,
                          ),
                        ),
                        percent === undefined
                          ? null
                          : React.createElement(
                            'div',
                            { style: styles.progressTrack },
                            React.createElement('div', {
                              style: { ...styles.progressBar, width: `${percent}%`, background: color },
                            }),
                          ),
                        ),
                    )
                  }),
              )
            }),
          ),
      )
    }

    function SettingsTab({ api, connection, remote, scope, t, cpa }) {
      const snapshot = useSyncExternalStore(
        (listener) => scope.subscribe(listener),
        () => scope.getSnapshot(),
        () => scope.getSnapshot(),
      )
      // The composer owns the single browser-side CPA snapshot. Reuse it here
      // so Settings and the input indicator cannot render different local
      // quota states for the same Host response.
      const cpaState = useSyncExternalStore(
        (listener) => cpa?.store?.subscribe(listener) || (() => {}),
        () => cpa?.store?.getSnapshot() || EMPTY_CPA_STATE,
        () => cpa?.store?.getSnapshot() || EMPTY_CPA_STATE,
      )
      const profile = profileOf(snapshot)
      const [baseURL, setBaseURL] = useState(DEFAULT_BASE_URL)
      const [apiKey, setApiKey] = useState('')
      const [managementKey, setManagementKey] = useState('')
      const [loadedRevision, setLoadedRevision] = useState(undefined)
      const [credentialStatus, setCredentialStatus] = useState('unknown')
      const [managementCredentialStatus, setManagementCredentialStatus] = useState('unknown')
      const [accounts, setAccounts] = useState([])
      const [accountsLoading, setAccountsLoading] = useState(false)
      const [cacheFetchedAt, setCacheFetchedAt] = useState(undefined)
       const [refreshIntervalMs, setRefreshIntervalMs] = useState(300000)
      const [saving, setSaving] = useState(false)
      const [feedback, setFeedback] = useState({ text: '', error: false })
      const messages = useMemo(() => messagesOf(t), [t])
      const readOnly = snapshot.status === 'ready' && !snapshot.writable
      const canSave = snapshot.status === 'ready' && snapshot.writable && !saving
      const visibleAccounts = cpa === undefined ? accounts : cpaState.accounts
      const visibleAccountsLoading = cpa === undefined ? accountsLoading : cpaState.status === 'loading'
      const visibleRefreshIntervalMs = cpa === undefined ? refreshIntervalMs : cpaState.refreshIntervalMs

      useEffect(() => {
        if (snapshot.status !== 'ready' || snapshot.revision === undefined) return
        if (snapshot.revision === loadedRevision) return
        setBaseURL(typeof profile?.baseURL === 'string' && profile.baseURL.length > 0
          ? profile.baseURL
          : DEFAULT_BASE_URL)
        setApiKey('')
        setManagementKey('')
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
          if (ref === MANAGEMENT_CREDENTIAL_REF) {
            void credentialStatusOf(api, MANAGEMENT_CREDENTIAL_REF).then(status => {
              if (active) setManagementCredentialStatus(status)
            })
          }
        })
        void credentialStatusOf(api, MANAGEMENT_CREDENTIAL_REF).then(status => {
          if (active) setManagementCredentialStatus(status)
        })
        return () => {
          active = false
          dispose()
        }
      }, [api, remote])

      useEffect(() => {
         let active = true
         if (cpa !== undefined) return () => { active = false }
         void cpaRpc(connection, 'config', {}).then(value => {
           if (active && Number.isFinite(Number(value?.refreshIntervalMs))) setRefreshIntervalMs(Number(value.refreshIntervalMs))
         }).catch(() => {})
         return () => { active = false }
       }, [connection])

       const cacheBaseURL = String(profile?.baseURL || baseURL || DEFAULT_BASE_URL).trim()

      const refreshAll = async (
        previousAccounts = accounts,
         baseURLOverride = cacheBaseURL,
      ) => {
        if (cpa !== undefined) {
          try {
            await cpa.refresh()
          } catch (error) {
            setFeedback({
              text: error instanceof Error ? error.message : String(error),
              error: true,
            })
          }
          return
        }
        setAccountsLoading(true)
        try {
          const value = await cpaRpc(connection, 'refresh', {})
          const nextAccounts = mergeCachedAccounts(previousAccounts, Array.isArray(value?.accounts) ? value.accounts : [])
          setAccounts(nextAccounts)
          const fetchedAt = value?.quotaFetchedAt || value?.fetchedAt
           setCacheFetchedAt(fetchedAt)
           writeQuotaCache(baseURLOverride, nextAccounts, fetchedAt)
        } catch (error) {
          setFeedback({
            text: error instanceof Error ? error.message : String(error),
            error: true,
          })
        } finally {
          setAccountsLoading(false)
        }
      }

      useEffect(() => {
        if (cpa !== undefined) {
          if (snapshot.status === 'ready' && managementCredentialStatus === 'configured') void cpa.refresh().catch(() => {})
          return
        }
        if (snapshot.status === 'ready' && managementCredentialStatus === 'configured') {
           const cached = readQuotaCache(cacheBaseURL)
           if (cached) {
            setAccounts(cached.accounts)
            setCacheFetchedAt(cached.fetchedAt)
            }
           void refreshAll(cached?.accounts || [])
        }
      }, [cpa, connection, managementCredentialStatus, snapshot.status, profile?.baseURL])

      const changeRefreshInterval = async (value) => {
         if (!REFRESH_INTERVALS.includes(value)) return
         if (cpa !== undefined) {
           try {
             await cpa.setRefreshInterval(value)
           } catch (error) {
             setFeedback({ text: error instanceof Error ? error.message : String(error), error: true })
           }
           return
         }
         setRefreshIntervalMs(value)
         try {
           const response = await cpaRpc(connection, 'set-refresh-interval', { refreshIntervalMs: value })
           if (Number.isFinite(Number(response?.refreshIntervalMs))) setRefreshIntervalMs(Number(response.refreshIntervalMs))
            if (Array.isArray(response?.accounts)) {
              setAccounts(response.accounts)
              const fetchedAt = response.quotaFetchedAt || response.fetchedAt
              setCacheFetchedAt(fetchedAt)
              writeQuotaCache(cacheBaseURL, response.accounts, fetchedAt)
            }
         } catch (error) {
           setFeedback({ text: error instanceof Error ? error.message : String(error), error: true })
         }
       }

       const submit = async (event) => {
        event.preventDefault()
        if (!canSave) return
        const nextBaseURL = baseURL.trim().replace(/\/+$/, '')
        const nextApiKey = apiKey.trim()
        const nextManagementKey = managementKey.trim()
        setSaving(true)
        setFeedback({ text: '', error: false })
        try {
          validBaseURL(nextBaseURL, messages)
          if (nextManagementKey) {
            unwrap(await api.credentials.set({ ref: MANAGEMENT_CREDENTIAL_REF, value: nextManagementKey }))
          }
          await installInitialProfile(api, scope, nextBaseURL, nextApiKey, messages)
          if (cpa === undefined) writeQuotaCache(nextBaseURL, accounts, cacheFetchedAt)
          else await cpa.refreshConfig()
          setApiKey('')
          setManagementKey('')
          setManagementCredentialStatus(nextManagementKey ? 'configured' : managementCredentialStatus)
          void refreshAll(accounts, nextBaseURL)
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

      const cancel = () => {
        setBaseURL(typeof profile?.baseURL === 'string' && profile.baseURL.length > 0
          ? profile.baseURL
          : DEFAULT_BASE_URL)
        setApiKey('')
        setManagementKey('')
            setFeedback({ text: '', error: false })
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
          React.createElement(
            'label',
            { style: styles.field },
            React.createElement(
              'span',
              { style: styles.labelRow },
              React.createElement('span', { style: styles.label }, t('managementKey')),
              managementCredentialStatus === 'configured'
                ? React.createElement(
                  'span',
                  { style: styles.credentialStatus, role: 'status' },
                  t('managementKeyConfiguredLabel'),
                )
                : null,
            ),
            React.createElement('input', {
              style: styles.input,
              type: 'password',
              value: managementKey,
              placeholder: managementCredentialStatus === 'configured'
                ? t('managementKeyConfiguredLabel')
                : t('managementKeyPlaceholder'),
              autoComplete: 'off',
              disabled: !canSave,
              onChange: (event) => setManagementKey(event.currentTarget.value),
            }),
          ),
          React.createElement(AccountRows, {
            accounts: visibleAccounts,
            loading: visibleAccountsLoading,
            onRefresh: () => { void refreshAll() },
             refreshIntervalMs: visibleRefreshIntervalMs,
             onRefreshIntervalChange: (value) => { void changeRefreshInterval(value) },
                t,
          }),
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
                type: 'button',
                style: canSave ? styles.secondaryButton : { ...styles.secondaryButton, ...styles.buttonDisabled },
                disabled: !canSave,
                onClick: cancel,
              },
              t('cancel'),
            ),
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
      // The upstream settings tab remains the package's primary surface. The
      // model-selection extension is loaded only when
      // the full Web client context exposes the extension seam.
      let cpa
      if (typeof ctx.inject === 'function') {
        const additive = require(ADDITIVE_CLIENT_ID)
        if (typeof additive?.applyAdditive === 'function') cpa = additive.applyAdditive(ctx)
      }
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
        order: 25,
        label: () => t('tab'),
        locale: SETTINGS_LOCALE_NS,
        inject: () => ({ api, connection: ctx.get('connection'), remote, scope, cpa }),
      }, SettingsTab))
    }

    exports.apply = apply
    exports.inject = inject
    exports.installInitialProfile = installInitialProfile
    exports.settingsTab = SettingsTab
    return module.exports
  },
})
