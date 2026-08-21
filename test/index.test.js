import test from 'node:test'
import assert from 'node:assert/strict'
import { Context, Service } from '@deepseek-ai/cordis'
import { CredentialProvider } from '@deepseek-ai/dsh-credentials'
import { createUserMessage, LlmRuntime } from '@deepseek-ai/dsh-llm'
import {
  Config as PiAiConfig,
  apply as applyPiAi,
  inject as piAiInject,
  name as piAiName,
} from '@deepseek-ai/dsh-llm-pi-ai'
import { SettingsProvider } from '@deepseek-ai/dsh-settings'
import {
  Config,
  PLACEHOLDER_AUTHORIZATION,
  PROFILE_SYNC_HEADER,
  apply,
} from '../src/index.js'

async function resolvedConfig(overrides = {}) {
  const result = await Config['~standard'].validate(overrides)
  assert.equal(result.issues, undefined)
  return result.value
}

function managedProfile(overrides = {}) {
  return {
    displayName: 'CLIProxyAPI',
    api: 'openai-responses',
    baseURL: 'http://127.0.0.1:8317/v1',
    models: [{ id: 'old', name: 'old', contextWindow: 1000, maxTokens: 100, input: ['text'] }],
    defaultContextWindow: 262144,
    defaultMaxTokens: 32768,
    defaultInput: ['text'],
    headers: {},
    ...overrides,
  }
}

function createContext(initialSection, initialCredential) {
  let section = initialSection
  let credential = initialCredential
  const discoveries = new Map()
  const listeners = new Map()
  const mutations = []
  const warnings = []
  const effects = []
  const timeouts = []

  const ctx = {
    llm: {
      registerModelDiscovery(ns, handler) {
        discoveries.set(String(ns), handler)
        return () => discoveries.delete(String(ns))
      },
      registerConfigurableProviders() {
        throw new Error('the plugin must not own the configurable-provider directory')
      },
    },
    settings: {
      get() {
        return section
      },
      async mutate(_ns, ops) {
        mutations.push(ops)
        const providers = { ...(section.providers || {}) }
        for (const op of ops) {
          assert.equal(op.path[0], 'providers')
          if (op.op === 'set') providers[op.path[1]] = op.value
          else delete providers[op.path[1]]
        }
        section = { ...section, providers }
      },
    },
    credentials: {
      async resolve() {
        return credential === undefined ? undefined : { value: credential }
      },
    },
    on(event, listener) {
      const rows = listeners.get(event) || []
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
    timeout(callback, delay) {
      const row = { callback, delay, cancelled: false }
      timeouts.push(row)
      return () => { row.cancelled = true }
    },
    logger: {
      warn(message) {
        warnings.push(String(message))
      },
    },
  }

  return {
    ctx,
    discoveries,
    mutations,
    warnings,
    timeouts,
    get section() { return section },
    setSection(value) { section = value },
    setCredential(value) { credential = value },
    emit(event, ...args) {
      for (const listener of listeners.get(event) || []) listener(...args)
    },
    dispose() {
      for (const effect of effects.reverse()) effect()
    },
  }
}

async function waitFor(predicate, timeoutMs = 1000) {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('timed out waiting for condition')
    await new Promise((resolve) => setTimeout(resolve, 5))
  }
}

test('registers rich discovery without competing for the provider directory', async () => {
  const harness = createContext({ providers: {} })
  apply(harness.ctx, await resolvedConfig())
  assert.deepEqual([...harness.discoveries.keys()], ['llm-cliproxyapi'])
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(harness.mutations.length, 0)
  harness.dispose()
})

