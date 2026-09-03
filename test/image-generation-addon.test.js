import test from 'node:test'
import assert from 'node:assert/strict'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
import { Config, apply } from '../lib/index.js'

const IMAGE_SERVICE_EXPORT = await import('@LiuRJ99/dsh-cpa-plugin/image-generation')

function managedProfile(overrides = {}) {
  return {
    displayName: 'CLIProxyAPI',
    api: 'openai-responses',
    baseURL: 'http://127.0.0.1:8317/v1',
    apiKeyEnv: 'SYNTHETIC_CPA_REF_A',
    models: [{ id: 'old', name: 'old', contextWindow: 1000, maxTokens: 100, input: ['text'] }],
    defaultContextWindow: 262144,
    defaultMaxTokens: 32768,
    defaultInput: ['text'],
    headers: {},
    ...overrides,
  }
}

async function resolvedConfig(overrides = {}) {
  const result = await Config['~standard'].validate({
    registerDiscovery: false,
    ...overrides,
  })
  assert.equal(result.issues, undefined)
  return result.value
}

function createHarness() {
  let modelSettings = {
    providers: {
      CLIProxyAPI: managedProfile(),
    },
  }
  const registeredSections = new Map()
  const provided = new Map()
  const listeners = new Map()
  const effects = []
  const resolvedRefs = []
  let keyA = 'SYNTHETIC_CPA_MARKER_A'
  let keyB = 'SYNTHETIC_CPA_MARKER_B'
  let nativeKey = 'SYNTHETIC_NATIVE_CPA_MARKER'

  const settingsService = {
    get(ns) {
      if (String(ns) === 'llm-pi-ai') return modelSettings
      return registeredSections.get(String(ns))
    },
    async mutate(ns, ops) {
      if (String(ns) !== 'llm-pi-ai') throw new Error(`unexpected mutate namespace ${String(ns)}`)
      const providers = { ...(modelSettings.providers ?? {}) }
      for (const op of ops) {
        assert.equal(op.op, 'set')
        assert.deepEqual(op.path.slice(0, 1), ['providers'])
        providers[op.path[1]] = op.value
      }
      modelSettings = { ...modelSettings, providers }
      for (const listener of listeners.get('settings/updated') ?? []) {
        listener('llm-pi-ai', modelSettings, undefined, 'update')
      }
    },
    register(ns, _schema, options = {}) {
      const key = String(ns)
      if (!registeredSections.has(key)) registeredSections.set(key, options.base)
      return {
        get() {
          return registeredSections.get(key)
        },
        watch() {
          return () => {}
        },
      }
    },
    installSection(_owner, ns, _schema, entry) {
      const key = String(ns)
      if (!registeredSections.has(key)) registeredSections.set(key, entry)
    },
  }

  const credentialsService = {
    async resolve(ref) {
      const name = String(ref)
      resolvedRefs.push(name)
      if (name === String(credentialRef('SYNTHETIC_CPA_REF_A'))) {
        return keyA === undefined ? undefined : { value: keyA }
      }
      if (name === String(credentialRef('SYNTHETIC_CPA_REF_B'))) {
        return keyB === undefined ? undefined : { value: keyB }
      }
      if (name === String(credentialRef('DSH_CLIPROXY_API_KEY'))) {
        return nativeKey === undefined ? undefined : { value: nativeKey }
      }
      return undefined
    },
  }

  const connectionService = {
    rpc: {
      handle() {
        return () => {}
      },
    },
  }

  const ctx = {
    fiber: { state: 'running' },
    provide(name, value) {
      provided.set(String(name), value)
      return value
    },
    get(name) {
      if (name === 'settings') return settingsService
      if (name === 'credentials') return credentialsService
      if (name === 'connection') return connectionService
      return provided.get(String(name))
    },
    inject(_deps, callback) {
      callback({
        settings: settingsService,
        credentials: credentialsService,
        connection: connectionService,
        effect(factory) {
          const cleanup = factory()
          return () => cleanup?.()
        },
        get(name) {
          return ctx.get(name)
        },
      })
    },
    on(event, listener) {
      const rows = listeners.get(event) ?? []
      rows.push(listener)
      listeners.set(event, rows)
      return () => listeners.set(event, rows.filter((row) => row !== listener))
    },
    effect(factory) {
      const cleanup = factory()
      const dispose = () => cleanup?.()
      effects.push(dispose)
      return dispose
    },
    timeout() {
      return () => {}
    },
  }

  return {
    ctx,
    provided,
    resolvedRefs,
    async updateProfile(profile) {
      await settingsService.mutate('llm-pi-ai', [{
        op: 'set',
        path: ['providers', 'CLIProxyAPI'],
        value: profile,
      }])
    },
    setCredentials(nextA, nextB) {
      keyA = nextA
      keyB = nextB
    },
    dispose() {
      for (const effect of effects.reverse()) effect()
    },
  }
}

