import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { Config as PiAiConfig } from '@deepseek-ai/dsh-llm-pi-ai'
import { isImageOnlyModel } from '../src/catalog.js'

test('client bundle registers a lifecycle-owned Settings section', async () => {
  let definition
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
  }
  try {
    await import('../client.js')
    const plugin = definition.factory((id) => {
      assert.equal(id, 'react')
      return {}
    })
    assert.deepEqual(plugin.inject, ['connection', 'remote', 'remote.session', 'slots', 'locale', 'settingsScope'])

    const registrations = []
    const injections = []
    const slots = {
      inject(name, callback) {
        injections.push(name)
        return callback()
      },
      register(options, component) {
        registrations.push({ options, component })
        return () => {}
      },
    }
    const locale = {
      register(namespace, dictionaries) {
        assert.equal(namespace, 'settings.cliProxyApi')
        assert.deepEqual(Object.keys(dictionaries).sort(), ['en', 'zh'])
        return () => {}
      },
      bind(namespace) {
        assert.equal(namespace, 'settings.cliProxyApi')
        return (key) => key
      },
    }
    const scope = {
      getSnapshot() {
        return { status: 'loading', value: undefined, revision: undefined, writable: false }
      },
      subscribe() {
        return () => {}
      },
    }
    const settingsScope = {
      bind(spec) {
        assert.deepEqual(spec, { namespace: 'llm-pi-ai' })
        return scope
      },
    }
    let effect
    const ctx = {
      get(name) {
        if (name === 'connection') return { api: {} }
        if (name === 'remote') return { $on() { return () => {} } }
        if (name === 'slots') return slots
        if (name === 'locale') return locale
        if (name === 'settingsScope') return settingsScope
        throw new Error(`unexpected service: ${name}`)
      },
      slots,
      locale,
      settingsScope,
      effect(factory) {
        effect = factory
        return () => {}
      },
    }
    plugin.apply(ctx)
    assert.equal(typeof effect, 'function')
    assert.deepEqual(injections, ['settings.section'])
    assert.equal(registrations.length, 1)
    assert.equal(registrations[0].options.name, 'settings.section')
    assert.equal(registrations[0].options.id, 'cliproxyapi')
    assert.equal(registrations[0].options.order, 25)
    assert.equal(typeof registrations[0].options.inject, 'function')
    assert.equal(typeof registrations[0].component, 'function')
  } finally {
    delete globalThis.window
  }
})

