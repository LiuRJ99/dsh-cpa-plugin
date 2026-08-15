import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { Config as PiAiConfig } from '@deepseek-ai/dsh-llm-pi-ai'

test('client bundle integrates with Models without registering a sidebar section', async () => {
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
      throw new Error(`unexpected client dependency: ${id}`)
    })
    assert.deepEqual(plugin.inject, ['connection', 'remote'])

    let effect
    const ctx = {
      get(name) {
        if (name === 'connection') return { api: {} }
        if (name === 'remote') return { $on() { return () => {} } }
        throw new Error(`unexpected service: ${name}`)
      },
      on() { return () => {} },
      effect(factory) {
        effect = factory
        return () => {}
      },
    }
    plugin.apply(ctx)
    assert.equal(typeof effect, 'function')
  } finally {
    delete globalThis.window
  }
})

test('client refresh is event-driven and exposes basic accessibility semantics', async () => {
  const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /setInterval\s*\(/)
  assert.doesNotMatch(source, /settings\.section/)
  assert.doesNotMatch(source, /Provider name|Display name|Refresh Models/)
  assert.match(source, /remote\.\$on\('settings\/document-updated'/)
  assert.match(source, /remote\.\$on\('credentials\/updated'/)
  assert.match(source, /remote\.\$on\('llm\/adapters-updated'/)
  assert.match(source, /new MutationObserver\(schedule\)/)
  assert.match(source, /requestAnimationFrame/)
  assert.doesNotMatch(source, /schedule\(500\)/)
  assert.match(source, /actionButtons\.slice\(1\)/)
  assert.match(source, /details\.open = true/)
  assert.match(source, /querySelectorAll\(':scope > section\[aria-label\]'\)/)
  assert.match(source, /data-dsh-provider-cpa-bootstrap/)
  assert.match(source, /\.htmlFor =/)
  assert.match(source, /setAttribute\('role', 'status'\)/)
  assert.match(source, /setAttribute\('role', 'alert'\)/)
  assert.match(source, /type: 'button'/)
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
    const plugin = definition.factory(() => {
      throw new Error('unexpected client dependency')
    })
    const listeners = []
    let currentNamespace = {
      ns: 'llm-pi-ai', revision: 1, value: { providers: {} },
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
    const remote = {
      $on(event, listener) {
        assert.equal(event, 'settings/document-updated')
        listeners.push(listener)
        return () => listeners.splice(listeners.indexOf(listener), 1)
      },
    }
    const messages = {
      noModels: 'no models',
      syncTimeout: 'sync timeout',
    }
    let settled = false
    const installing = plugin.installInitialProfile(
      api, remote, 'http://127.0.0.1:8317/v1', '', messages,
    ).then((profile) => {
      settled = true
      return profile
    })

    for (let attempt = 0; !bootstrap && attempt < 100; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
    assert.ok(bootstrap)
    assert.equal(discoveryRequest.settingsNs, 'llm-cliproxyapi')
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
    for (const listener of [...listeners]) listener('llm-pi-ai', 3)

    const profile = await installing
    assert.deepEqual(profile.models[0].input, ['text', 'image'])
    assert.deepEqual(profile.models[0].reasoningEfforts, { low: 'low', high: 'high' })
    assert.equal(listeners.length, 0)
  } finally {
    delete globalThis.window
  }
})
