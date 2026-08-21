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
    const DEFAULT_BASE_URL = 'http://127.0.0.1:8317/v1'
    const PROFILE_SYNC_HEADER = 'x-dsh-provider-cpa-sync'
    const PROFILE_SYNC_TIMEOUT_MS = 30000
    const PLACEHOLDER_AUTHORIZATION = 'Bearer dsh-cliproxyapi-no-key'
    const SETTINGS_SLOT = 'settings.plugins.tab'
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
        order: 30,
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

window.__ModuleLoader__.load({
	id: "@LiuRJ99/dsh-cpa-plugin/legacy-client-addon",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let _deepseek_ai_dsh_client_runtime_client = require("@deepseek-ai/dsh-client-runtime/client");
		//#region src/client/cpa-account-display.ts
		function accountLabel(account) {
			const provider = providerLabel(account.provider);
			const plan = planLabel(account.plan);
			return plan === "" ? provider : `${provider} · ${plan}`;
		}
		function accountIdentity(account) {
			const email = account.email?.trim();
			if (email !== void 0 && email !== "") return email;
			const label = account.label?.trim();
			if (label !== void 0 && label !== "") return label;
			const value = account.account?.trim();
			return value !== void 0 && value.includes("@") ? value : "—";
		}
		/**
		* Return the provider's quota windows in a form the settings page can render
		* as percentage bars. Compact account summaries continue to use
		* accountQuotaLabel(), so this does not change their layout or wording.
		*/
		function accountQuotaProgress(quota, t) {
			if (quota?.windows !== void 0 && quota.windows.length > 0) return deduplicateQuotaWindows(quota.windows).map(([kind, window]) => ({
				key: kind,
				label: quotaWindowLabel(kind, window, t),
				...quotaPercent(window) === void 0 ? {} : { percent: quotaPercent(window) },
				...window.resetAt === void 0 ? {} : { resetAt: window.resetAt }
			}));
			if (quota === void 0) return [];
			const label = quota.label?.trim() || t("account.quotaOverall");
			const percent = quotaPercent(quota);
			if (percent === void 0 && quota.resetAt === void 0 && (quota.label?.trim() ?? "") === "") return [];
			return [{
				key: "overall",
				label,
				...percent === void 0 ? {} : { percent },
				...quota.resetAt === void 0 ? {} : { resetAt: quota.resetAt }
			}];
		}
		function formatQuotaResetAt(value) {
			const raw = value.trim();
			if (raw === "") return raw;
			const numeric = Number(raw);
			const date = Number.isFinite(numeric) ? new Date(Math.abs(numeric) < 0xe8d4a51000 ? numeric * 1e3 : numeric) : new Date(raw);
			if (Number.isNaN(date.getTime())) return raw;
			return date.toLocaleString(void 0, {
				month: "numeric",
				day: "numeric",
				hour: "2-digit",
				minute: "2-digit"
			});
		}
		function quotaPercent(value) {
			const remaining = value.remaining ?? (value.total !== void 0 && value.used !== void 0 ? value.total - value.used : void 0);
			if (remaining === void 0 || !Number.isFinite(remaining)) return void 0;
			if (value.unit?.trim() === "%") return clampPercent(remaining);
			if (value.total !== void 0 && value.total > 0) return clampPercent(remaining / value.total * 100);
			if (remaining >= 0 && remaining <= 100) return clampPercent(remaining);
		}
		function clampPercent(value) {
			return Math.max(0, Math.min(100, value));
		}
		function deduplicateQuotaWindows(windows) {
			const byKind = /* @__PURE__ */ new Map();
			for (const window of windows) {
				const kind = quotaWindowKind(window.window);
				const current = byKind.get(kind);
				if (current === void 0 || window.remaining < current.remaining) byKind.set(kind, window);
			}
			return [...byKind.entries()].sort(([left], [right]) => quotaWindowOrder(left) - quotaWindowOrder(right));
		}
		function quotaWindowOrder(kind) {
			if (kind === "five_hour") return 0;
			if (kind === "weekly") return 1;
			return 2;
		}
		function accountAvailabilityLabel(account, t) {
			switch (accountAvailability(account)) {
				case "available": return t("account.available");
				case "quota-low": return t("account.quotaLow");
				default: return t("account.unavailable");
			}
		}
		function accountAvailability(account) {
			if (account.disabled || account.unavailable || statusLooksUnavailable(account.status, account.statusMessage)) return "unavailable";
			if (quotaLooksInsufficient(account)) return "quota-low";
			return "available";
		}
		function quotaLooksInsufficient(account) {
			if (account.quota?.windows?.some((window) => window.exceeded === true || window.remaining <= 0 || window.total !== void 0 && window.total > 0 && window.remaining / window.total <= .2)) return true;
			if (account.quota?.exceeded === true) return true;
			if (account.quota?.remaining !== void 0 && account.quota.remaining <= 0) return true;
			if (account.quota?.remaining !== void 0 && account.quota.total !== void 0 && account.quota.total > 0 && account.quota.remaining / account.quota.total <= .2) return true;
			if (account.nextRetryAfter !== void 0) return true;
			return /(quota|limit|exhaust|insufficient|balance|credit|rate.?limit|too many|429)/i.test(`${account.status} ${account.statusMessage ?? ""}`);
		}
		function quotaWindowKind(value) {
			const normalized = value.trim().toLowerCase().replace(/[-\s]+/g, "_");
			if (normalized === "five_hour" || normalized === "5h" || normalized.includes("five_hour")) return "five_hour";
			if (normalized === "weekly" || normalized === "week" || normalized.includes("week")) return "weekly";
			return normalized;
		}
		function quotaWindowLabel(kind, window, t) {
			if (kind === "five_hour") return t("account.quotaFiveHour");
			if (kind === "weekly") return t("account.quotaWeekly");
			return window.window.trim() || t("account.quotaUnknown");
		}
		function statusLooksUnavailable(status, message) {
			return /(disabled|invalid|expired|error|failed|unauthor|forbidden|offline|removed)/i.test(`${status} ${message ?? ""}`);
		}
		function providerLabel(provider) {
			switch (provider.trim().toLowerCase()) {
				case "codex": return "Codex";
				case "antigravity": return "Antigravity";
				default: return provider.trim() || "CLIProXyAPI";
			}
		}
		function planLabel(plan) {
			if (plan === void 0 || plan.trim() === "") return "";
			const normalized = plan.trim().toLowerCase();
			if (normalized === "plus") return "Plus";
			if (normalized === "team") return "Team";
			if (normalized === "business") return "Business";
			if (normalized === "pro") return "Pro";
			if (normalized === "free" || normalized === "free-tier") return "Free";
			return plan.trim();
		}
		//#endregion
		//#region src/client/cpa-account-indicator.tsx
		/** Read-only current-account indicator with a model-scoped account switcher. */
		function CpaAccountIndicator({ cpa, directory, sessionId, t }) {
			const cpaState = (0, react.useSyncExternalStore)((listener) => cpa.store.subscribe(listener), () => cpa.store.getSnapshot());
			const current = (0, react.useSyncExternalStore)((listener) => directory.subscribe(listener), () => directory.getSnapshot()).current;
			const model = current?.provider === cpaState.providerId ? current.model : void 0;
			const accountFingerprint = cpaState.accounts.map((account) => account.authIndex).join("\0");
			const [supported, setSupported] = (0, react.useState)(void 0);
			const [loading, setLoading] = (0, react.useState)(false);
			const [open, setOpen] = (0, react.useState)(false);
			const [error, setError] = (0, react.useState)(null);
			const rootRef = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				let cancelled = false;
				setOpen(false);
				setError(null);
				if (model === void 0) {
					setSupported(void 0);
					return () => {
						cancelled = true;
					};
				}
				setSupported(void 0);
				setLoading(true);
				(async () => {
					let accounts = cpa.store.getSnapshot().accounts;
					if (accounts.length === 0) accounts = await cpa.loadAccounts();
					const matches = await Promise.all(accounts.map(async (account) => {
						try {
							return modelListContains$1(await cpa.loadAccountModels(account), model) ? account : void 0;
						} catch {
							return;
						}
					}));
					if (!cancelled) setSupported(matches.filter((account) => account !== void 0));
				})().catch(() => {
					if (!cancelled) setSupported([]);
				}).finally(() => {
					if (!cancelled) setLoading(false);
				});
				return () => {
					cancelled = true;
				};
			}, [
				accountFingerprint,
				cpa,
				model
			]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target)) setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
				};
			}, [open]);
			const liveSupported = supported?.map((account) => cpaState.accounts.find((currentAccount) => currentAccount.authIndex === account.authIndex) ?? account) ?? [];
			if (model === void 0 || supported === void 0 || liveSupported.length === 0 || loading) return null;
			const account = currentAccount(liveSupported, cpa.selected(sessionId));
			if (account === void 0) return null;
			const availability = accountAvailability(account);
			const availabilityLabel = accountAvailabilityLabel(account, t);
			const progress = accountQuotaProgress(account.quota, t);
			const primary = progress[0];
			const percent = primary?.percent;
			const quotaLabel = primary === void 0 ? t("account.quotaUnknown") : percent === void 0 ? primary.label : `${primary.label} ${Math.round(percent)}%`;
			const title = [
				accountLabel(account),
				accountIdentity(account),
				...progress.map(formatProgress),
				availabilityLabel
			].join(" · ");
			const choose = (next) => {
				setError(null);
				cpa.selectAccount(sessionId, next.authIndex).then(() => {
					setOpen(false);
				}).catch((cause) => {
					setError(cause instanceof Error ? cause.message : String(cause));
				});
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: "dsh-cpa-account-indicator-shell",
				role: "status",
				"aria-live": "polite",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: `dsh-cpa-account-indicator is-${availability}`,
					"aria-label": title,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					title,
					onClick: () => {
						setOpen((value) => !value);
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-cpa-account-indicator-progress",
							style: percent === void 0 ? void 0 : { width: `${percent}%` }
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
							className: "dsh-cpa-account-indicator-copy",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: accountLabel(account) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: accountIdentity(account) })]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-cpa-account-indicator-quota",
							children: quotaLabel
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-cpa-account-indicator-dot",
							"aria-hidden": "true"
						})
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-cpa-account-menu",
					role: "menu",
					"aria-label": t("account.switcher"),
					children: [liveSupported.map((option) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountOption, {
						account: option,
						selected: option.authIndex === account.authIndex,
						onChoose: choose,
						t
					}, option.authIndex)), error !== null ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "dsh-cpa-account-menu-error",
						role: "alert",
						children: error
					}) : null]
				}) : null]
			});
		}
		function AccountOption({ account, selected, onChoose, t }) {
			const availability = accountAvailability(account);
			const primary = accountQuotaProgress(account.quota, t)[0];
			const percent = primary?.percent;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: `dsh-cpa-account-option is-${availability}${selected ? " is-selected" : ""}`,
				role: "menuitemradio",
				"aria-checked": selected,
				onClick: () => {
					onChoose(account);
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-cpa-account-option-progress",
						style: percent === void 0 ? void 0 : { width: `${percent}%` }
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
						className: "dsh-cpa-account-option-copy",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: accountLabel(account) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: accountIdentity(account) })]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-cpa-account-option-quota",
						children: primary === void 0 ? t("account.quotaUnknown") : primary.percent === void 0 ? primary.label : `${Math.round(primary.percent)}%`
					}),
					selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-cpa-account-option-check",
						"aria-hidden": "true",
						children: "✓"
					}) : null
				]
			});
		}
		function currentAccount(accounts, selected) {
			if (selected !== void 0) {
				const explicit = accounts.find((account) => account.authIndex === selected);
				if (explicit !== void 0) return explicit;
			}
			return accounts.find((account) => accountAvailability(account) === "available") ?? accounts[0];
		}
		function modelListContains$1(models, modelId) {
			const wanted = modelId.trim().toLowerCase();
			return wanted !== "" && models.some((model) => model.trim().toLowerCase() === wanted);
		}
		function formatProgress(progress) {
			const percent = progress.percent === void 0 ? "—" : `${Math.round(progress.percent)}%`;
			return `${progress.label} ${percent}`;
		}
		//#endregion
		//#region src/client/cpa-client.ts
		const QUOTA_CACHE_KEY = "dsh-cliproxyapi:quota-cache:v1";
		const ACCOUNT_PREFERENCES_KEY = "dsh-cliproxyapi:account-preferences:v1";
		const ACCOUNT_DEFAULT_KEY = "dsh-cliproxyapi:account-default:v1";
		const SPEED_PREFERENCES_KEY = "dsh-cliproxyapi:speed-preferences:v1";
		/** Browser-safe facade over the Host-owned `/cpa` RPC channel. */
		var CpaClient = class {
			rpc;
			store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)({
				providerId: "cpa",
				endpoint: "",
				managementKeyEnv: "CPA_MANAGEMENT_KEY",
				managementKeyConfigured: false,
				refreshIntervalMs: 3e5,
				status: "idle",
				accounts: [],
				fetchedAt: void 0,
				quotaFetchedAt: void 0,
				modelCapabilities: [],
				capabilitiesFetchedAt: void 0,
				inputCapabilities: {},
				inputCapabilitiesFetchedAt: void 0,
				inputCapabilitiesStatus: "idle",
				error: null,
				selectedBySession: readAccountPreferences(),
				defaultAccount: readDefaultAccountPreference(),
				speedBySessionModel: readSpeedPreferences()
			});
			configPromise;
			capabilitiesPromise;
			inputCapabilitiesPromise;
			accountModels = /* @__PURE__ */ new Map();
			constructor(rpc) {
				this.rpc = rpc;
			}
			async refreshConfig() {
				this.configPromise = void 0;
				this.capabilitiesPromise = void 0;
				this.inputCapabilitiesPromise = void 0;
				return this.loadConfig();
			}
			async setRefreshInterval(refreshIntervalMs) {
				const value = await this.call("set-refresh-interval", { refreshIntervalMs });
				this.store.update((state) => {
					state.refreshIntervalMs = value.refreshIntervalMs;
				});
				this.applyAccounts(value, true);
				return value.refreshIntervalMs;
			}
			async loadConfig() {
				this.configPromise ??= this.call("config", {});
				try {
					const value = await this.configPromise;
					this.store.update((state) => {
						state.providerId = value.providerId;
						state.endpoint = value.endpoint;
						state.managementKeyEnv = value.managementKeyEnv;
						state.managementKeyConfigured = value.managementKeyConfigured;
						state.refreshIntervalMs = value.refreshIntervalMs;
						state.error = null;
					});
					this.hydrateQuotaSnapshot(value.endpoint);
					return value;
				} catch (error) {
					this.store.update((state) => {
						state.error = messageOf$1(error);
					});
					throw error;
				}
			}
			/** Read the latest Host-side account snapshot without starting another upstream refresh. */
			async loadAccounts() {
				this.store.update((state) => {
					state.status = "loading";
					state.error = null;
				});
				try {
					const value = await this.call("accounts", {});
					return this.applyAccounts(value, false);
				} catch (error) {
					this.store.update((state) => {
						state.status = "error";
						state.error = messageOf$1(error);
					});
					throw error;
				}
			}
			/** Unified refresh: synchronize the model catalog and account quota snapshot. */
			async refresh() {
				this.store.update((state) => {
					state.status = "loading";
					state.error = null;
				});
				try {
					await this.loadConfig();
					const value = await this.call("refresh", {});
					return this.applyAccounts(value, true);
				} catch (error) {
					this.store.update((state) => {
						state.status = "error";
						state.error = messageOf$1(error);
					});
					throw error;
				}
			}
			applyAccounts(value, replace) {
				const accounts = replace ? value.accounts : mergeAccountSnapshots(this.store.getSnapshot().accounts, value.accounts);
				this.store.update((state) => {
					state.accounts = accounts;
					state.fetchedAt = value.fetchedAt;
					if (value.quotaFetchedAt !== void 0) state.quotaFetchedAt = value.quotaFetchedAt;
					state.status = "ready";
					state.error = null;
				});
				this.reconcileSelectedAccounts(accounts);
				if (value.quotaFetchedAt !== void 0) this.persistQuotaSnapshot(accounts, value.quotaFetchedAt);
				this.accountModels.clear();
				return accounts;
			}
			async loadModelCapabilities() {
				this.capabilitiesPromise ??= this.call("model-capabilities", {});
				try {
					const value = await this.capabilitiesPromise;
					this.store.update((state) => {
						state.modelCapabilities = value.models;
						state.capabilitiesFetchedAt = value.fetchedAt;
					});
					this.restorePersistedSpeeds(value.models);
					return value.models;
				} catch (error) {
					this.capabilitiesPromise = void 0;
					this.store.update((state) => {
						state.modelCapabilities = [];
						state.capabilitiesFetchedAt = void 0;
					});
					throw error;
				}
			}
			async loadInputCapabilities() {
				this.store.update((state) => {
					state.inputCapabilitiesStatus = "loading";
				});
				this.inputCapabilitiesPromise ??= this.call("model-input-capabilities", {});
				try {
					const value = await this.inputCapabilitiesPromise;
					const inputCapabilities = {};
					for (const model of value.models) inputCapabilities[modelKey(model.provider, model.model)] = model.input;
					this.store.update((state) => {
						state.inputCapabilities = inputCapabilities;
						state.inputCapabilitiesFetchedAt = value.fetchedAt;
						state.inputCapabilitiesStatus = "ready";
					});
					return value.models;
				} catch (error) {
					this.inputCapabilitiesPromise = void 0;
					this.store.update((state) => {
						state.inputCapabilitiesStatus = "error";
					});
					throw error;
				}
			}
			async selectAccount(sessionId, authIndex, options = {}) {
				await this.call("select-account", {
					sessionId,
					authIndex,
					persistDefault: options.persistDefault !== false
				});
				const preferences = { ...this.store.getSnapshot().selectedBySession };
				if (authIndex === void 0) delete preferences[sessionId];
				else preferences[sessionId] = authIndex;
				const persistDefault = options.persistDefault !== false;
				this.store.update((state) => {
					state.selectedBySession = preferences;
					if (persistDefault) state.defaultAccount = authIndex;
				});
				persistAccountPreferences(preferences);
				if (persistDefault) persistDefaultAccountPreference(authIndex);
			}
			/** Restore the Host-side fallback when the browser creates a new client session. */
			async loadSelectedAccount(sessionId) {
				const value = await this.call("account-selection", { sessionId });
				const preferences = { ...this.store.getSnapshot().selectedBySession };
				if (value.selected === void 0) delete preferences[sessionId];
				else preferences[sessionId] = value.selected;
				this.store.update((state) => {
					state.selectedBySession = preferences;
				});
				persistAccountPreferences(preferences);
				return value.selected;
			}
			/** Fetch the model catalog associated with one account when CPA supports it. */
			async loadAccountModels(account) {
				const cacheKey = `${account.authIndex}\u0000${account.name}`;
				const pending = this.accountModels.get(cacheKey) ?? this.call("account-models", {
					authIndex: account.authIndex,
					name: account.name
				}).then((value) => value.models);
				this.accountModels.set(cacheKey, pending);
				try {
					return await pending;
				} catch (error) {
					this.accountModels.delete(cacheKey);
					throw error;
				}
			}
			async resetQuota(authIndex) {
				await this.call("reset-quota", { authIndex });
				await this.refresh();
			}
			selected(sessionId) {
				const state = this.store.getSnapshot();
				return state.selectedBySession[sessionId] ?? state.defaultAccount;
			}
			async selectSpeed(sessionId, model, speed) {
				const value = await this.call("select-speed", {
					sessionId,
					model,
					speed
				});
				const preferences = {
					...this.store.getSnapshot().speedBySessionModel,
					[speedKey(sessionId, model)]: value.selectedSpeed
				};
				this.store.update((state) => {
					state.speedBySessionModel = preferences;
				});
				persistSpeedPreferences(preferences);
			}
			speed(sessionId, model) {
				return this.store.getSnapshot().speedBySessionModel[speedKey(sessionId, model)] ?? "standard";
			}
			inputCapability(provider, model) {
				return this.store.getSnapshot().inputCapabilities[modelKey(provider, model)];
			}
			async restorePersistedSpeeds(capabilities) {
				const persisted = this.store.getSnapshot().speedBySessionModel;
				const fastPreferences = Object.entries(persisted).filter(([, speed]) => speed === "fast");
				if (fastPreferences.length === 0) return;
				const restored = await Promise.all(fastPreferences.map(async ([key]) => {
					const parsed = parseSpeedKey(key);
					if (parsed === void 0) return [key, "standard"];
					if (!hasFastSpeedCapability(parsed.model, capabilities)) return [key, "standard"];
					try {
						return [key, (await this.call("select-speed", {
							sessionId: parsed.sessionId,
							model: parsed.model,
							speed: "fast"
						})).selectedSpeed];
					} catch {
						return [key, "fast"];
					}
				}));
				const next = { ...this.store.getSnapshot().speedBySessionModel };
				let changed = false;
				for (const [key, speed] of restored) if (next[key] !== speed) {
					next[key] = speed;
					changed = true;
				}
				if (!changed) return;
				this.store.update((state) => {
					state.speedBySessionModel = next;
				});
				persistSpeedPreferences(next);
			}
			async call(endpoint, payload) {
				const result = await this.rpc.call("/cpa", endpoint, payload);
				if (!result.ok) throw new Error(`${result.error.code}: ${result.error.message}`);
				return result.value;
			}
			hydrateQuotaSnapshot(endpoint) {
				const snapshot = readQuotaSnapshot(endpoint);
				if (snapshot === void 0) return;
				const current = this.store.getSnapshot();
				const accounts = mergeAccountSnapshots(snapshot.accounts, current.accounts);
				this.store.update((state) => {
					state.accounts = accounts;
					if (state.fetchedAt === void 0 && snapshot.fetchedAt !== void 0) state.fetchedAt = snapshot.fetchedAt;
					if (state.quotaFetchedAt === void 0 && snapshot.fetchedAt !== void 0) state.quotaFetchedAt = snapshot.fetchedAt;
				});
				this.reconcileSelectedAccounts(accounts);
			}
			reconcileSelectedAccounts(accounts) {
				const known = new Set(accounts.map((account) => account.authIndex));
				const state = this.store.getSnapshot();
				const current = state.selectedBySession;
				const next = { ...current };
				let changed = false;
				for (const [sessionId, authIndex] of Object.entries(current)) if (authIndex !== void 0 && !known.has(authIndex)) {
					delete next[sessionId];
					changed = true;
				}
				const defaultAccount = state.defaultAccount !== void 0 && known.has(state.defaultAccount) ? state.defaultAccount : void 0;
				const defaultChanged = defaultAccount !== state.defaultAccount;
				if (!changed && !defaultChanged) return;
				this.store.update((nextState) => {
					if (changed) nextState.selectedBySession = next;
					if (defaultChanged) nextState.defaultAccount = defaultAccount;
				});
				if (changed) persistAccountPreferences(next);
				if (defaultChanged) persistDefaultAccountPreference(defaultAccount);
			}
			persistQuotaSnapshot(accounts, fetchedAt) {
				const endpoint = this.store.getSnapshot().endpoint.trim().replace(/\/+$/, "");
				if (endpoint === "") return;
				const keys = quotaCacheKeys(endpoint);
				const key = keys.find((key) => {
					try {
						return globalThis.localStorage?.getItem(key) !== null;
					} catch {
						return false;
					}
				}) ?? keys[keys.length - 1];
				try {
					const previous = JSON.parse(globalThis.localStorage?.getItem(key) || "{}");
					delete previous.refreshIntervalMs;
					globalThis.localStorage?.setItem(key, JSON.stringify({
						...previous,
						accounts,
						fetchedAt
					}));
				} catch {}
			}
		};
		function hasFastSpeedCapability(model, capabilities) {
			return capabilities.some((entry) => entry.id === model && entry.serviceTiers.some((tier) => tier.id === "priority"));
		}
		function speedKey(sessionId, model) {
			return `${sessionId}\u0000${model}`;
		}
		function modelKey(provider, model) {
			return `${provider}\u0000${model}`;
		}
		function parseSpeedKey(value) {
			const separator = value.indexOf("\0");
			if (separator <= 0 || separator === value.length - 1) return void 0;
			return {
				sessionId: value.slice(0, separator),
				model: value.slice(separator + 1)
			};
		}
		function readSpeedPreferences() {
			try {
				const value = JSON.parse(globalThis.localStorage?.getItem(SPEED_PREFERENCES_KEY) ?? "{}");
				if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
				const result = {};
				for (const [key, speed] of Object.entries(value)) if (speed === "standard" || speed === "fast") result[key] = speed;
				return result;
			} catch {
				return {};
			}
		}
		function readAccountPreferences() {
			try {
				const value = JSON.parse(globalThis.localStorage?.getItem(ACCOUNT_PREFERENCES_KEY) ?? "{}");
				if (value === null || typeof value !== "object" || Array.isArray(value)) return {};
				const result = {};
				for (const [sessionId, authIndex] of Object.entries(value)) if (typeof authIndex === "string" && sessionId.trim() !== "" && authIndex.trim() !== "") result[sessionId] = authIndex;
				return result;
			} catch {
				return {};
			}
		}
		function readDefaultAccountPreference() {
			try {
				const value = globalThis.localStorage?.getItem(ACCOUNT_DEFAULT_KEY)?.trim();
				return value === void 0 || value === "" ? void 0 : value;
			} catch {
				return;
			}
		}
		function persistAccountPreferences(value) {
			try {
				globalThis.localStorage?.setItem(ACCOUNT_PREFERENCES_KEY, JSON.stringify(value));
			} catch {}
		}
		function persistDefaultAccountPreference(value) {
			try {
				if (value === void 0) globalThis.localStorage?.removeItem(ACCOUNT_DEFAULT_KEY);
				else globalThis.localStorage?.setItem(ACCOUNT_DEFAULT_KEY, value);
			} catch {}
		}
		function persistSpeedPreferences(value) {
			try {
				globalThis.localStorage?.setItem(SPEED_PREFERENCES_KEY, JSON.stringify(value));
			} catch {}
		}
		function mergeAccountSnapshots(previous, next) {
			const oldByIndex = new Map(previous.map((account) => [account.authIndex, account]));
			return next.map((account) => {
				const old = oldByIndex.get(account.authIndex);
				if (old === void 0) return account;
				return {
					...account,
					...account.plan === void 0 && old.plan !== void 0 ? { plan: old.plan } : {},
					...account.quota === void 0 && old.quota !== void 0 ? { quota: old.quota } : {}
				};
			});
		}
		function messageOf$1(error) {
			return error instanceof Error ? error.message : String(error);
		}
		function quotaCacheKeys(endpoint) {
			const normalized = endpoint.trim().replace(/\/+$/, "");
			const withoutV1 = normalized.replace(/\/v1$/, "");
			return [.../* @__PURE__ */ new Set([`${QUOTA_CACHE_KEY}:${normalized}`, `${QUOTA_CACHE_KEY}:${withoutV1}/v1`])];
		}
		function readQuotaSnapshot(endpoint) {
			for (const key of quotaCacheKeys(endpoint)) try {
				const value = JSON.parse(globalThis.localStorage?.getItem(key) ?? "null");
				if (value === null || typeof value !== "object" || Array.isArray(value)) continue;
				const snapshot = value;
				if (!Array.isArray(snapshot.accounts)) continue;
				return {
					accounts: snapshot.accounts.filter(isCachedAccount),
					...typeof snapshot.fetchedAt === "string" ? { fetchedAt: snapshot.fetchedAt } : {}
				};
			} catch {}
		}
		function isCachedAccount(value) {
			if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
			const account = value;
			return typeof account.authIndex === "string" && typeof account.name === "string" && typeof account.provider === "string";
		}
		//#endregion
		//#region src/client/cpa-model-select.tsx
		function CpaModelSelect({ locked, available, directory, load, select, cpa, sessionId, session, t }) {
			const state = (0, react.useSyncExternalStore)((listener) => directory.subscribe(listener), () => directory.getSnapshot());
			const cpaState = (0, react.useSyncExternalStore)((listener) => cpa.store.subscribe(listener), () => cpa.store.getSnapshot());
			const [open, setOpen] = (0, react.useState)(false);
			const [pane, setPane] = (0, react.useState)("root");
			const rootRef = (0, react.useRef)(null);
			const triggerRef = (0, react.useRef)(null);
			const directoryActionRef = (0, react.useRef)("load");
			const id = (0, react.useRef)(`dsh-cpa-model-${Math.random().toString(36).slice(2)}`).current;
			const hasImages = (0, react.useSyncExternalStore)((listener) => session?.subscribe(listener) ?? (() => {}), () => session !== void 0 && snapshotHasImages(session.getSnapshot()), () => false);
			const choices = (0, react.useMemo)(() => state.groups.flatMap((group) => group.models.map((model) => ({
				group,
				model,
				selection: selectionForModel(group.id, model, null)
			}))), [state.groups]);
			const displayGroups = (0, react.useMemo)(() => displayModelGroups(state.groups, cpaState.providerId, t), [
				state.groups,
				cpaState.providerId,
				t
			]);
			const currentChoice = state.current === null ? void 0 : choices.find((choice) => choice.selection.provider === state.current?.provider && choice.selection.model === state.current.model);
			const reasoning = currentChoice === void 0 ? void 0 : reasoningForModel(currentChoice.model, currentChoice.selection.provider === cpaState.providerId ? cpaState.providerId : void 0);
			const effectiveEffort = state.current?.reasoningEffort ?? reasoning?.defaultEffort;
			const effortLabel = reasoning === void 0 ? void 0 : effectiveEffort === void 0 ? t("effort.providerDefault") : reasoning.efforts.find((level) => level.id === effectiveEffort)?.name ?? effectiveEffort;
			const effortChoices = (0, react.useMemo)(() => reasoning === void 0 ? [] : [...reasoning.defaultEffort === void 0 ? [{
				key: "provider-default",
				effort: void 0,
				label: t("effort.providerDefault")
			}] : [], ...reasoning.efforts.map((effort) => ({
				key: `effort:${effort.id}`,
				effort: effort.id,
				label: effort.name,
				...effort.description === void 0 ? {} : { description: effort.description }
			}))], [reasoning, t]);
			const isCpa = state.current?.provider === cpaState.providerId;
			const speedAvailable = isCpa && currentChoice !== void 0 && hasFastSpeedCapability(currentChoice.model.id, cpaState.modelCapabilities);
			const selectedSpeed = isCpa && state.current !== null ? cpa.speed(sessionId, state.current.model) : "standard";
			const speedLabel = speedAvailable ? selectedSpeed === "fast" ? t("speed.fast") : t("speed.standard") : void 0;
			const busy = state.status === "selecting";
			(0, react.useEffect)(() => {
				if (!available) return;
				directoryActionRef.current = "load";
				load();
				cpa.loadModelCapabilities().catch(() => {});
				cpa.loadInputCapabilities().catch(() => {});
			}, [
				available,
				cpa,
				load,
				sessionId
			]);
			(0, react.useEffect)(() => {
				if (!open) return;
				const closeOutside = (event) => {
					if (!rootRef.current?.contains(event.target)) setOpen(false);
				};
				document.addEventListener("mousedown", closeOutside);
				return () => {
					document.removeEventListener("mousedown", closeOutside);
				};
			}, [open]);
			if (!available) return null;
			const refresh = () => {
				directoryActionRef.current = "load";
				load();
				cpa.refresh().then(() => {
					cpa.loadModelCapabilities().catch(() => {});
					cpa.loadInputCapabilities().catch(() => {});
				}).catch(() => {});
			};
			const show = () => {
				setPane("root");
				setOpen(true);
				refresh();
			};
			const close = () => {
				setOpen(false);
				setPane("root");
				queueMicrotask(() => {
					triggerRef.current?.focus();
				});
			};
			const choose = (selection) => {
				(async () => {
					const targetModel = state.groups.find((group) => group.id === selection.provider)?.models.find((model) => model.id === selection.model);
					const nextSelection = targetModel === void 0 ? selection : selectionForModel(selection.provider, targetModel, state.current, cpaState.providerId, effectiveEffort);
					const previousSpeed = state.current?.provider === cpaState.providerId && state.current !== null ? cpa.speed(sessionId, state.current.model) : "standard";
					directoryActionRef.current = "select";
					if (!await select(nextSelection)) return;
					if (nextSelection.provider === cpaState.providerId) {
						await ensureDefaultAccountForModel(cpa, sessionId, nextSelection.model);
						if (hasFastSpeedCapability(nextSelection.model, cpa.store.getSnapshot().modelCapabilities)) await cpa.selectSpeed(sessionId, nextSelection.model, previousSpeed === "fast" ? "fast" : "standard");
					}
					close();
				})().catch(() => {});
			};
			const chooseEffort = (effort) => {
				if (state.current === null) return;
				select({
					provider: state.current.provider,
					model: state.current.model,
					...effort === void 0 ? {} : { reasoningEffort: effort }
				}).then((accepted) => {
					if (accepted) close();
				});
			};
			const chooseSpeed = (speed) => {
				if (!speedAvailable || state.current === null) return;
				cpa.selectSpeed(sessionId, state.current.model, speed).then(() => {
					close();
				}).catch(() => {});
			};
			const modelLabel = currentChoice?.model.name ?? t("trigger.fallback");
			const triggerLabel = [
				modelLabel,
				effortLabel,
				speedLabel
			].filter((value) => value !== void 0).join(" · ");
			const triggerAria = currentChoice === void 0 ? t("trigger.selectAria") : effortLabel === void 0 ? t("trigger.aria", { model: modelLabel }) : t("trigger.ariaEffort", {
				model: modelLabel,
				effort: effortLabel
			});
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref: rootRef,
				className: "dsh-cpa-model-root",
				onKeyDown: onKeyDown(setPane, pane, close),
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: triggerRef,
					type: "button",
					className: "dsh-cpa-model-trigger",
					"aria-label": triggerAria,
					"aria-haspopup": "menu",
					"aria-expanded": open,
					"aria-controls": open ? `${id}-menu` : void 0,
					title: triggerLabel,
					disabled: locked,
					onClick: () => {
						open ? close() : show();
					},
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-cpa-model-trigger-label",
							children: modelLabel
						}),
						effortLabel !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-cpa-model-trigger-effort",
							children: effortLabel
						}) : null,
						speedLabel !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-cpa-model-trigger-speed",
							children: speedLabel
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronDownOutline14, { className: `dsh-cpa-chevron${open ? " is-open" : ""}` })
					]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					id: `${id}-menu`,
					className: "dsh-cpa-model-menu",
					role: "menu",
					"aria-label": t("menu.aria"),
					"aria-busy": busy,
					children: [
						pane === "root" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuRow, {
								label: t("menu.model"),
								value: modelLabel,
								onClick: () => {
									setPane("model");
								}
							}),
							reasoning !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuRow, {
								label: t("menu.effort"),
								value: effortLabel ?? t("effort.providerDefault"),
								onClick: () => {
									setPane("effort");
								}
							}) : null,
							speedAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(MenuRow, {
								label: t("menu.speed"),
								value: speedLabel ?? t("speed.standard"),
								onClick: () => {
									setPane("speed");
								}
							}) : null
						] }) : null,
						pane === "model" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-cpa-model-groups scrollable",
							children: [
								state.status === "loading" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dsh-cpa-status",
									children: t("status.loading")
								}) : null,
								state.error !== null && directoryActionRef.current === "load" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-cpa-error",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("error.action", { message: state.error }) }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										onClick: refresh,
										children: t("retry")
									})]
								}) : null,
								displayGroups.map((group) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
									className: "dsh-cpa-model-group",
									role: "group",
									"aria-label": group.name,
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
										className: "dsh-cpa-group-title",
										children: group.name
									}), group.models.map((model) => {
										const selected = state.current?.provider === group.providerId && state.current.model === model.id;
										const input = cpa.inputCapability(group.providerId, model.id);
										const imageUnsupported = hasImages && cpaState.inputCapabilitiesStatus === "ready" && input !== void 0 && !input.includes("image");
										return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											className: `dsh-cpa-option${selected ? " is-selected" : ""}`,
											disabled: busy || imageUnsupported,
											title: imageUnsupported ? t("model.imageUnsupported") : void 0,
											onClick: () => {
												choose({
													provider: group.providerId,
													model: model.id
												});
											},
											children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
												className: "dsh-cpa-option-copy",
												children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "dsh-cpa-model-name",
													children: model.name
												}), model.description !== void 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
													className: "dsh-cpa-description",
													children: model.description
												}) : null]
											}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
												className: "dsh-cpa-check",
												"aria-hidden": "true",
												children: selected ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconCheckOutline16, {}) : null
											})]
										}, `${group.id}/${model.id}`);
									})]
								}, `${group.providerId}/${group.id}`)),
								state.status === "ready" && choices.length === 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
									className: "dsh-cpa-status",
									children: t("status.empty")
								}) : null
							]
						}) : null,
						pane === "effort" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "dsh-cpa-model-list",
							children: effortChoices.map((choice) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dsh-cpa-option",
								disabled: busy,
								onClick: () => {
									chooseEffort(choice.effort);
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: choice.label }), choice.description ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: choice.description }) : null] }), effectiveEffort === choice.effort ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									children: "✓"
								}) : null]
							}, choice.key))
						}) : null,
						pane === "speed" && speedAvailable ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-cpa-model-list",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dsh-cpa-option",
								disabled: busy,
								onClick: () => {
									chooseSpeed("standard");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("speed.standard") }), selectedSpeed === "standard" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									children: "✓"
								}) : null]
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "dsh-cpa-option",
								disabled: busy,
								onClick: () => {
									chooseSpeed("fast");
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("speed.fast") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("speed.fastDescription") })] }), selectedSpeed === "fast" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									"aria-hidden": "true",
									children: "✓"
								}) : null]
							})]
						}) : null
					]
				}) : null]
			});
		}
		function MenuRow(props) {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
				type: "button",
				className: "dsh-cpa-menu-row",
				role: "menuitem",
				onClick: props.onClick,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-cpa-menu-label",
						children: props.label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-cpa-menu-value",
						children: props.value
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.IconChevronRightOutline14, { className: "dsh-cpa-menu-chevron" })
				]
			});
		}
		function onKeyDown(setPane, pane, close) {
			return (event) => {
				if (event.key !== "Escape") return;
				event.preventDefault();
				if (pane !== "root") setPane("root");
				else close();
			};
		}
		function snapshotHasImages(snapshot) {
			return snapshot.nodes.some((node) => hasImageContent(node.content)) || snapshot.queue.some((item) => hasImageContent(item.content));
		}
		function hasImageContent(value) {
			return Array.isArray(value) && value.some((block) => typeof block === "object" && block !== null && block.type === "image");
		}
		function displayModelGroups(groups, cpaProviderId, t) {
			return groups.flatMap((group) => {
				if (group.id !== cpaProviderId) return [{
					...group,
					providerId: group.id
				}];
				const buckets = /* @__PURE__ */ new Map();
				for (const model of group.models) {
					const family = familyOf(model);
					const bucket = buckets.get(family);
					if (bucket === void 0) buckets.set(family, [model]);
					else bucket.push(model);
				}
				return CPA_MODEL_FAMILY_ORDER.flatMap((family) => {
					const models = buckets.get(family);
					if (models === void 0 || models.length === 0) return [];
					return [{
						id: `${group.id}:${family}`,
						providerId: group.id,
						name: familyLabel(family, t),
						models
					}];
				});
			});
		}
		const CPA_MODEL_FAMILY_ORDER = [
			"gpt",
			"claude",
			"gemini",
			"deepseek",
			"other"
		];
		function familyOf(model) {
			const value = `${model.id} ${model.name}`.toLowerCase();
			if (/(gpt|codex|chatgpt|(?:^|[-_])o[134](?:$|[-_]))/.test(value)) return "gpt";
			if (value.includes("claude")) return "claude";
			if (value.includes("gemini")) return "gemini";
			if (value.includes("deepseek")) return "deepseek";
			return "other";
		}
		function familyLabel(family, t) {
			switch (family) {
				case "gpt": return t("model.familyGpt");
				case "claude": return t("model.familyClaude");
				case "gemini": return t("model.familyGemini");
				case "deepseek": return t("model.familyDeepSeek");
				default: return t("model.familyOther");
			}
		}
		async function ensureDefaultAccountForModel(cpa, sessionId, modelId) {
			const accounts = await cpa.loadAccounts();
			const selected = cpa.selected(sessionId);
			const current = accounts.find((account) => account.authIndex === selected);
			const available = accounts.filter((account) => accountAvailability(account) === "available");
			if (available.length === 0) return;
			const ordered = current !== void 0 && accountAvailability(current) === "available" ? [current, ...available.filter((account) => account.authIndex !== current.authIndex)] : available;
			const matching = (await Promise.all(ordered.map(async (account) => {
				try {
					return modelListContains(await cpa.loadAccountModels(account), modelId) ? account : void 0;
				} catch {
					return;
				}
			}))).find((account) => account !== void 0);
			const currentAvailable = current !== void 0 && accountAvailability(current) === "available" ? current : void 0;
			const fallback = matching ?? currentAvailable ?? available[0];
			if (fallback !== void 0 && fallback.authIndex !== selected) await cpa.selectAccount(sessionId, fallback.authIndex, { persistDefault: false });
		}
		function modelListContains(models, modelId) {
			const wanted = normalizeModelId(modelId);
			return wanted !== "" && models.some((model) => normalizeModelId(model) === wanted);
		}
		function normalizeModelId(value) {
			return value.trim().toLowerCase();
		}
		function selectionForModel(provider, model, current, cpaProviderId, currentEffectiveEffort) {
			const currentEffort = current?.provider === provider ? current.reasoningEffort ?? currentEffectiveEffort : void 0;
			const reasoningEffort = currentEffort !== void 0 && supportsReasoningEffort(provider, model, currentEffort, cpaProviderId) ? currentEffort : model.reasoning?.defaultEffort;
			return {
				provider,
				model: model.id,
				...reasoningEffort === void 0 ? {} : { reasoningEffort }
			};
		}
		function reasoningForModel(model, cpaProviderId) {
			const base = model.reasoning;
			if (cpaProviderId === void 0 || !isKnownCpaReasoningModel(model.id)) return base;
			const known = knownCpaReasoningEfforts(model.id);
			const efforts = base?.efforts === void 0 ? [] : [...base.efforts];
			for (const id of known) if (!efforts.some((effort) => effort.id === id)) efforts.push({
				id,
				name: id === "max" ? "Max" : id[0].toUpperCase() + id.slice(1)
			});
			return {
				...base,
				efforts
			};
		}
		function supportsReasoningEffort(provider, model, effort, cpaProviderId) {
			if (model.reasoning?.efforts.some((level) => level.id === effort)) return true;
			return provider === cpaProviderId && knownCpaReasoningEfforts(model.id).includes(effort);
		}
		function knownCpaReasoningEfforts(modelId) {
			if (isGpt56Model$1(modelId)) return [
				"low",
				"medium",
				"high",
				"max"
			];
			if (/^gemini-3\.(?:6|7)-flash-high$/i.test(modelId.trim())) return [
				"low",
				"medium",
				"high"
			];
			return [];
		}
		function isKnownCpaReasoningModel(modelId) {
			return knownCpaReasoningEfforts(modelId).length > 0;
		}
		function isGpt56Model$1(modelId) {
			return /^gpt-5\.6(?:-|$)/i.test(modelId.trim());
		}
		//#endregion
		//#region src/client/cpa-model-settings.tsx
		const SETTINGS_NS = "llm-pi-ai";
		const DISCOVERY_NS = "llm-cliproxyapi";
		const DEFAULT_KEY_REF = "CPA_MODEL_API_KEY";
		const DEFAULT_CPA_MODEL_API = "openai-responses";
		const DEFAULT_CPA_REASONING_EFFORTS = {
			off: null,
			low: "low",
			medium: "medium",
			high: "high"
		};
		const GPT56_REASONING_EFFORTS = {
			...DEFAULT_CPA_REASONING_EFFORTS,
			max: "max"
		};
		/** Page-owned configuration for the CPA model route. */
		var CpaModelSettingsController = class {
			api;
			cpa;
			store;
			namespace;
			revision = 0;
			writable = false;
			loading = true;
			discovering = false;
			saving = false;
			configured = false;
			keyConfigured = false;
			keyWritable = true;
			migrating = false;
			error = null;
			discoveryError = null;
			draft = {
				providerId: "cpa",
				api: DEFAULT_CPA_MODEL_API,
				baseURL: "",
				apiKeyEnv: DEFAULT_KEY_REF,
				keyDraft: "",
				models: []
			};
			baseline = cloneDraft(this.draft);
			constructor(api, cpa) {
				this.api = api;
				this.cpa = cpa;
				this.store = (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(this.projection());
				cpa.store.subscribe(() => {
					if (!this.isDirty()) this.load();
					else this.publish();
				});
				this.load();
			}
			inject() {
				return {
					hooks: { cpaModelSettings: this.store },
					editKey: (value) => {
						this.draft.keyDraft = value;
						this.error = null;
						this.publish();
					},
					editBaseURL: (value) => {
						this.draft.baseURL = value;
						this.error = null;
						this.discoveryError = null;
						this.publish();
					},
					editModel: (index, field, value) => {
						const model = this.draft.models[index];
						if (model === void 0) return;
						this.draft.models[index] = {
							...model,
							[field]: value
						};
						this.error = null;
						this.publish();
					},
					addModel: () => {
						this.draft.models.push({
							id: "",
							name: "",
							reasoningEfforts: cloneReasoningEfforts(DEFAULT_CPA_REASONING_EFFORTS)
						});
						this.error = null;
						this.publish();
					},
					removeModel: (index) => {
						this.draft.models.splice(index, 1);
						this.error = null;
						this.publish();
					},
					discover: () => {
						this.discover();
					},
					save: () => {
						this.save();
					},
					discard: () => {
						this.discard();
					}
				};
			}
			/** Reload the redacted settings after the native Models page changes them. */
			reload() {
				if (this.migrating || this.saving || this.isDirty()) {
					this.publish();
					return;
				}
				this.load();
			}
			async load() {
				if (this.loading && this.namespace !== void 0) return;
				this.loading = true;
				this.error = null;
				this.publish();
				try {
					const response = await this.api.settings.describe({});
					if (!response.result.ok) throw new Error(response.result.error.message);
					this.writable = response.result.value.writable;
					this.namespace = response.result.value.namespaces.find((entry) => entry.ns === SETTINGS_NS);
					const providerId = this.cpa.store.getSnapshot().providerId.trim() || "cpa";
					const profile = profileAt(this.namespace, providerId);
					this.revision = this.namespace?.revision ?? 0;
					this.configured = profile !== void 0;
					this.draft = {
						providerId,
						api: stringValue(profile?.api) ?? DEFAULT_CPA_MODEL_API,
						baseURL: stringValue(profile?.baseURL) ?? modelBaseURL(this.cpa.store.getSnapshot().endpoint),
						apiKeyEnv: stringValue(profile?.apiKeyEnv) ?? DEFAULT_KEY_REF,
						keyDraft: "",
						models: modelsOf(profile?.models)
					};
					this.baseline = cloneDraft(this.draft);
					await this.readCredential();
					await this.ensureReasoningConfiguration(profile);
				} catch (cause) {
					this.error = messageOf(cause);
				} finally {
					this.loading = false;
					this.publish();
				}
			}
			/**
			* Older plugin versions wrote only model ids. Migrate those profiles once so
			* the Host model catalog can expose the existing effort picker without
			* requiring the user to edit every model and press Save again.
			*/
			async ensureReasoningConfiguration(profile) {
				if (!this.writable || this.namespace === void 0 || this.migrating || profile === void 0) return;
				const configuredApi = stringValue(profile?.api);
				const compat = valueObject(profile?.compat);
				const migrateLegacyCompletions = isCompletionsApi(configuredApi ?? "") && isLegacyCpaCompat(compat);
				const api = migrateLegacyCompletions ? DEFAULT_CPA_MODEL_API : configuredApi ?? DEFAULT_CPA_MODEL_API;
				const rawModels = modelProfilesWithDefaultReasoning(profile.models, api);
				const ops = [];
				if (configuredApi === void 0 || migrateLegacyCompletions) ops.push({
					op: "set",
					path: [
						"providers",
						this.draft.providerId,
						"api"
					],
					value: DEFAULT_CPA_MODEL_API
				});
				if (rawModels.changed) ops.push({
					op: "set",
					path: [
						"providers",
						this.draft.providerId,
						"models"
					],
					value: rawModels.models
				});
				if ((!isCompletionsApi(api) || migrateLegacyCompletions) && hasCompletionCompat(compat)) ops.push({
					op: "unset",
					path: [
						"providers",
						this.draft.providerId,
						"compat"
					]
				});
				if (ops.length === 0) return;
				this.migrating = true;
				try {
					const response = await this.api.settings.mutate({
						ns: SETTINGS_NS,
						expectedRevision: this.revision,
						ops
					});
					if (!response.result.ok) throw new Error(response.result.error.message);
					this.namespace = response.result.value;
					this.revision = response.result.value.revision;
					this.configured = true;
				} finally {
					this.migrating = false;
				}
			}
			async readCredential() {
				try {
					const response = await this.api.credentials.describe({ refs: [this.draft.apiKeyEnv] });
					if (!response.result.ok) return;
					const view = response.result.value.credentials[this.draft.apiKeyEnv];
					this.keyConfigured = view?.configured ?? false;
					this.keyWritable = view?.writable ?? true;
				} catch {}
			}
			async discover() {
				if (this.discovering) return;
				const baseURL = this.draft.baseURL.trim();
				if (baseURL === "") {
					this.discoveryError = "CLIProXyAPI model endpoint is empty";
					this.publish();
					return;
				}
				if (!this.draft.keyDraft.trim() && !this.keyConfigured && !this.configured) {
					this.discoveryError = "Enter the CLIProXyAPI model key before fetching models";
					this.publish();
					return;
				}
				this.discovering = true;
				this.discoveryError = null;
				this.publish();
				try {
					const response = await this.api.llm.discoverModels({
						settingsNs: DISCOVERY_NS,
						provider: this.draft.providerId,
						baseURL,
						api: this.draft.api,
						...this.draft.keyDraft.trim() === "" ? {} : { apiKey: this.draft.keyDraft.trim() }
					});
					if (!response.result.ok) throw new Error(response.result.error.message);
					const found = response.result.value.models;
					if (found.length === 0) throw new Error("CLIProXyAPI returned no models");
					this.draft.models = mergeModels(this.draft.models, found);
				} catch (cause) {
					this.discoveryError = messageOf(cause);
				} finally {
					this.discovering = false;
					this.publish();
				}
			}
			async save() {
				if (this.saving || !this.isDirty()) return;
				const models = normalizeModels(this.draft.models);
				if ("error" in models) {
					this.error = models.error;
					this.publish();
					return;
				}
				if (this.draft.providerId.trim() === "") {
					this.error = "CLIProXyAPI provider id is empty";
					this.publish();
					return;
				}
				if (this.draft.baseURL.trim() === "") {
					this.error = "CLIProXyAPI model endpoint is empty";
					this.publish();
					return;
				}
				if (!this.draft.keyDraft.trim() && !this.keyConfigured) {
					this.error = "Enter the CLIProXyAPI model key before saving";
					this.publish();
					return;
				}
				this.saving = true;
				this.error = null;
				this.publish();
				try {
					if (this.draft.keyDraft.trim() !== "") {
						const key = await this.api.credentials.set({
							ref: this.draft.apiKeyEnv,
							value: this.draft.keyDraft.trim()
						});
						if (!key.result.ok) throw new Error(key.result.error.message);
					}
					const ops = [
						{
							op: "set",
							path: [
								"providers",
								this.draft.providerId,
								"api"
							],
							value: this.draft.api
						},
						{
							op: "set",
							path: [
								"providers",
								this.draft.providerId,
								"baseURL"
							],
							value: this.draft.baseURL.trim()
						},
						{
							op: "set",
							path: [
								"providers",
								this.draft.providerId,
								"apiKeyEnv"
							],
							value: this.draft.apiKeyEnv
						}
					];
					if (!isCompletionsApi(this.draft.api)) ops.push({
						op: "unset",
						path: [
							"providers",
							this.draft.providerId,
							"compat"
						]
					});
					ops.push({
						op: "set",
						path: [
							"providers",
							this.draft.providerId,
							"models"
						],
						value: models.value
					});
					const response = await this.api.settings.mutate({
						ns: SETTINGS_NS,
						expectedRevision: this.revision,
						ops
					});
					if (!response.result.ok) throw new Error(response.result.error.message);
					this.namespace = response.result.value;
					this.revision = response.result.value.revision;
					this.configured = true;
					this.draft.keyDraft = "";
					this.draft.providerId = this.draft.providerId.trim();
					this.draft.baseURL = this.draft.baseURL.trim();
					this.draft.models = models.value.map((model) => ({
						id: model.id,
						name: model.name ?? "",
						...positiveInteger(model.contextWindow) === void 0 ? {} : { contextWindow: positiveInteger(model.contextWindow) },
						...positiveInteger(model.maxTokens) === void 0 ? {} : { maxTokens: positiveInteger(model.maxTokens) },
						reasoningEfforts: cloneReasoningEfforts(model.reasoningEfforts)
					}));
					this.baseline = cloneDraft(this.draft, models.value);
					await this.readCredential();
				} catch (cause) {
					this.error = messageOf(cause);
				} finally {
					this.saving = false;
					this.publish();
				}
			}
			async discard() {
				await this.load();
			}
			isDirty() {
				return !sameDraft(this.draft, this.baseline);
			}
			projection() {
				return {
					available: this.namespace !== void 0 || this.loading,
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
					discoveryError: this.discoveryError
				};
			}
			publish() {
				this.store.set(this.projection());
			}
		};
		function CpaModelSettingsModule(props) {
			const state = (0, react.useSyncExternalStore)((listener) => props.hooks.cpaModelSettings.subscribe(listener), () => props.hooks.cpaModelSettings.getSnapshot(), () => props.hooks.cpaModelSettings.getSnapshot());
			const [open, setOpen] = (0, react.useState)(!state.configured);
			if (!state.available) return null;
			const disabled = !state.writable || state.loading || state.saving;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("section", {
				className: "dsh-cpa-model-settings",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "dsh-cpa-model-settings-header",
					"aria-expanded": open,
					onClick: () => {
						setOpen((value) => !value);
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.t("modelSettings.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.t(state.configured ? "modelSettings.description" : "modelSettings.unconfigured") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						children: "⌄"
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-cpa-model-settings-body",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-cpa-settings-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: "dsh-cpa-model-key",
									children: props.t("modelSettings.key")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsh-cpa-model-key",
									type: "password",
									autoComplete: "off",
									value: state.keyDraft,
									disabled: disabled || !state.keyWritable,
									onChange: (event) => {
										props.editKey(event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: props.t("modelSettings.keyHint") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: state.keyConfigured ? "dsh-cpa-key-state is-set" : "dsh-cpa-key-state",
									children: state.keyConfigured ? props.t("settings.keySet") : props.t("settings.keyUnset")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-cpa-model-settings-list-head",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: props.t("modelSettings.models") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: disabled || state.discovering,
								onClick: props.discover,
								children: state.discovering ? props.t("modelSettings.fetching") : props.t("modelSettings.fetch")
							})]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-cpa-settings-note",
							children: props.t("modelSettings.modelsHint")
						}),
						state.discoveryError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-cpa-settings-error",
							children: state.discoveryError
						}) : null,
						state.models.map((model, index) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-cpa-model-draft",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "text",
									value: model.id,
									placeholder: props.t("modelSettings.id"),
									disabled,
									"aria-label": props.t("modelSettings.id"),
									onChange: (event) => {
										props.editModel(index, "id", event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									type: "text",
									value: model.name,
									placeholder: props.t("modelSettings.name"),
									disabled,
									"aria-label": props.t("modelSettings.name"),
									onChange: (event) => {
										props.editModel(index, "name", event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									disabled,
									"aria-label": props.t("modelSettings.remove"),
									onClick: () => {
										props.removeModel(index);
									},
									children: "×"
								})
							]
						}, `model-${index}`)),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "dsh-cpa-model-add",
							disabled,
							onClick: props.addModel,
							children: ["＋ ", props.t("modelSettings.add")]
						}),
						state.error ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-cpa-settings-error",
							children: state.error
						}) : null
					]
				}) : null]
			});
		}
		function profileAt(namespace, providerId) {
			const providers = namespace?.value;
			if (typeof providers !== "object" || providers === null) return void 0;
			const profile = providers.providers;
			if (typeof profile !== "object" || profile === null) return void 0;
			const value = profile[providerId];
			return typeof value === "object" && value !== null ? value : void 0;
		}
		function modelsOf(value) {
			if (!Array.isArray(value)) return [];
			return value.flatMap((entry) => {
				if (typeof entry !== "object" || entry === null) return [];
				const raw = entry;
				const id = stringValue(raw.id);
				if (id === void 0) return [];
				const reasoningEfforts = reasoningEffortsForModel(id, reasoningEffortsOf(raw.reasoningEfforts));
				return [{
					id,
					name: stringValue(raw.name) ?? "",
					...positiveInteger(raw.contextWindow) === void 0 ? {} : { contextWindow: positiveInteger(raw.contextWindow) },
					...positiveInteger(raw.maxTokens) === void 0 ? {} : { maxTokens: positiveInteger(raw.maxTokens) },
					reasoningEfforts: cloneReasoningEfforts(reasoningEfforts)
				}];
			});
		}
		function mergeModels(current, found) {
			const existing = new Map(current.filter((model) => model.id.trim() !== "").map((model) => [model.id.trim(), model]));
			for (const model of found) if (!existing.has(model.id)) existing.set(model.id, {
				id: model.id,
				name: model.name ?? "",
				...model.contextWindow === void 0 ? {} : { contextWindow: model.contextWindow },
				...model.maxTokens === void 0 ? {} : { maxTokens: model.maxTokens },
				reasoningEfforts: cloneReasoningEfforts(reasoningEffortsForModel(model.id))
			});
			return [...existing.values()];
		}
		function normalizeModels(models) {
			const seen = /* @__PURE__ */ new Set();
			const value = [];
			for (const model of models) {
				const id = model.id.trim();
				if (id === "") return { error: "Model id cannot be empty" };
				if (seen.has(id)) return { error: `Duplicate model id: ${id}` };
				seen.add(id);
				const name = model.name.trim();
				const reasoningEfforts = reasoningEffortsForModel(id, model.reasoningEfforts);
				value.push({
					...name === "" ? { id } : {
						id,
						name
					},
					...positiveInteger(model.contextWindow) === void 0 ? {} : { contextWindow: positiveInteger(model.contextWindow) },
					...positiveInteger(model.maxTokens) === void 0 ? {} : { maxTokens: positiveInteger(model.maxTokens) },
					reasoningEfforts: cloneReasoningEfforts(reasoningEfforts)
				});
			}
			if (value.length === 0) return { error: "Add at least one CLIProXyAPI model" };
			return { value };
		}
		function cloneDraft(draft, models = draft.models) {
			return {
				...draft,
				keyDraft: "",
				models: models.map((model) => ({
					id: model.id,
					name: model.name ?? "",
					...positiveInteger(model.contextWindow) === void 0 ? {} : { contextWindow: positiveInteger(model.contextWindow) },
					...positiveInteger(model.maxTokens) === void 0 ? {} : { maxTokens: positiveInteger(model.maxTokens) },
					reasoningEfforts: cloneReasoningEfforts(reasoningEffortsForModel(model.id, model.reasoningEfforts))
				}))
			};
		}
		function sameDraft(left, right) {
			return left.providerId === right.providerId && left.api === right.api && left.baseURL === right.baseURL && left.apiKeyEnv === right.apiKeyEnv && left.keyDraft === right.keyDraft && JSON.stringify(left.models) === JSON.stringify(right.models);
		}
		function modelBaseURL(endpoint) {
			const value = endpoint.trim().replace(/\/+$/, "");
			if (value === "") return "";
			return value.endsWith("/v1") ? value : `${value}/v1`;
		}
		function modelProfilesWithDefaultReasoning(value, api) {
			if (!Array.isArray(value)) return {
				models: [],
				changed: false
			};
			let changed = false;
			return {
				models: value.flatMap((entry) => {
					if (typeof entry !== "object" || entry === null) return [];
					const raw = entry;
					const id = stringValue(raw.id);
					if (id === void 0) return [];
					const cleaned = isCompletionsApi(api) ? raw : withoutCompletionCompat(raw);
					if (cleaned !== raw) changed = true;
					const configured = reasoningEffortsOf(cleaned.reasoningEfforts);
					const reasoningEfforts = reasoningEffortsForModel(id, configured);
					const hasReasoning = Object.prototype.hasOwnProperty.call(cleaned, "reasoningEfforts");
					const needsGpt56Max = isGpt56Model(id) && configured !== false && configured?.max !== "max";
					if (hasReasoning && !needsGpt56Max && configured !== void 0) return [cleaned];
					changed = true;
					return [{
						...cleaned,
						reasoningEfforts: cloneReasoningEfforts(reasoningEfforts)
					}];
				}),
				changed
			};
		}
		function withoutCompletionCompat(model) {
			const compat = valueObject(model.compat);
			if (compat === void 0 || !hasCompletionCompat(compat)) return model;
			const rest = Object.fromEntries(Object.entries(compat).filter(([key]) => key !== "thinkingFormat" && key !== "supportsReasoningEffort"));
			const next = { ...model };
			if (Object.keys(rest).length === 0) delete next.compat;
			else next.compat = rest;
			return next;
		}
		function reasoningEffortsOf(value) {
			if (value === false) return false;
			if (typeof value !== "object" || value === null || Array.isArray(value)) return void 0;
			const result = {};
			for (const [key, entry] of Object.entries(value)) if (entry === null || typeof entry === "string") result[key] = entry;
			return result;
		}
		function cloneReasoningEfforts(value) {
			return value === false ? false : { ...value };
		}
		function reasoningEffortsForModel(id, configured) {
			if (configured === false) return false;
			const base = configured ?? (isGpt56Model(id) ? GPT56_REASONING_EFFORTS : DEFAULT_CPA_REASONING_EFFORTS);
			return isGpt56Model(id) ? {
				...base,
				max: "max"
			} : base;
		}
		function isGpt56Model(id) {
			return /^gpt-5\.6(?:-|$)/i.test(id.trim());
		}
		function valueObject(value) {
			return typeof value === "object" && value !== null && !Array.isArray(value) ? value : void 0;
		}
		function hasCompletionCompat(value) {
			return value?.["thinkingFormat"] !== void 0 || value?.["supportsReasoningEffort"] !== void 0;
		}
		/** Compat written by pre-Responses versions of this plugin. */
		function isLegacyCpaCompat(value) {
			if (value?.["thinkingFormat"] !== "openai" || value?.["supportsReasoningEffort"] !== true) return false;
			return Object.keys(value).every((key) => key === "thinkingFormat" || key === "supportsReasoningEffort");
		}
		function isCompletionsApi(value) {
			return value.trim().toLowerCase() === "openai-completions";
		}
		function stringValue(value) {
			return typeof value === "string" && value.trim() !== "" ? value.trim() : void 0;
		}
		function positiveInteger(value) {
			return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : void 0;
		}
		function messageOf(error) {
			return error instanceof Error ? error.message : String(error);
		}
		//#endregion
		//#region src/client/cpa-settings-card.tsx
		const REFRESH_INTERVALS = [
			0,
			3e5,
			18e5,
			36e5,
			108e5,
			18e6
		];
		var CpaSettingsCardController = class {
			api;
			cpa;
			model;
			keyDraft = "";
			endpointDraft;
			saving = false;
			failed = false;
			error = null;
			keyConfigured = false;
			keyWritable = true;
			store;
			constructor(api, cpa, model) {
				this.api = api;
				this.cpa = cpa;
				this.model = model;
				this.store = this.makeStore();
				cpa.store.subscribe(() => {
					this.publish();
				});
				model.store.subscribe(() => {
					if (!model.store.getSnapshot().dirty) this.endpointDraft = void 0;
					this.publish();
				});
				this.readCredential();
				cpa.loadConfig().catch(() => {});
			}
			inject() {
				return {
					hooks: { cpaSettings: this.store },
					model: this.model.inject(),
					edit: (field, value) => {
						if (field === "keyDraft") this.keyDraft = value;
						if (field === "endpoint") {
							this.endpointDraft = value;
							this.model.inject().editBaseURL(toModelEndpoint(value));
						}
						this.failed = false;
						this.error = null;
						this.publish();
					},
					save: () => {
						this.save();
					},
					discard: () => {
						this.keyDraft = "";
						this.endpointDraft = void 0;
						this.failed = false;
						this.error = null;
						this.model.discard();
						this.publish();
					},
					refresh: () => {
						this.refresh();
					},
					setRefreshInterval: (value) => {
						this.setRefreshInterval(value);
					}
				};
			}
			makeStore() {
				return (0, _deepseek_ai_dsh_client_runtime_client.createSnapshotStore)(this.projection());
			}
			projection() {
				const cpa = this.cpa.store.getSnapshot();
				const model = this.model.store.getSnapshot();
				return {
					available: true,
					writable: true,
					dirty: this.keyDraft.trim() !== "" || model.dirty,
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
					accountError: cpa.error
				};
			}
			async readCredential() {
				const ref = this.cpa.store.getSnapshot().managementKeyEnv.trim();
				if (!isCredentialRef(ref)) {
					this.keyConfigured = false;
					this.keyWritable = true;
					this.publish();
					return;
				}
				try {
					const response = await this.api.credentials.describe({ refs: [ref] });
					if (!response.result.ok || ref !== this.cpa.store.getSnapshot().managementKeyEnv.trim()) return;
					const view = response.result.value.credentials[ref];
					this.keyConfigured = view?.configured ?? false;
					this.keyWritable = view?.writable ?? true;
					this.publish();
				} catch {}
			}
			async save() {
				const modelDirty = this.model.store.getSnapshot().dirty;
				if (this.saving || this.keyDraft.trim() === "" && !modelDirty) return;
				const ref = this.cpa.store.getSnapshot().managementKeyEnv.trim();
				if (this.keyDraft.trim() !== "" && !isCredentialRef(ref)) {
					this.failed = true;
					this.error = "invalid management key reference";
					this.publish();
					return;
				}
				this.saving = true;
				this.failed = false;
				this.error = null;
				this.publish();
				try {
					if (this.model.store.getSnapshot().dirty) await this.model.save();
					if (this.keyDraft.trim() !== "") {
						const response = await this.api.credentials.set({
							ref,
							value: this.keyDraft.trim()
						});
						if (!response.result.ok) throw new Error(response.result.error.message);
						this.keyDraft = "";
					}
					await this.cpa.refreshConfig().catch(() => {});
					await this.refresh();
				} catch (error) {
					this.failed = true;
					this.error = error instanceof Error ? error.message : String(error);
				} finally {
					this.saving = false;
					this.publish();
				}
			}
			async refresh() {
				await this.cpa.refreshConfig().catch(() => {});
				await this.cpa.refresh().catch(() => {});
				this.publish();
			}
			async setRefreshInterval(value) {
				await this.cpa.setRefreshInterval(value).catch(() => {});
				this.publish();
			}
			publish() {
				this.store.set(this.projection());
			}
		};
		function CpaSettingsCard(props) {
			const state = props.useCpaSettings((snapshot) => snapshot);
			const [open, setOpen] = (0, react.useState)(false);
			const t = props.t;
			if (!state.available) return null;
			const cpaState = state;
			const disabled = !cpaState.writable || cpaState.saving;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("li", {
				className: "dsh-cpa-settings-card",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					type: "button",
					className: "dsh-cpa-settings-header",
					"aria-expanded": open,
					onClick: () => {
						const next = !open;
						setOpen(next);
						if (next) props.refresh();
					},
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("settings.title") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("settings.description") })] }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						"aria-hidden": "true",
						children: "⌄"
					})]
				}), open ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					className: "dsh-cpa-settings-body",
					children: [
						!cpaState.writable ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-cpa-settings-muted",
							children: t("settings.readOnly")
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-cpa-settings-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: "dsh-cpa-management-endpoint",
									children: t("settings.endpoint")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsh-cpa-management-endpoint",
									type: "text",
									autoComplete: "off",
									value: cpaState.endpoint,
									disabled,
									onChange: (event) => {
										props.edit("endpoint", event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("settings.endpointHint") })
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-cpa-settings-field",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
									htmlFor: "dsh-cpa-management-key",
									children: t("settings.key")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("input", {
									id: "dsh-cpa-management-key",
									type: "password",
									autoComplete: "off",
									value: cpaState.keyDraft,
									disabled: disabled || !cpaState.keyWritable,
									onChange: (event) => {
										props.edit("keyDraft", event.target.value);
									}
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: t("settings.keyHint") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: cpaState.keyConfigured ? "dsh-cpa-key-state is-set" : "dsh-cpa-key-state",
									children: cpaState.keyConfigured ? t("settings.keySet") : t("settings.keyUnset")
								})
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-cpa-settings-accounts",
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
									className: "dsh-cpa-settings-accounts-head",
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: t("settings.accounts") }), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										disabled: cpaState.accountStatus === "loading",
										onClick: props.refresh,
										children: cpaState.accountStatus === "loading" ? t("settings.refreshing") : t("settings.refresh")
									}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("select", {
										disabled,
										"aria-label": t("settings.refresh"),
										value: String(cpaState.refreshIntervalMs),
										onChange: (event) => {
											props.setRefreshInterval(Number(event.target.value));
										},
										children: [
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: "0",
												children: t("settings.refreshManual")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: String(REFRESH_INTERVALS[1]),
												children: t("settings.refresh5m")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: String(REFRESH_INTERVALS[2]),
												children: t("settings.refresh30m")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: String(REFRESH_INTERVALS[3]),
												children: t("settings.refresh1h")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: String(REFRESH_INTERVALS[4]),
												children: t("settings.refresh3h")
											}),
											/* @__PURE__ */ (0, react_jsx_runtime.jsx)("option", {
												value: String(REFRESH_INTERVALS[5]),
												children: t("settings.refresh5h")
											})
										]
									})] })]
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
									className: "dsh-cpa-settings-muted",
									children: t("settings.refreshHint")
								}),
								cpaState.accountError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "dsh-cpa-settings-error",
									children: cpaState.accountError
								}) : null,
								cpaState.accounts.length === 0 && !cpaState.accountError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
									className: "dsh-cpa-settings-muted",
									children: t("settings.noAccounts")
								}) : null,
								cpaState.accounts.map((account) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AccountRow, {
									account,
									t
								}, account.authIndex))
							]
						}),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)(CpaModelSettingsModule, {
							...props.model,
							t
						}),
						cpaState.error && !cpaState.accountError ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-cpa-settings-error",
							children: cpaState.error
						}) : null,
						/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
							className: "dsh-cpa-settings-actions",
							children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								disabled: !cpaState.dirty || cpaState.saving,
								onClick: props.discard,
								children: t("settings.discard")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "is-primary",
								disabled: !cpaState.dirty || cpaState.saving,
								onClick: props.save,
								children: cpaState.saving ? t("settings.saving") : t("settings.save")
							})]
						}),
						cpaState.failed ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "dsh-cpa-settings-error",
							children: cpaState.error ?? t("settings.saveFailed")
						}) : null
					]
				}) : null]
			});
		}
		function AccountRow({ account, t }) {
			const availability = accountAvailability(account);
			const status = accountAvailabilityLabel(account, t);
			const quota = accountQuotaProgress(account.quota, t);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "dsh-cpa-account-row",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
					className: "dsh-cpa-account-copy",
					children: [
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", { children: accountLabel(account) }),
						/* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", { children: accountIdentity(account) }),
						quota.length > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-cpa-account-quota",
							children: quota.map((window) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)(QuotaProgress, {
								progress: window,
								availability,
								t
							}, window.key))
						}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
							className: "dsh-cpa-account-quota-empty",
							children: t("account.quotaUnknown")
						})
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: `dsh-cpa-account-status-dot is-${availability}`,
					role: "img",
					"aria-label": status,
					title: status
				})]
			});
		}
		function QuotaProgress({ progress, availability, t }) {
			const value = progress.percent === void 0 ? void 0 : Math.round(progress.percent);
			const reset = progress.resetAt === void 0 ? void 0 : formatQuotaResetAt(progress.resetAt);
			const progressAttributes = value === void 0 ? {} : { "aria-valuenow": value };
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
				className: `dsh-cpa-account-quota-window is-${availability}${value === void 0 ? " is-unknown" : ""}`,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-cpa-account-quota-label",
						children: progress.label
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-cpa-account-quota-track",
						role: "progressbar",
						"aria-label": `${progress.label}${value === void 0 ? "" : ` ${value}%`}`,
						"aria-valuemin": 0,
						"aria-valuemax": 100,
						...progressAttributes,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "dsh-cpa-account-quota-fill",
							style: value === void 0 ? void 0 : { width: `${value}%` }
						})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "dsh-cpa-account-quota-value",
						children: value === void 0 ? t("account.quotaUnknown") : `${value}%`
					}),
					reset === void 0 ? null : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("small", {
						className: "dsh-cpa-account-quota-reset",
						children: t("account.nextReset", { time: reset })
					})
				]
			});
		}
		function managementEndpoint(value) {
			return value.trim().replace(/\/+$/, "").replace(/\/v1$/i, "");
		}
		function toModelEndpoint(value) {
			const normalized = value.trim().replace(/\/+$/, "");
			if (normalized === "") return "";
			return /\/v1$/i.test(normalized) ? normalized : `${normalized}/v1`;
		}
		function isCredentialRef(value) {
			return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value);
		}
		//#endregion
		//#region src/client/locales.ts
		const en = {
			"trigger.fallback": "Select model",
			"trigger.selectAria": "Select model",
			"trigger.aria": "Selected model: {model}",
			"trigger.ariaEffort": "Selected model: {model}, reasoning: {effort}",
			"menu.aria": "Model selection",
			"menu.model": "Model",
			"menu.effort": "Reasoning level",
			"menu.speed": "Speed",
			"model.familyGpt": "GPT",
			"model.familyClaude": "Claude",
			"model.familyGemini": "Gemini",
			"model.familyDeepSeek": "DeepSeek",
			"model.familyOther": "Other",
			"model.imageUnsupported": "This model does not support images in this session.",
			"effort.providerDefault": "Default",
			"speed.standard": "Standard",
			"speed.fast": "Fast",
			"speed.fastDescription": "1.5× speed, more quota",
			"account.status": "Status: {status}",
			"account.available": "Available",
			"account.quotaLow": "Quota low",
			"account.switcher": "Accounts supporting the current model",
			"account.quota": "Quota {quota}",
			"account.quotaUnknown": "—",
			"account.quotaOverall": "Quota",
			"account.quotaFiveHour": "5h",
			"account.quotaWeekly": "Weekly limit",
			"account.nextReset": "Next reset {time}",
			"account.disabled": "Disabled",
			"account.unavailable": "Unavailable",
			"account.cooldown": "Cooldown until {time}",
			"status.loading": "Loading models…",
			"status.empty": "No models available",
			retry: "Retry",
			"error.action": "{message}",
			"settings.title": "CLIProXyAPI",
			"settings.description": "Connect to CLIProXyAPI and synchronize models, account status and quota.",
			"settings.endpoint": "CLIProXyAPI endpoint",
			"settings.endpointHint": "Enter the CLIProXyAPI base address. Model calls use /v1.",
			"settings.providerId": "Provider id",
			"settings.providerIdHint": "The model provider group used for CLIProXyAPI account status.",
			"settings.keyEnv": "Management key reference",
			"settings.keyEnvHint": "A POSIX environment-style name, for example CPA_MANAGEMENT_KEY.",
			"settings.key": "Management key",
			"settings.keyHint": "Leave blank to keep the current key.",
			"settings.keySet": "A key is configured.",
			"settings.keyUnset": "No key configured.",
			"settings.accounts": "Accounts",
			"settings.refresh": "Refresh",
			"settings.refreshing": "Refreshing…",
			"settings.refreshHint": "Host automatically synchronizes models and account quota at the selected interval.",
			"settings.refreshManual": "Manual",
			"settings.refresh5m": "5 minutes",
			"settings.refresh30m": "30 minutes",
			"settings.refresh1h": "1 hour",
			"settings.refresh3h": "3 hours",
			"settings.refresh5h": "5 hours",
			"settings.noAccounts": "No account status is available yet.",
			"settings.accountStatus": "Status: {status}",
			"settings.modelConfiguredHint": "Manage CLIProXyAPI models and the model key in Models.",
			"settings.save": "Save",
			"settings.saving": "Saving…",
			"settings.discard": "Discard",
			"settings.unsaved": "Unsaved",
			"settings.expand": "Show settings",
			"settings.collapse": "Hide settings",
			"settings.readOnly": "Settings are read-only in this deployment.",
			"settings.saveFailed": "The values were not accepted; correct them and try again.",
			"settings.invalidKeyEnv": "Use a valid environment-style name, such as CPA_MANAGEMENT_KEY.",
			"modelSettings.title": "CLIProXyAPI models",
			"modelSettings.description": "Manage the model list and model key here.",
			"modelSettings.unconfigured": "Add the model list and model key here.",
			"modelSettings.provider": "Provider",
			"modelSettings.baseURL": "Base URL",
			"modelSettings.baseURLHint": "Enter the CLIProXyAPI model address.",
			"modelSettings.key": "Model API key",
			"modelSettings.keyHint": "Write-only key used for CLIProXyAPI model calls.",
			"modelSettings.models": "Available models",
			"modelSettings.modelsHint": "Fetch from CLIProXyAPI or add model IDs manually.",
			"modelSettings.fetch": "Fetch models",
			"modelSettings.fetching": "Fetching…",
			"modelSettings.id": "Model ID",
			"modelSettings.name": "Display name (optional)",
			"modelSettings.remove": "Remove model",
			"modelSettings.add": "Add model",
			"modelSettings.save": "Save model setup"
		};
		const zh = {
			"trigger.fallback": "选择模型",
			"trigger.selectAria": "选择模型",
			"trigger.aria": "当前模型：{model}",
			"trigger.ariaEffort": "当前模型：{model}，推理等级：{effort}",
			"menu.aria": "模型选择",
			"menu.model": "模型",
			"menu.effort": "推理等级",
			"menu.speed": "速度",
			"model.familyGpt": "GPT",
			"model.familyClaude": "Claude",
			"model.familyGemini": "Gemini",
			"model.familyDeepSeek": "DeepSeek",
			"model.familyOther": "其他",
			"model.imageUnsupported": "当前会话包含图片，该模型不支持图片。",
			"effort.providerDefault": "默认",
			"speed.standard": "标准",
			"speed.fast": "快速",
			"speed.fastDescription": "1.5 倍速度，用量更多",
			"account.status": "状态：{status}",
			"account.available": "可用",
			"account.quotaLow": "额度不足",
			"account.switcher": "支持当前模型的账号",
			"account.quota": "额度：{quota}",
			"account.quotaUnknown": "—",
			"account.quotaOverall": "额度",
			"account.quotaFiveHour": "5小时",
			"account.quotaWeekly": "周限额",
			"account.nextReset": "下次重置 {time}",
			"account.disabled": "已禁用",
			"account.unavailable": "不可用",
			"account.cooldown": "冷却至 {time}",
			"status.loading": "正在获取模型…",
			"status.empty": "暂无可用模型",
			retry: "重试",
			"error.action": "{message}",
			"settings.title": "CLIProXyAPI",
			"settings.description": "连接 CLIProXyAPI，同步模型、账号状态和额度。",
			"settings.endpoint": "CLIProXyAPI 接口地址",
			"settings.endpointHint": "填写 CLIProXyAPI 基础地址，模型调用自动使用 /v1。",
			"settings.providerId": "提供方 ID",
			"settings.providerIdHint": "用于读取 CLIProXyAPI 账号状态的模型提供方。",
			"settings.keyEnv": "管理密钥引用",
			"settings.keyEnvHint": "使用环境变量格式名称，例如 CPA_MANAGEMENT_KEY。",
			"settings.key": "管理密钥",
			"settings.keyHint": "留空表示保持当前密钥。",
			"settings.keySet": "已配置密钥。",
			"settings.keyUnset": "未配置密钥。",
			"settings.accounts": "账号",
			"settings.refresh": "刷新",
			"settings.refreshing": "刷新中…",
			"settings.refreshHint": "由 Host 按所选间隔自动同步模型和账号额度。",
			"settings.refreshManual": "手动",
			"settings.refresh5m": "5 分钟",
			"settings.refresh30m": "30 分钟",
			"settings.refresh1h": "1 小时",
			"settings.refresh3h": "3 小时",
			"settings.refresh5h": "5 小时",
			"settings.noAccounts": "还没有可显示的账号状态。",
			"settings.accountStatus": "状态：{status}",
			"settings.modelConfiguredHint": "CLIProXyAPI 模型列表和调用密钥在“模型”页面管理。",
			"settings.save": "保存",
			"settings.saving": "保存中…",
			"settings.discard": "放弃修改",
			"settings.unsaved": "未保存",
			"settings.expand": "展开设置",
			"settings.collapse": "收起设置",
			"settings.readOnly": "当前部署的设置为只读。",
			"settings.saveFailed": "这些值没有被接受，请修正后重试。",
			"settings.invalidKeyEnv": "请输入有效的环境变量格式名称，例如 CPA_MANAGEMENT_KEY。",
			"modelSettings.title": "CLIProXyAPI 模型",
			"modelSettings.description": "在这里管理模型列表和调用密钥。",
			"modelSettings.unconfigured": "在这里添加模型列表和调用密钥。",
			"modelSettings.provider": "提供方",
			"modelSettings.baseURL": "模型地址",
			"modelSettings.baseURLHint": "填写 CLIProXyAPI 模型地址。",
			"modelSettings.key": "模型调用密钥",
			"modelSettings.keyHint": "仅写入不可读，用于调用 CLIProXyAPI 模型接口。",
			"modelSettings.models": "可用模型",
			"modelSettings.modelsHint": "可以从 CLIProXyAPI 获取，也可以手动添加模型 ID。",
			"modelSettings.fetch": "获取模型",
			"modelSettings.fetching": "获取中…",
			"modelSettings.id": "模型 ID",
			"modelSettings.name": "显示名称（可选）",
			"modelSettings.remove": "删除模型",
			"modelSettings.add": "添加模型",
			"modelSettings.save": "保存模型配置"
		};
		//#endregion
		//#region src/client/styles.ts
		const CSS = `
.dsh-cpa-model-root{position:relative;min-width:0}
.dsh-cpa-account-indicator-shell{position:relative;box-sizing:border-box;flex:0 0 200px;width:200px;min-width:200px;max-width:200px;margin-left:4px}
.dsh-cpa-account-indicator{position:relative;box-sizing:border-box;display:flex;align-items:center;gap:6px;width:260px;min-width:260px;max-width:260px;height:28px;padding:0 8px;overflow:hidden;border:1px solid var(--dsw-alias-border-l2);border-radius:8px;background:var(--dsw-alias-bg-layer-2,var(--dsw-alias-bg-base,#fff));color:var(--dsw-alias-label-secondary);font:inherit;font-size:11px;line-height:15px;text-align:left;white-space:nowrap;cursor:pointer}
.dsh-cpa-account-indicator:hover{border-color:var(--dsw-alias-label-dimmed);background:var(--dsw-alias-interactive-bg-hover)}
.dsh-cpa-account-indicator:focus-visible{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.dsh-cpa-account-indicator-progress{position:absolute;inset:0 auto 0 0;z-index:0;width:0;background:var(--dsw-alias-state-success-label,#4caf70);opacity:.16;pointer-events:none;transition:width .2s ease}
.dsh-cpa-account-indicator.is-quota-low .dsh-cpa-account-indicator-progress{background:var(--dsw-alias-state-warn-label,#e3a33d)}
.dsh-cpa-account-indicator.is-unavailable .dsh-cpa-account-indicator-progress{background:var(--dsw-alias-state-error-primary,#e45c5c)}
.dsh-cpa-account-indicator-copy,.dsh-cpa-account-indicator-quota,.dsh-cpa-account-indicator-dot{position:relative;z-index:1}
.dsh-cpa-account-indicator-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:0;overflow:hidden;text-align:left}
.dsh-cpa-account-indicator-copy strong,.dsh-cpa-account-indicator-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-account-indicator-copy strong{color:var(--dsw-alias-label-primary);font-size:11px;font-weight:600;line-height:14px}
.dsh-cpa-account-indicator-copy small{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:12px}
.dsh-cpa-account-indicator-quota{min-width:0;flex:0 0 78px;max-width:78px;overflow:hidden;color:var(--dsw-alias-label-tertiary);text-align:right;text-overflow:ellipsis;font-variant-numeric:tabular-nums}
.dsh-cpa-account-indicator-dot{width:7px;height:7px;flex:0 0 7px;border-radius:50%;background:var(--dsw-alias-state-success-label,#4caf70);box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-2,#fff)}
.dsh-cpa-account-indicator.is-quota-low .dsh-cpa-account-indicator-dot{background:var(--dsw-alias-state-warn-label,#e3a33d)}
.dsh-cpa-account-indicator.is-unavailable .dsh-cpa-account-indicator-dot{background:var(--dsw-alias-state-error-primary,#e45c5c)}
.dsh-cpa-account-menu{position:absolute;left:0;bottom:calc(100% + 8px);z-index:30;display:flex;min-width:260px;max-width:min(300px,calc(100vw - 32px));max-height:min(300px,calc(100vh - 96px));flex-direction:column;gap:3px;overflow:auto;padding:5px;border:1px solid var(--dsw-alias-border-inverted);border-radius:10px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary)}
.dsh-cpa-account-option{position:relative;display:flex;align-items:center;gap:7px;width:100%;min-height:38px;overflow:hidden;padding:5px 7px;border:0;border-radius:8px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.dsh-cpa-account-option:hover,.dsh-cpa-account-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.dsh-cpa-account-option-progress{position:absolute;inset:0 auto 0 0;z-index:0;width:0;background:var(--dsw-alias-state-success-label,#4caf70);opacity:.14;pointer-events:none;transition:width .2s ease}
.dsh-cpa-account-option.is-quota-low .dsh-cpa-account-option-progress{background:var(--dsw-alias-state-warn-label,#e3a33d)}
.dsh-cpa-account-option.is-unavailable .dsh-cpa-account-option-progress{background:var(--dsw-alias-state-error-primary,#e45c5c)}
.dsh-cpa-account-option-copy,.dsh-cpa-account-option-quota,.dsh-cpa-account-option-check{position:relative;z-index:1}
.dsh-cpa-account-option-copy{display:flex;min-width:0;flex:1;flex-direction:column;gap:0;overflow:hidden}
.dsh-cpa-account-option-copy strong,.dsh-cpa-account-option-copy small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-account-option-copy strong{font-size:12px;font-weight:600;line-height:15px}
.dsh-cpa-account-option-copy small{color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:13px}
.dsh-cpa-account-option-quota{max-width:75px;overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:11px;text-align:right;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-account-option-check{flex:0 0 14px;color:var(--dsw-alias-label-primary);text-align:center}
.dsh-cpa-account-menu-error{padding:5px 7px;color:var(--dsw-alias-state-error-primary);font-size:11px;line-height:15px}
.dsh-cpa-model-trigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:220px;height:28px;padding:0 4px 0 8px;border:0;border-radius:24px;outline:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:500;cursor:pointer}
.dsh-cpa-model-trigger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}
.dsh-cpa-model-trigger:focus-visible{box-shadow:0 0 0 2px var(--dsw-alias-border-l3)}
.dsh-cpa-model-trigger:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-cpa-model-trigger-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-model-trigger-effort{flex:0 0 auto;color:var(--dsw-alias-label-caption)}
.dsh-cpa-model-trigger-speed{flex:0 0 auto;color:var(--dsw-alias-label-caption)}
.dsh-cpa-chevron{flex:0 0 auto;color:var(--dsw-alias-label-caption);transition:transform 120ms ease}
.dsh-cpa-chevron.is-open{transform:rotate(180deg)}
.dsh-cpa-model-menu{position:absolute;right:0;bottom:calc(100% + 8px);z-index:20;display:flex;flex-direction:column;width:min(240px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));overflow:hidden;padding:4px;border:1px solid var(--dsw-alias-border-inverted);border-radius:12px;background:var(--dsw-specific-menu);box-shadow:var(--dsw-shadow-lv3);color:var(--dsw-alias-label-primary);--dsh-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);--dsh-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.dsh-cpa-menu-row{display:flex;align-items:center;gap:8px;width:100%;height:40px;padding:0 10px;border:0;border-radius:10px;background:transparent;color:var(--dsw-alias-label-primary);font-size:14px;line-height:22px;cursor:pointer;text-align:left}
.dsh-cpa-menu-row:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-cpa-menu-label{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-menu-value{flex:0 1 auto;min-width:0;overflow:hidden;color:var(--dsw-alias-label-tertiary);text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-menu-chevron{flex:0 0 auto;color:var(--dsw-alias-label-tertiary)}
.dsh-cpa-model-list,.dsh-cpa-model-groups{min-height:0;overflow-y:auto}
.dsh-cpa-model-group+.dsh-cpa-model-group{margin-top:4px}
.dsh-cpa-group-title{position:sticky;top:0;z-index:1;padding:5px 8px 3px;background:var(--dsw-specific-menu);color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;font-weight:500}
.dsh-cpa-option{display:flex;align-items:center;gap:8px;width:100%;min-height:38px;padding:6px 8px;border:0;border-radius:10px;outline:none;background:transparent;color:inherit;text-align:left;cursor:pointer}
.dsh-cpa-option:hover:not(:disabled),.dsh-cpa-option:focus-visible{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-cpa-option:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-cpa-option-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}
.dsh-cpa-account-copy{display:flex;flex:1;min-width:0;flex-direction:column;gap:2px}
.dsh-cpa-account-title{overflow:hidden;font-size:13px;line-height:19px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-model-name{overflow:hidden;color:inherit;font-size:14px;line-height:20px;font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-description{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-check{display:grid;place-items:center;flex:0 0 18px;color:var(--dsw-alias-label-primary)}
.dsh-cpa-option small{overflow:hidden;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-status{padding:10px;color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:20px}
.dsh-cpa-error{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:4px;padding:7px 8px;border-radius:8px;background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.dsh-cpa-error button{flex:0 0 auto;padding:0;border:0;background:transparent;color:inherit;font:inherit;font-weight:600;cursor:pointer}
.dsh-cpa-settings-card{margin:0;padding:0;list-style:none;border:1px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-3);overflow:hidden;transition:border-color .16s,background .16s}
.dsh-cpa-settings-card:hover{border-color:var(--dsw-alias-label-dimmed)}
.dsh-cpa-settings-header{display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border:0;border-radius:12px;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer}
.dsh-cpa-settings-header>span:first-child{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}
.dsh-cpa-settings-header strong{font-size:15px;line-height:21px;font-weight:600}
.dsh-cpa-settings-header small{color:var(--dsw-alias-label-tertiary);font-size:13px;line-height:19px}
.dsh-cpa-settings-header em{color:var(--dsw-alias-state-warn-label);font-size:12px;font-style:normal}
.dsh-cpa-settings-body{margin:0 16px;padding:0 0 8px;border-top:1px solid var(--dsw-alias-border-l2)}
.dsh-cpa-settings-field{position:relative;display:flex;flex-direction:column;gap:5px;margin-top:14px}
.dsh-cpa-settings-field label{font-size:13px;font-weight:600}
.dsh-cpa-settings-field input{box-sizing:border-box;width:100%;min-height:34px;padding:7px 9px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-white,#fff);color:var(--dsw-alias-label-primary);font:inherit}
.dsh-cpa-settings-field input:focus{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.dsh-cpa-settings-field input:disabled{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-dimmed)}
.dsh-cpa-settings-field small,.dsh-cpa-settings-note,.dsh-cpa-settings-muted{margin:0;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dsh-cpa-key-state{position:absolute;right:0;top:0;border-radius:999px;padding:1px 8px;background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:17px;white-space:nowrap}
.dsh-cpa-key-state.is-set{color:var(--dsw-alias-label-secondary)}
.dsh-cpa-settings-accounts{margin-top:18px;padding-top:14px;border-top:1px solid var(--dsw-alias-border-l2)}
.dsh-cpa-settings-accounts-head{display:flex;align-items:center;justify-content:space-between;gap:12px}
.dsh-cpa-settings-accounts-head strong{font-size:13px}
.dsh-cpa-settings-accounts-head button{padding:0;border:0;background:transparent;color:var(--dsw-alias-interactive-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dsh-cpa-settings-accounts-head button:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-cpa-settings-note{margin-top:7px}
.dsh-cpa-account-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-bottom:1px solid var(--dsw-alias-border-l2);font-size:13px;line-height:19px}
.dsh-cpa-account-row:last-child{border-bottom:0}
.dsh-cpa-account-row>span:first-child{display:flex;min-width:0;flex-direction:column;gap:2px}
.dsh-cpa-account-row strong{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-account-row small{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}
.dsh-cpa-account-row>span:last-child{flex:0 0 auto;text-align:right}
.dsh-cpa-account-quota{display:flex;min-width:0;flex-direction:column;gap:5px;margin-top:4px}
.dsh-cpa-account-quota-window{display:grid;grid-template-columns:38px minmax(80px,1fr) auto;align-items:center;column-gap:7px;row-gap:1px;min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsh-cpa-account-quota-label{white-space:nowrap}
.dsh-cpa-account-quota-track{display:block;height:5px;min-width:0;overflow:hidden;border-radius:999px;background:var(--dsw-alias-bg-module-platform,#edf0f2)}
.dsh-cpa-account-quota-fill{display:block;height:100%;border-radius:inherit;background:var(--dsw-alias-state-success-label,#4caf70);transition:width .16s ease}
.dsh-cpa-account-quota-window.is-quota-low .dsh-cpa-account-quota-fill{background:var(--dsw-alias-state-warn-label,#e3a33d)}
.dsh-cpa-account-quota-window.is-unavailable .dsh-cpa-account-quota-fill{background:var(--dsw-alias-state-error-primary,#e45c5c)}
.dsh-cpa-account-quota-window.is-unknown .dsh-cpa-account-quota-track{opacity:.55}
.dsh-cpa-account-quota-value{min-width:34px;text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
.dsh-cpa-account-quota-reset{grid-column:2 / -1;color:var(--dsw-alias-label-tertiary);font-size:10px;line-height:14px;white-space:nowrap}
.dsh-cpa-account-quota-empty{margin-top:2px}
.dsh-cpa-account-status-dot{display:inline-block;width:9px;height:9px;flex:0 0 9px;border-radius:50%;box-shadow:0 0 0 2px var(--dsw-specific-menu,#fff)}
.dsh-cpa-account-status-dot.is-available{background:var(--dsw-alias-state-success-label,#4caf70)}
.dsh-cpa-account-status-dot.is-quota-low{background:var(--dsw-alias-state-warn-label,#e3a33d)}
.dsh-cpa-account-status-dot.is-unavailable{background:var(--dsw-alias-state-error-primary,#e45c5c)}
.dsh-cpa-account-state{font-size:11px;font-weight:600}
.dsh-cpa-account-state.is-available{color:var(--dsw-alias-state-success-label)}
.dsh-cpa-account-state.is-quota-low{color:var(--dsw-alias-state-warn-label)}
.dsh-cpa-account-state.is-unavailable{color:var(--dsw-alias-state-error-primary)}
.dsh-cpa-settings-error{margin:10px 0 0;color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}
.dsh-cpa-settings-actions{display:flex;align-items:center;justify-content:flex-end;gap:8px;margin-top:18px;padding:12px 0 4px;border-top:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-white,#fff)}
.dsh-cpa-settings-actions button{appearance:none;border:1px solid transparent;border-radius:8px;padding:5px 14px;font:inherit;font-size:13px;line-height:1.5;cursor:pointer}
.dsh-cpa-settings-actions button:not(.is-primary){border-color:var(--dsw-alias-border-l2);background:transparent;color:var(--dsw-alias-label-secondary)}
.dsh-cpa-settings-actions button:not(.is-primary):hover:not(:disabled){border-color:var(--dsw-alias-label-dimmed);color:var(--dsw-alias-label-primary)}
.dsh-cpa-settings-actions button.is-primary{background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-white,#fff)}
.dsh-cpa-settings-actions button:disabled{opacity:.4;cursor:default}
.dsh-cpa-settings-actions button:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}
.dsh-cpa-model-settings{margin-top:18px;border-top:1px solid var(--dsw-alias-border-l2);padding-top:14px}
.dsh-cpa-model-settings-header{display:flex;align-items:center;gap:12px;width:100%;padding:0;border:0;background:transparent;color:var(--dsw-alias-label-primary);text-align:left;cursor:pointer}
.dsh-cpa-model-settings-header>span:first-child{display:flex;min-width:0;flex:1;flex-direction:column;gap:3px}
.dsh-cpa-model-settings-header strong{font-size:13px;line-height:20px}
.dsh-cpa-model-settings-header small{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsh-cpa-model-settings-header em{color:var(--dsw-alias-state-warn-label);font-size:11px;font-style:normal}
.dsh-cpa-model-settings-body{padding-top:12px}
.dsh-cpa-model-settings-meta{display:grid;grid-template-columns:auto 1fr;gap:3px 10px;margin-bottom:12px;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.dsh-cpa-model-settings-meta strong{min-width:0;overflow:hidden;color:var(--dsw-alias-label-secondary);font-weight:500;text-overflow:ellipsis;white-space:nowrap}
.dsh-cpa-model-settings-list-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:18px}
.dsh-cpa-model-settings-list-head strong{font-size:13px}
.dsh-cpa-model-settings-list-head button{padding:0;border:0;background:transparent;color:var(--dsw-alias-interactive-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dsh-cpa-model-settings-list-head button:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-cpa-model-draft{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr) 26px;gap:6px;margin-top:8px}
.dsh-cpa-model-draft input{box-sizing:border-box;width:100%;min-height:32px;padding:6px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:7px;background:var(--dsw-alias-bg-white,#fff);color:var(--dsw-alias-label-primary);font:inherit;font-size:12px}
.dsh-cpa-model-draft input:focus{outline:2px solid var(--dsw-alias-border-l3);outline-offset:1px}
.dsh-cpa-model-draft input:disabled{background:var(--dsw-alias-bg-module-platform);color:var(--dsw-alias-label-dimmed)}
.dsh-cpa-model-draft button{border:0;border-radius:7px;background:transparent;color:var(--dsw-alias-label-tertiary);font-size:18px;cursor:pointer}
.dsh-cpa-model-draft button:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);color:var(--dsw-alias-state-error-primary)}
.dsh-cpa-model-draft button:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
.dsh-cpa-model-add{margin-top:9px;padding:5px 0;border:0;background:transparent;color:var(--dsw-alias-interactive-label-primary);font:inherit;font-size:12px;cursor:pointer}
.dsh-cpa-model-add:disabled{color:var(--dsw-alias-label-dimmed);cursor:default}
`;
		function installStyles() {
			if (typeof document === "undefined") return () => {};
			if (document.querySelector("style[data-dsh-cpa-plugin]") !== null) return () => {};
			const style = document.createElement("style");
			style.dataset.dshCpaPlugin = "true";
			style.textContent = CSS;
			document.head.appendChild(style);
			return () => {
				style.remove();
			};
		}
		//#endregion
		//#region src/client/index.ts
		const NS = "dsh-cpa";
		const inject = [
			"connection",
			"locale",
			"modelDirectories",
			"remote",
			"sessions",
			"slots"
		];
		/**
		* Incremental model-selection extension used by the upstream client bundle.
		* It only occupies the existing model seat and leaves the upstream Settings
		* tab and model-directory owner in place.
		*/
		function applyAdditive(ctx) {
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "dsh-cpa: dictionaries");
			ctx.effect(installStyles, "dsh-cpa: styles");
			const cpa = new CpaClient(ctx.get("connection").rpc);
			cpa.loadConfig().then(() => {
				cpa.refresh().catch(() => {});
				cpa.loadModelCapabilities().catch(() => {});
				cpa.loadInputCapabilities().catch(() => {});
			}).catch(() => {});
			ctx.inject([
				"slots",
				"modelDirectories",
				"sessions"
			], (scope) => {
				const models = scope.modelDirectories;
				const sessions = scope.sessions;
				scope.slots.inject("conversation.input.model", () => scope.slots.register({
					name: "conversation.input.model",
					priority: -1,
					locale: NS,
					inject: (sessionId) => {
						const directory = models.directoryFor(sessionId);
						const session = sessions.binding(sessionId)?.session;
						const available = sessions.subagentAddress(sessionId) === void 0;
						return {
							available,
							directory: directory.store,
							load: () => {
								if (available) directory.load().catch(() => {});
							},
							select: (selection) => available ? directory.select(selection).then(() => true, () => false) : Promise.resolve(false),
							cpa,
							sessionId,
							session
						};
					}
				}, CpaModelSelect));
				scope.slots.inject("conversation.input.left", () => scope.slots.register({
					name: "conversation.input.left",
					id: "cpa-account",
					order: 20,
					locale: NS,
					inject: (sessionId) => ({
						cpa,
						sessionId,
						directory: models.directoryFor(sessionId).store
					})
				}, CpaAccountIndicator));
			});
			return cpa;
		}
		/** Legacy standalone client entry retained for the pre-upstream layout. */
		function apply(ctx) {
			const cpa = applyAdditive(ctx);
			const model = new CpaModelSettingsController(ctx.get("connection").api, cpa);
			cpa.loadConfig().catch(() => {});
			ctx.effect(() => {
				return ctx.remote.$on("settings/document-updated", (namespace) => {
					if (namespace === "llm-pi-ai") model.reload();
				});
			}, "dsh-cpa: model settings refresh");
			ctx.inject(["slots", "connection"], (scope) => {
				const card = new CpaSettingsCardController(scope.get("connection").api, cpa, model);
				scope.slots.inject("settings.plugin.item", () => scope.slots.register({
					name: "settings.plugin.item",
					id: "cpa",
					order: 30,
					locale: NS,
					inject: () => card.inject()
				}, CpaSettingsCard));
			});
		}
		//#endregion
		exports.apply = apply;
		exports.applyAdditive = applyAdditive;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map