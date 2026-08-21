import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Config as PiAiConfig } from '@deepseek-ai/dsh-llm-pi-ai'

test('client bundle registers a lifecycle-owned Plugins Settings tab', async () => {
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
    assert.deepEqual(plugin.inject, ['connection', 'remote', 'slots', 'locale', 'settingsScope'])

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
    assert.deepEqual(injections, ['settings.plugins.tab'])
    assert.equal(registrations.length, 1)
    assert.equal(registrations[0].options.name, 'settings.plugins.tab')
    assert.equal(registrations[0].options.id, 'cliproxyapi')
    assert.equal(registrations[0].options.order, 30)
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
  assert.match(source, /settings\.plugins\.tab/)
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
  assert.match(source, /conversation\.input\.left/)
  assert.match(source, /CpaAccountIndicator/)
  assert.match(indicator, /role="status"/)
  assert.match(indicator, /dsh-cpa-account-indicator-progress/)
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