test('client owns only its Settings slot and keeps the configuration accessible', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /setInterval\s*\(/)
   assert.doesNotMatch(source, /refresh-quotas|refreshFrequency/)
   assert.match(source, /REFRESH_INTERVALS/)
   assert.match(source, /set-refresh-interval/)
   assert.match(source, /cpaRpc\(connection, 'refresh'/)
  assert.doesNotMatch(source, /document\./)
  assert.doesNotMatch(source, /MutationObserver/)
  assert.doesNotMatch(source, /querySelector(All)?\s*\(/)
  assert.doesNotMatch(source, /modelsHeading|configuredRows|BOOTSTRAP_ATTRIBUTE|HIDDEN_ATTRIBUTE/)
  assert.match(source, /settings\.section/)
  assert.match(source, /ctx\.settingsScope/)
  assert.match(source, /slots\.inject\(SETTINGS_SLOT/)
  assert.match(source, /expectedRevision/)
  assert.match(source, /scope\.subscribe\(/)
  assert.doesNotMatch(source, /remote\.\$on\('settings\/document-updated'/)
  assert.match(source, /remote\.\$on\('credentials\/updated'/)
  assert.match(source, /role: 'status'/)
})

test('unified refresh keeps model and quota actions together', async () => {
  const host = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8')
  const provider = await readFile(new URL('../src/index.js', import.meta.url), 'utf8')
  const facade = await readFile(new URL('../src/client/cpa-client.ts', import.meta.url), 'utf8')
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.match(host, /case 'refresh':/)
  assert.match(host, /case 'set-refresh-interval':/)
  assert.match(provider, /MODEL_REFRESH_EVENT/)
  assert.match(provider, /cpaAddon\.refreshAccounts/)
  assert.doesNotMatch(facade, /setInterval\s*\(/)
  assert.match(host, /refreshModelCatalog\(ctx, signal\)/)
  assert.match(host, /refreshAccounts\(signal\)/)
  assert.match(host, /case 'refresh':\s*\{[\s\S]*return ok\(await refreshAccounts\(signal\)\)/)
  assert.doesNotMatch(host, /case 'refresh-quotas':/)
  assert.match(source, /cpa = additive\.applyAdditive\(ctx\)/)
  assert.match(source, /cpaState = useSyncExternalStore/)
  assert.match(source, /String\(window\?\.unit \|\| ''\)\.trim\(\) === '%'\)/)
})

test('unified refresh invalidates stale model capability requests', async () => {
  const source = await readFile(new URL('../src/client/cpa-client.ts', import.meta.url), 'utf8')
  assert.match(source, /capabilitiesEpoch/)
  assert.match(source, /finally[\s\S]*invalidateModelCapabilities\(\)/)
  assert.match(source, /if \(epoch !== this\.capabilitiesEpoch\) return this\.loadModelCapabilities\(\)/)
  assert.match(source, /if \(this\.capabilitiesPromise === pending\) this\.capabilitiesPromise = undefined/)
})

test('composer input left slot exposes a model-scoped account quota switcher', async () => {
  const source = await readFile(new URL('../src/client/index.ts', import.meta.url), 'utf8')
  const indicator = await readFile(new URL('../src/client/cpa-account-indicator.tsx', import.meta.url), 'utf8')
  const styles = await readFile(new URL('../src/client/styles.ts', import.meta.url), 'utf8')
  assert.match(source, /conversation\.input\.left/)
  assert.match(source, /CpaAccountIndicator/)
  assert.match(indicator, /role="status"/)
  assert.match(indicator, /dsh-cpa-account-indicator-progress/)
  assert.match(indicator, /dsh-cpa-account-indicator-label/)
  assert.match(indicator, /dsh-cpa-quota-full/)
  assert.match(indicator, /dsh-cpa-quota-short/)
  assert.match(styles, /@container\s*\(max-width:\s*640px\)/)
  assert.match(styles, /@container\s*\(max-width:\s*480px\)/)
  assert.match(indicator, /onClick/)
  assert.match(indicator, /loadAccountModels/)
  assert.match(indicator, /selectAccount/)
})

test('model popup does not expose the non-binding account picker', async () => {
  const source = await readFile(new URL('../src/client/cpa-model-select.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /menu\.account/)
  assert.doesNotMatch(source, /pane === ['\"]account['\"]/)
  assert.doesNotMatch(source, /loadSelectedAccount/)
  assert.doesNotMatch(source, /chooseAccount/)
})

test('ordinary model selector filters image-only entries via the shared catalog predicate', async () => {
  const source = await readFile(new URL('../src/client/cpa-model-select.tsx', import.meta.url), 'utf8')
  assert.match(source, /import\s+\{\s*isImageOnlyModel\s*\}\s+from '\.\.\/catalog\.js'/)
  assert.match(source, /function visibleModelsOf\(models: readonly ModelCatalogModel\[\]\): ModelCatalogModel\[\] \{\s*return models\.filter\(model => !isImageOnlyModel\(model\.id\)\)\s*\}/)
  assert.match(source, /if \(group\.id !== cpaProviderId\) \{\s*const models = visibleModelsOf\(group\.models\)/)
  assert.match(source, /for \(const model of visibleModelsOf\(group\.models\)\)/)
  assert.match(source, /displayGroups\.length === 0/)
  assert.doesNotMatch(source, /gpt-image-2-mini|gemini-3\.1-flash-high|gemini-3\.1-flash-lite/)
})

test('model settings hide image-only rows while preserving full draft data and extras on save', async () => {
  const source = await readFile(new URL('../src/client/cpa-model-settings.tsx', import.meta.url), 'utf8')
  assert.match(source, /import\s+\{\s*isImageOnlyModel\s*\}\s+from '\.\.\/catalog\.js'/)
  assert.match(source, /const actualIndex = visibleModelEntries\(this\.draft\.models\)\[index\]\?\.index/)
  assert.match(source, /models: visibleModelEntries\(this\.draft\.models\)\.map\(\(\{ model \}\) => model\)/)
  assert.match(source, /function visibleModelEntries\(models: readonly CpaModelDraft\[\]\): Array<\{ index: number; model: CpaModelDraft \}> \{\s*return models\.flatMap\(\(model, index\) => isImageOnlyModel\(model\.id\) \? \[\] : \[\{ index, model \}\]\)\s*\}/)
  assert.match(source, /extraFields\?: Record<string, unknown>/)
  assert.match(source, /extraFields: extraModelFields\(raw\)/)
  assert.match(source, /extraFields: extraModelFields\(model\)/)
  assert.match(source, /\.\.\.extraModelFields\(model\.extraFields\)/)
  assert.match(source, /this\.draft\.models = mergeModels\(this\.draft\.models, found\)/)
  assert.doesNotMatch(source, /gemini-3\.1-flash-lite.*isImageOnlyModel|gpt-image-2-mini.*isImageOnlyModel/)
})

test('discover then save preserves image-only metadata and hides the discovered row from visible settings', async () => {
  const { CpaModelSettingsController } = await loadTsModule(
    new URL('../src/client/cpa-model-settings.tsx', import.meta.url),
    {
      react: { useState() {}, useSyncExternalStore() {} },
      'react/jsx-runtime': { jsx() {}, jsxs() {}, Fragment: Symbol.for('fragment') },
      '@deepseek-ai/dsh-client-store': {
        createSnapshotStore(initial) {
          let snapshot = initial
          return {
            getSnapshot() { return snapshot },
            set(next) { snapshot = next },
            subscribe() { return () => {} },
          }
        },
      },
      './locales.ts': {},
      './cpa-client.ts': {},
      '../catalog.js': { isImageOnlyModel },
    },
  )

  const mutateRequests = []
  let revision = 1
  let namespace = {
    providers: {
      CLIProxyAPI: {
        api: 'openai-responses',
        baseURL: 'http://127.0.0.1:8317/v1',
        apiKeyEnv: 'CPA_MODEL_API_KEY',
        models: [{
          id: 'gemini-3.1-flash-lite',
          name: 'Gemini Lite',
          reasoningEfforts: { off: null, low: 'low' },
        }],
      },
    },
  }
  const scopeListeners = []
  const setPath = (root, path, value) => {
    let target = root
    for (const key of path.slice(0, -1)) target = target[key] ??= {}
    target[path[path.length - 1]] = value
  }
  const deletePath = (root, path) => {
    let target = root
    for (const key of path.slice(0, -1)) {
      target = target[key]
      if (target === undefined || target === null) return
    }
    delete target[path[path.length - 1]]
  }
  const settings = {
    getSnapshot() {
      return { status: 'ready', value: namespace, revision, writable: true, mode: 'live' }
    },
    subscribe(listener) {
      scopeListeners.push(listener)
      return () => {
        const index = scopeListeners.indexOf(listener)
        if (index >= 0) scopeListeners.splice(index, 1)
      }
    },
    async mutate(ops, expectedRevision) {
      assert.equal(expectedRevision, revision)
      mutateRequests.push({ ops, expectedRevision })
      const next = structuredClone(namespace)
      for (const op of ops) {
        if (op.op === 'set') setPath(next, op.path, structuredClone(op.value))
        else deletePath(next, op.path)
      }
      namespace = next
      revision += 1
      for (const listener of [...scopeListeners]) listener()
    },
  }
  const ctx = {
    remote: {
      credentials: {
        async describe(refs) {
          return { ok: true, value: Object.fromEntries(refs.map((ref) => [ref, { configured: true, writable: true }])) }
        },
        async set() {
          return { ok: true, value: undefined }
        },
      },
      llm: {
        async discoverModels(settingsNs, request) {
          assert.equal(settingsNs, 'llm-cliproxyapi')
          assert.equal(request.baseURL, 'http://127.0.0.1:8317/v1')
          return { ok: true, value: [{
            id: 'gpt-image-2',
            name: 'GPT Image 2',
            contextWindow: 32000,
            maxTokens: 1,
          }] }
        },
      },
    },
  }
  const cpa = {
    store: {
      getSnapshot() {
        return { providerId: 'CLIProxyAPI', endpoint: 'http://127.0.0.1:8317' }
      },
      subscribe() {
        return () => {}
      },
    },
  }

  const controller = new CpaModelSettingsController(ctx, settings, cpa)
  const face = controller.inject()
  await waitFor(() => face.hooks.cpaModelSettings.getSnapshot().loading === false)

  face.discover()
  await waitFor(() => face.hooks.cpaModelSettings.getSnapshot().discovering === false)

  const visibleAfterDiscover = Array.from(
    face.hooks.cpaModelSettings.getSnapshot().models,
    (model) => model.id,
  )
  assert.deepEqual(visibleAfterDiscover, ['gemini-3.1-flash-lite'])

  face.save()
  await waitFor(() => mutateRequests.length === 1)

  const modelsOp = mutateRequests[0].ops.find((op) => op.op === 'set' && op.path.join('/') === 'providers/CLIProxyAPI/models')
  assert.ok(modelsOp)
  assert.equal(Array.isArray(modelsOp.value), true)
  const savedModels = JSON.parse(JSON.stringify(modelsOp.value))
  assert.equal(savedModels.length, 2)
  assert.deepEqual(savedModels.find((model) => model.id === 'gemini-3.1-flash-lite'), {
    id: 'gemini-3.1-flash-lite',
    name: 'Gemini Lite',
    reasoningEfforts: { off: null, low: 'low' },
  })
  assert.deepEqual(savedModels.find((model) => model.id === 'gpt-image-2'), {
    id: 'gpt-image-2',
    name: 'GPT Image 2',
    contextWindow: 32000,
    maxTokens: 1,
    reasoningEfforts: { off: null, low: 'low', medium: 'medium', high: 'high' },
  })
})

test('initial profile waits until the host writes complete model capabilities', async () => {
  let definition
  globalThis.window = {
    __ModuleLoader__: {
      load(value) {
        definition = value
      },
    },
  }
  try {
    await import('../client.js?initial-profile-sync-test')
    const plugin = definition.factory((id) => {
      assert.equal(id, 'react')
      return {}
    })
    const scopeListeners = []
    let currentNamespace = {
      ns: 'llm-pi-ai', revision: 1, value: {
        providers: {
          CLIProxyAPI: {
            baseURL: 'http://127.0.0.1:8317/v1',
            models: [{
              id: 'gpt-5.6-sol',
              contextWindow: 921000,
              maxTokens: 16384,
            }],
          },
        },
      },
    }
    let scopeSnapshot = {
      status: 'ready', revision: 1, value: {
        providers: {
          CLIProxyAPI: {
            baseURL: 'http://127.0.0.1:8317/v1',
            headers: { authorization: 'Bearer dsh-cliproxyapi-no-key' },
          },
        },
      }, writable: true,
    }
    let bootstrap
    let discoveryRequest
    const ok = (value) => ({ result: { ok: true, value } })
    const api = {
      settings: {
        async describe() {
          return ok({ writable: true, hasDocument: true, namespaces: [currentNamespace] })
        },
        async mutate(request) {
          bootstrap = request.ops[0].value
          currentNamespace = {
            ns: 'llm-pi-ai', revision: 2, value: { providers: { CLIProxyAPI: bootstrap } },
          }
          return ok(currentNamespace)
        },
      },
      credentials: {
        async describe() {
          return ok({ credentials: { DSH_CLIPROXY_API_KEY: { configured: false } } })
        },
      },
      llm: {
        async discoverModels(request) {
          discoveryRequest = request
          return ok({ models: [{
            id: 'gpt-5.6-sol', name: 'GPT 5.6 Sol', contextWindow: 372000, maxTokens: 32768,
          }] })
        },
      },
    }
    const scope = {
      getSnapshot() {
        return scopeSnapshot
      },
      subscribe(listener) {
        scopeListeners.push(listener)
        return () => scopeListeners.splice(scopeListeners.indexOf(listener), 1)
      },
    }
    const messages = {
      noModels: 'no models',
      syncTimeout: 'sync timeout',
    }
    let settled = false
    const installing = plugin.installInitialProfile(
      api, scope, 'http://127.0.0.1:8317/v1', '', messages,
    ).then((profile) => {
      settled = true
      return profile
    })

    for (let attempt = 0; !bootstrap && attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    assert.ok(bootstrap)
    assert.equal(discoveryRequest.settingsNs, 'llm-cliproxyapi')
    assert.equal(bootstrap.models[0].contextWindow, 921000)
    assert.equal(bootstrap.models[0].maxTokens, 16384)
    assert.equal(bootstrap.models[0].input, undefined)
    assert.equal(bootstrap.models[0].reasoningEfforts, undefined)
    assert.match(bootstrap.headers['x-dsh-provider-cpa-sync'], /^rich:/)
    const validated = await PiAiConfig['~standard'].validate({
      providers: { CLIProxyAPI: bootstrap },
    })
    assert.equal(validated.issues, undefined)
    await new Promise((resolve) => setTimeout(resolve, 0))
    assert.equal(settled, false)

    const synchronized = {
      ...bootstrap,
      headers: { authorization: 'Bearer dsh-cliproxyapi-no-key' },
      models: [{
        id: 'gpt-5.6-sol',
        name: 'GPT 5.6 Sol',
        contextWindow: 372000,
        maxTokens: 32768,
        input: ['text', 'image'],
        reasoningEfforts: { low: 'low', high: 'high' },
      }],
    }
    currentNamespace = {
      ns: 'llm-pi-ai', revision: 3, value: { providers: { CLIProxyAPI: synchronized } },
    }
    scopeSnapshot = {
      status: 'ready', revision: 3, value: currentNamespace.value, writable: true,
    }
    for (const listener of [...scopeListeners]) listener()

    const profile = await installing
    assert.deepEqual(profile.models[0].input, ['text', 'image'])
    assert.deepEqual(profile.models[0].reasoningEfforts, { low: 'low', high: 'high' })
    assert.equal(scopeListeners.length, 0)
  } finally {
    delete globalThis.window
  }
})

test('accountWindowStats and accountCumulativeStats extract correct metrics', async () => {
  const displayModule = await loadTsModule(new URL('../src/client/cpa-account-display.ts', import.meta.url), {})
  const { accountWindowStats, accountCumulativeStats } = displayModule

  // accountWindowStats uses strictly the recent window
  const windowStats1 = accountWindowStats({ recentSuccess: 200, recentFailed: 1 })
  assert.equal(windowStats1.success, 200)
  assert.equal(windowStats1.failed, 1)

  const windowStats2 = accountWindowStats({ recentSuccess: 0, recentFailed: 0 })
  assert.equal(windowStats2.success, 0)
  assert.equal(windowStats2.failed, 0)

  const windowStats3 = accountWindowStats({})
  assert.equal(windowStats3.success, 0)
  assert.equal(windowStats3.failed, 0)

  // accountCumulativeStats uses cumulative values
  const cumulativeStats1 = accountCumulativeStats({ success: 1929, failed: 13 })
  assert.equal(cumulativeStats1.success, 1929)
  assert.equal(cumulativeStats1.failed, 13)
  assert.equal(cumulativeStats1.hasRecords, true)

  const cumulativeStats2 = accountCumulativeStats({ success: 0, failed: 0 })
  assert.equal(cumulativeStats2.success, 0)
  assert.equal(cumulativeStats2.failed, 0)
  assert.equal(cumulativeStats2.hasRecords, false)
})

test('CpaAutoRefresh polls the Host snapshot at the configured interval and re-arms', async () => {
  const { CpaAutoRefresh } = await loadTsModule(
    new URL('../src/client/cpa-auto-refresh.ts', import.meta.url),
    { './cpa-client.ts': {} },
  )

  const calls = []
  let state = { refreshIntervalMs: 300000, managementKeyConfigured: true }
  const listeners = new Set()
  const source = {
    store: {
      getSnapshot() { return state },
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    async pullAccounts() {
      calls.push('pull')
    },
  }

  const scheduled = []
  const schedule = (callback, delay) => {
    const row = { callback, delay, cancelled: false, pending: true }
    scheduled.push(row)
    return row
  }
  const cancel = (row) => { row.cancelled = true; row.pending = false }

  const driver = new CpaAutoRefresh(source, schedule, cancel)
  assert.equal(scheduled.length, 1)
  assert.equal(scheduled[0].delay, 300000)

  // Firing the timer pulls once and re-arms with the same delay.
  const first = scheduled[0]
  first.pending = false
  first.callback()
  await waitFor(() => calls.length === 1 && scheduled.some(row => row.pending))
  assert.equal(calls.length, 1)
  assert.equal(scheduled.filter(row => row.pending).length, 1)
  assert.equal(scheduled.filter(row => row.pending)[0].delay, 300000)

  // A store change re-arms: manual mode (0) stops polling...
  state = { refreshIntervalMs: 0, managementKeyConfigured: true }
  for (const listener of [...listeners]) listener()
  assert.equal(scheduled.filter(row => row.pending).length, 0)
  const before = calls.length

  // ...and returning to 5m starts a fresh timer without an immediate pull.
  state = { refreshIntervalMs: 300000, managementKeyConfigured: true }
  for (const listener of [...listeners]) listener()
  assert.equal(calls.length, before)
  const pending = scheduled.filter(row => row.pending)
  assert.equal(pending.length, 1)
  assert.equal(pending[0].delay, 300000)

  // An unconfigured management key suppresses polling entirely.
  state = { refreshIntervalMs: 300000, managementKeyConfigured: false }
  for (const listener of [...listeners]) listener()
  assert.equal(scheduled.filter(row => row.pending).length, 0)

  // Interval changes cancel the previous timer before arming the new one.
  state = { refreshIntervalMs: 1800000, managementKeyConfigured: true }
  for (const listener of [...listeners]) listener()
  const armed = scheduled.filter(row => row.pending)
  assert.equal(armed.length, 1)
  assert.equal(armed[0].delay, 1800000)

  // dispose stops future polling and cancels the pending timer.
  driver.dispose()
  assert.equal(scheduled.filter(row => row.pending).length, 0)
  state = { refreshIntervalMs: 300000, managementKeyConfigured: true }
  for (const listener of [...listeners]) listener()
  assert.equal(scheduled.filter(row => row.pending).length, 0)
})

test('CpaAutoRefresh keeps polling when a pull fails and never overlaps ticks', async () => {
  const { CpaAutoRefresh } = await loadTsModule(
    new URL('../src/client/cpa-auto-refresh.ts', import.meta.url),
    { './cpa-client.ts': {} },
  )

  const listeners = new Set()
  let mode = 'ok'
  let resolvePull
  let pullCount = 0
  const source = {
    store: {
      getSnapshot() {
        return { refreshIntervalMs: 1000, managementKeyConfigured: true }
      },
      subscribe(listener) {
        listeners.add(listener)
        return () => listeners.delete(listener)
      },
    },
    pullAccounts() {
      pullCount += 1
      if (mode === 'slow') return new Promise((resolve) => { resolvePull = resolve })
      if (mode === 'fail') return Promise.reject(new Error('endpoint offline'))
      return Promise.resolve()
    },
  }

  const scheduled = []
  const schedule = (callback, delay) => {
    const row = { callback, delay, cancelled: false, pending: true }
    scheduled.push(row)
    return row
  }
  const cancel = (row) => { row.cancelled = true; row.pending = false }

  const driver = new CpaAutoRefresh(source, schedule, cancel)
  assert.equal(scheduled.length, 1)
  assert.equal(pullCount, 0)

  // A failed pull must still re-arm (no dead driver, no unhandled rejection).
  mode = 'fail'
  const first = scheduled.find(row => row.pending)
  first.pending = false
  first.callback()
  await waitFor(() => pullCount === 1)
  await waitFor(() => scheduled.some(row => row.pending && row !== first))
  assert.equal(scheduled.filter(row => row.pending).length, 1)
  assert.equal(pullCount, 1)

  // Overlapping ticks are coalesced: fire while a pull is in flight.
  mode = 'slow'
  const active = scheduled.find(row => row.pending)
  active.pending = false
  active.callback()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(pullCount, 2)
  // The in-flight pull means `running` is true, so a manual re-fire is a no-op.
  active.callback()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(pullCount, 2)
  // Re-arm only happens after the pull settles.
  assert.equal(scheduled.filter(row => row.pending).length, 0)
  resolvePull()
  await waitFor(() => scheduled.some(row => row.pending))
  assert.equal(scheduled.filter(row => row.pending).length, 1)
  driver.dispose()
})

test('CpaClient.pullAccounts silently applies Host snapshots without loading state', async () => {
  const facade = await readFile(new URL('../src/client/cpa-client.ts', import.meta.url), 'utf8')
  assert.match(facade, /async pullAccounts\(\)/)
  assert.match(facade, /'accounts', \{\}\)/)
  assert.doesNotMatch(facade, /pullAccounts[\s\S]{0,400}state\.status = 'loading'/)
})

async function loadTsModule(url, requireMap) {
  const source = await readFile(url, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
    fileName: fileURLToPath(url),
  }).outputText
  const filename = fileURLToPath(url)
  const dirname = filename.slice(0, filename.lastIndexOf('/'))
  const module = { exports: {} }
  const script = new vm.Script(`(function(require, module, exports, __filename, __dirname) {${compiled}\n})`, { filename })
  const factory = script.runInNewContext({ console })
  factory((id) => {
    if (id in requireMap) return requireMap[id]
    throw new Error(`unexpected require: ${id}`)
  }, module, module.exports, filename, dirname)
  return module.exports
}

async function waitFor(predicate, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) return
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error('timed out waiting for condition')
}