test('Host add-on registers image service and resolves route plus credential at generate time', async () => {
  const previousFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: input instanceof Request ? input.url : String(input),
      authorization: new Headers(init?.headers).get('authorization'),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    })
    return new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from('png').toString('base64') }],
    }), { status: 200 })
  }

  const harness = createHarness()
  try {
    apply(harness.ctx, await resolvedConfig({ providerId: 'CLIProxyAPI' }))
    const service = harness.provided.get(IMAGE_SERVICE_EXPORT.IMAGE_GENERATION_SERVICE)
    assert.equal(typeof service?.generate, 'function')
    assert.equal('createCpaImageGenerationService' in IMAGE_SERVICE_EXPORT, false)

    await service.generate({
      engine: 'gpt',
      prompt: 'first image',
      signal: new AbortController().signal,
    })

    await harness.updateProfile(managedProfile({
      baseURL: 'http://127.0.0.1:9417/v1',
      apiKeyEnv: 'SYNTHETIC_CPA_REF_B',
    }))
    harness.setCredentials('SYNTHETIC_STALE_MARKER', 'SYNTHETIC_FRESH_MARKER')

    await service.generate({
      engine: 'gpt',
      prompt: 'second image',
      signal: new AbortController().signal,
    })

    assert.equal(IMAGE_SERVICE_EXPORT.IMAGE_GENERATION_SERVICE, 'dshCpaImageGeneration')
    assert.deepEqual(harness.resolvedRefs, [
      String(credentialRef('SYNTHETIC_CPA_REF_A')),
      String(credentialRef('SYNTHETIC_CPA_REF_B')),
    ])
    assert.equal(calls[0].url, 'http://127.0.0.1:8317/v1/images/generations')
    assert.match(calls[0].authorization ?? '', /^Bearer \S+$/u)
    assert.equal(calls[0].body.model, 'gpt-image-2')
    assert.equal(calls[1].url, 'http://127.0.0.1:9417/v1/images/generations')
    assert.match(calls[1].authorization ?? '', /^Bearer \S+$/u)
  } finally {
    globalThis.fetch = previousFetch
    harness.dispose()
  }
})

test('Host add-on reuses the native CLIProxyAPI model key for the add-on key reference', async () => {
  const previousFetch = globalThis.fetch
  const calls = []
  globalThis.fetch = async (input, init) => {
    calls.push({
      url: input instanceof Request ? input.url : String(input),
      authorization: new Headers(init?.headers).get('authorization'),
    })
    return new Response(JSON.stringify({
      data: [{ b64_json: Buffer.from('png').toString('base64') }],
    }), { status: 200 })
  }

  const harness = createHarness()
  try {
    apply(harness.ctx, await resolvedConfig({ providerId: 'CLIProxyAPI' }))
    await harness.updateProfile(managedProfile({ apiKeyEnv: 'CPA_MODEL_API_KEY' }))
    const service = harness.provided.get(IMAGE_SERVICE_EXPORT.IMAGE_GENERATION_SERVICE)

    await service.generate({
      engine: 'gpt',
      prompt: 'reuse native key',
      signal: new AbortController().signal,
    })

    assert.deepEqual(harness.resolvedRefs, [
      String(credentialRef('CPA_MODEL_API_KEY')),
      String(credentialRef('DSH_CLIPROXY_API_KEY')),
    ])
    assert.equal(calls[0].authorization, 'Bearer SYNTHETIC_NATIVE_CPA_MARKER')
  } finally {
    globalThis.fetch = previousFetch
    harness.dispose()
  }
})