test('initial discovery requests the fixed rich catalog and returns full capabilities', async () => {
  const previousFetch = globalThis.fetch
  let requestURL
  globalThis.fetch = async (url) => {
    requestURL = String(url)
    return new Response(JSON.stringify({ models: [{
      slug: 'gpt-5.6-sol',
      display_name: 'GPT 5.6 Sol',
      max_context_window: 372000,
      input_modalities: ['text', 'image'],
      supported_reasoning_levels: [{ effort: 'low' }, { effort: 'high' }],
    }] }), { status: 200 })
  }
  try {
    const harness = createContext({ providers: {} })
    apply(harness.ctx, await resolvedConfig())
    const models = await harness.discoveries.get('llm-cliproxyapi')({
      provider: 'CLIProxyAPI',
      baseURL: 'http://127.0.0.1:8317/v1',
      apiKey: 'secret-key',
      signal: new AbortController().signal,
    })
    assert.equal(
      requestURL,
      'http://127.0.0.1:8317/v1/models?client_version=dsh-cpa-plugin',
    )
    assert.deepEqual(models[0], {
      id: 'gpt-5.6-sol',
      name: 'GPT 5.6 Sol',
      contextWindow: 372000,
      maxTokens: 32768,
      input: ['text', 'image'],
      reasoningEfforts: { low: 'low', high: 'high' },
    })
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('model discovery preserves manual capacities already stored for the provider', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{
    slug: 'gpt-5.6-sol',
    display_name: 'GPT 5.6 Sol',
    max_context_window: 372000,
    max_output_tokens: 32768,
  }] }), { status: 200 })
  try {
    const harness = createContext({ providers: {
      CLIProxyAPI: managedProfile({
        models: [{
          id: 'gpt-5.6-sol',
          name: 'GPT 5.6 Sol',
          contextWindow: 921000,
          maxTokens: 16384,
        }],
      }),
    } })
    apply(harness.ctx, await resolvedConfig())
    const models = await harness.discoveries.get('llm-cliproxyapi')({
      provider: 'CLIProxyAPI',
      baseURL: 'http://127.0.0.1:8317/v1',
      signal: new AbortController().signal,
    })
    assert.equal(models[0].contextWindow, 921000)
    assert.equal(models[0].maxTokens, 16384)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('first profile synchronization restores capabilities stripped by the browser RPC', async () => {
  const previousFetch = globalThis.fetch
  let fetches = 0
  globalThis.fetch = async () => {
    fetches += 1
    return new Response(JSON.stringify({ models: [
      {
        slug: 'gpt-5.6-sol',
        display_name: 'GPT 5.6 Sol',
        max_context_window: 372000,
        input_modalities: ['text', 'image'],
        supported_reasoning_levels: [
          { effort: 'low' }, { effort: 'medium' }, { effort: 'high' },
          { effort: 'xhigh' }, { effort: 'max' },
        ],
      },
      {
        slug: 'gpt-5.6-spark',
        display_name: 'GPT 5.6 Spark',
        input_modalities: ['text'],
      },
    ] }), { status: 200 })
  }
  try {
    const harness = createContext({ providers: {} })
    apply(harness.ctx, await resolvedConfig())
    await new Promise((resolve) => setTimeout(resolve, 0))
    const discovered = await harness.discoveries.get('llm-cliproxyapi')({
      provider: 'CLIProxyAPI',
      baseURL: 'http://127.0.0.1:8317/v1',
      signal: new AbortController().signal,
    })
    const bootstrapModels = discovered.map(({ id, name, contextWindow, maxTokens }) => ({
      id, name, contextWindow, maxTokens,
    }))
    harness.setSection({ providers: {
      CLIProxyAPI: managedProfile({
        models: bootstrapModels,
        headers: {
          [PROFILE_SYNC_HEADER]: 'rich:test',
          authorization: PLACEHOLDER_AUTHORIZATION,
        },
      }),
    } })
    harness.emit('settings/updated', 'llm-pi-ai', harness.section, undefined, 'update')

    await waitFor(() => harness.mutations.length === 1)
    const profile = harness.mutations[0][0].value
    assert.equal(fetches, 1)
    assert.equal(profile.headers[PROFILE_SYNC_HEADER], undefined)
    assert.deepEqual(profile.models[0], {
      id: 'gpt-5.6-sol',
      name: 'GPT 5.6 Sol',
      contextWindow: 372000,
      maxTokens: 32768,
      input: ['text', 'image'],
      reasoningEfforts: {
        low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
      },
      compat: { chatTemplateKwargs: {} },
    })
    assert.deepEqual(profile.models[1].input, ['text'])
    await waitFor(() => harness.timeouts.some((row) => row.delay === 300000))
    const periodic = harness.timeouts.find((row) => row.delay === 300000)
    periodic.callback()
    await waitFor(() => fetches === 2)
    await waitFor(() => harness.timeouts.filter((row) => row.delay === 300000).length === 2)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('profile synchronization preserves manual model capacities and route defaults', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [
    {
      slug: 'manual-model',
      display_name: 'Discovered Manual Model',
      max_context_window: 372000,
      max_output_tokens: 32768,
    },
    {
      slug: 'new-model',
      display_name: 'New Model',
      max_context_window: 128000,
      max_output_tokens: 4096,
    },
  ] }), { status: 200 })
  try {
    const harness = createContext({ providers: {
      CLIProxyAPI: managedProfile({
        models: [{
          id: 'manual-model',
          name: 'Manual Model',
          contextWindow: 921000,
          maxTokens: 16384,
          input: ['text'],
        }],
        defaultContextWindow: 999999,
        defaultMaxTokens: 12345,
        headers: { [PROFILE_SYNC_HEADER]: 'rich:test' },
      }),
    } })
    apply(harness.ctx, await resolvedConfig())

    await waitFor(() => harness.mutations.length === 1)
    const profile = harness.mutations[0][0].value
    assert.deepEqual(profile.models.map(({ id, contextWindow, maxTokens }) => ({ id, contextWindow, maxTokens })), [
      { id: 'manual-model', contextWindow: 921000, maxTokens: 16384 },
      { id: 'new-model', contextWindow: 128000, maxTokens: 4096 },
    ])
    assert.equal(profile.defaultContextWindow, 999999)
    assert.equal(profile.defaultMaxTokens, 12345)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('credential refresh cannot finalize a pending bootstrap profile early', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{
    slug: 'vision-model',
    input_modalities: ['text', 'image'],
    supported_reasoning_levels: [{ effort: 'high' }],
  }] }), { status: 200 })
  try {
    const harness = createContext({ providers: {} })
    apply(harness.ctx, await resolvedConfig())
    await new Promise((resolve) => setTimeout(resolve, 0))
    harness.setSection({ providers: {
      CLIProxyAPI: managedProfile({
        models: [{
          id: 'vision-model', name: 'Vision Model', contextWindow: 262144, maxTokens: 32768,
          input: ['text', 'image'], reasoningEfforts: { high: 'high' },
        }],
        headers: {
          [PROFILE_SYNC_HEADER]: 'rich:test',
          authorization: PLACEHOLDER_AUTHORIZATION,
        },
      }),
    } })
    harness.setCredential('secret-key')
    harness.emit('credentials/updated', 'DSH_CLIPROXY_API_KEY')

    await waitFor(() => harness.mutations.length === 1)
    await new Promise((resolve) => setTimeout(resolve, 25))
    const profile = harness.mutations[0][0].value
    assert.equal(harness.mutations.length, 1)
    assert.equal(profile.headers[PROFILE_SYNC_HEADER], undefined)
    assert.equal(profile.apiKeyEnv, 'DSH_CLIPROXY_API_KEY')
    assert.deepEqual(profile.models[0].input, ['text', 'image'])
    assert.deepEqual(profile.models[0].reasoningEfforts, { high: 'high' })
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('keyless profiles omit apiKeyEnv and receive a non-sensitive placeholder header', async () => {
  const previousFetch = globalThis.fetch
  let fetches = 0
  globalThis.fetch = async () => {
    fetches += 1
    return new Response(JSON.stringify({ models: [{ slug: 'model-a' }] }), { status: 200 })
  }
  try {
    const harness = createContext({ providers: {
      CLIProxyAPI: managedProfile(),
    } })
    apply(harness.ctx, await resolvedConfig())
    await waitFor(() => harness.mutations.length === 1)
    const profile = harness.mutations[0][0].value
    assert.equal(profile.apiKeyEnv, undefined)
    assert.equal(profile.headers.authorization, PLACEHOLDER_AUTHORIZATION)
    assert.equal(profile.models[0].id, 'model-a')
    harness.emit('settings/updated', 'llm-pi-ai', harness.section, undefined, 'update')
    await new Promise((resolve) => setTimeout(resolve, 25))
    assert.equal(harness.mutations.length, 1)
    assert.equal(fetches, 1)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('refreshIntervalMs defaults to five minutes and supports manual mode', async () => {
  const config = await resolvedConfig()
  assert.equal(config.refreshIntervalMs, 300000)
  const manual = await resolvedConfig({ refreshIntervalMs: 0 })
  assert.equal(manual.refreshIntervalMs, 0)
})

test('credential removal regenerates the profile in keyless mode', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({ models: [{ slug: 'model-a' }] }), { status: 200 })
  try {
    const harness = createContext({ providers: {
      CLIProxyAPI: managedProfile({
        apiKeyEnv: 'DSH_CLIPROXY_API_KEY',
        headers: {
          authorization: PLACEHOLDER_AUTHORIZATION,
        },
      }),
    } }, 'secret-key')
    apply(harness.ctx, await resolvedConfig())
    await waitFor(() => harness.mutations.length === 1)
    assert.equal(harness.mutations[0][0].value.apiKeyEnv, 'DSH_CLIPROXY_API_KEY')
    assert.equal(harness.mutations[0][0].value.headers.authorization, undefined)

    harness.mutations.length = 0
    harness.setCredential(undefined)
    harness.emit('credentials/updated', 'DSH_CLIPROXY_API_KEY')
    await waitFor(() => harness.mutations.length === 1)
    const profile = harness.mutations[0][0].value
    assert.equal(profile.apiKeyEnv, undefined)
    assert.equal(profile.headers.authorization, PLACEHOLDER_AUTHORIZATION)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('a newer settings change aborts stale discovery and only installs the latest profile', async () => {
  const previousFetch = globalThis.fetch
  let markFirstStarted
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve })
  globalThis.fetch = async (url, options) => {
    if (String(url).includes('8317')) {
      markFirstStarted()
      return new Promise((resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
      })
    }
    return new Response(JSON.stringify({ models: [{ slug: 'model-b' }] }), { status: 200 })
  }
  try {
    const harness = createContext({ providers: {
      CLIProxyAPI: managedProfile(),
    } })
    apply(harness.ctx, await resolvedConfig())
    await firstStarted
    harness.setSection({ providers: {
      CLIProxyAPI: managedProfile({ baseURL: 'http://127.0.0.1:9417/v1' }),
    } })
    harness.emit('settings/updated', 'llm-pi-ai', harness.section, undefined, 'update')
    await waitFor(() => harness.mutations.length === 1)
    const profile = harness.mutations[0][0].value
    assert.equal(profile.baseURL, 'http://127.0.0.1:9417/v1')
    assert.deepEqual(profile.models.map((model) => model.id), ['model-b'])
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('catalog requests honor timeout and failed refreshes use exponential backoff', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async (_url, options) => new Promise((resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(options.signal.reason), { once: true })
  })
  try {
    const harness = createContext({ providers: {
      CLIProxyAPI: managedProfile(),
    } })
    apply(harness.ctx, await resolvedConfig({ fetchTimeoutMs: 10, retryInitialMs: 20, retryMaxMs: 80 }))
    await waitFor(() => harness.timeouts.length === 1)
    assert.equal(harness.timeouts[0].delay, 20)
    assert.match(harness.warnings[0], /timed out after 10 ms/)

    harness.timeouts[0].callback()
    await waitFor(() => harness.timeouts.length === 2)
    assert.equal(harness.timeouts[1].delay, 40)
    harness.dispose()
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('real Cordis composition leaves llm-pi-ai as the sole directory owner', async () => {
  const previousFetch = globalThis.fetch
  let inferenceAuthorization
  let catalogFetches = 0
  const document = {
    'llm-pi-ai': {
      providers: {},
    },
  }

  class MemorySettings extends SettingsProvider {
    writable = true
    async load() { return structuredClone(document) }
    async persist(ns, section) { document[ns] = structuredClone(section) }
  }

  class MemoryCredentials extends CredentialProvider {
    async resolve() { return undefined }
    async describe() { return { configured: false, writable: true } }
    async set() {}
    async unset() {}
  }

  class TimerService extends Service {
    constructor(ctx) {
      super(ctx, 'timer')
      ctx.mixin('timer', ['timeout'])
    }
    timeout(callback, delay) {
      return this.ctx.effect(() => {
        const timer = setTimeout(callback, delay)
        return () => clearTimeout(timer)
      })
    }
  }

  globalThis.fetch = async (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const method = init?.method ?? (input instanceof Request ? input.method : 'GET')
    if (method === 'GET' && url.includes('/models?')) {
      catalogFetches += 1
      return new Response(JSON.stringify({ models: [
        { slug: 'plain', supported_reasoning_levels: [{ effort: 'none' }] },
        { slug: 'think', supported_reasoning_levels: [{ effort: 'none' }, { effort: 'high' }] },
      ] }), { status: 200 })
    }
    const headers = new Headers(input instanceof Request ? input.headers : undefined)
    for (const [key, value] of new Headers(init?.headers)) headers.set(key, value)
    inferenceAuthorization = headers.get('authorization')
    return new Response(JSON.stringify({ error: { message: 'intentional test response' } }), {
      status: 503,
      headers: { 'content-type': 'application/json' },
    })
  }

  const ctx = new Context()
  const fibers = []
  try {
    fibers.push(ctx.plugin(LlmRuntime))
    fibers.push(ctx.plugin(MemorySettings))
    fibers.push(ctx.plugin(MemoryCredentials))
    fibers.push(ctx.plugin(TimerService))
    await Promise.all(fibers.map((fiber) => fiber.await()))

    const piFiber = ctx.plugin({
      name: piAiName,
      inject: piAiInject,
      Config: PiAiConfig,
      apply: applyPiAi,
    }, { providers: {} })
    const cpaFiber = ctx.plugin({ name: 'llm-cliproxyapi', inject: ['settings', 'credentials', 'llm', 'timer'], Config, apply }, {
      retryInitialMs: 10,
      retryMaxMs: 20,
    })
    fibers.push(piFiber, cpaFiber)
    await Promise.all([piFiber.await(), cpaFiber.await()])

    const discovered = await ctx.llm.discoverModels('llm-cliproxyapi', {
      provider: 'CLIProxyAPI',
      baseURL: 'http://127.0.0.1:8317/v1',
      signal: new AbortController().signal,
    })
    assert.equal(discovered[0].input, undefined)
    assert.equal(discovered[1].reasoningEfforts, undefined)
    await ctx.settings.mutate('llm-pi-ai', [{
      op: 'set',
      path: ['providers', 'CLIProxyAPI'],
      value: managedProfile({
        models: discovered,
        headers: {
          [PROFILE_SYNC_HEADER]: 'rich:integration-test',
          authorization: PLACEHOLDER_AUTHORIZATION,
        },
      }),
    }])

    await waitFor(() => ctx.settings.get('llm-pi-ai')?.providers?.CLIProxyAPI?.models?.[0]?.id === 'plain')
    await waitFor(() => ctx.settings.get('llm-pi-ai').providers.CLIProxyAPI.headers[PROFILE_SYNC_HEADER] === undefined)
    assert.equal(catalogFetches, 1)
    const directories = ctx.llm.listConfigurableProviders().filter((entry) => entry.provider === 'CLIProxyAPI')
    assert.equal(directories.length, 1)
    assert.equal(directories[0].settingsNs, 'llm-pi-ai')
    assert.equal(ctx.llm.listProviders().some((provider) => provider.id === 'CLIProxyAPI'), true)
    const models = ctx.settings.get('llm-pi-ai').providers.CLIProxyAPI.models
    assert.equal(models[0].reasoningEfforts, undefined)
    assert.deepEqual(models[1].reasoningEfforts, { off: 'none', high: 'high' })

    const chunks = []
    for await (const chunk of ctx.llm.stream({
      provider: 'CLIProxyAPI',
      model: 'plain',
      messages: [createUserMessage({
        content: [{ type: 'text', text: 'probe' }],
        source: { kind: 'user' },
      })],
    })) chunks.push(chunk)
    assert.equal(inferenceAuthorization, PLACEHOLDER_AUTHORIZATION)
    assert.equal(chunks.at(-1)?.type, 'finish')
    assert.notEqual(chunks.at(-1)?.reason?.failure?.code, 'MISSING_CREDENTIAL')
  } finally {
    globalThis.fetch = previousFetch
    for (const fiber of fibers.reverse()) await fiber.dispose().catch(() => {})
  }
})
