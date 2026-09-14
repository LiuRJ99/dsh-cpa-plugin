import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import {
  CLIPROXYAPI_CODEX_API,
  codexBaseURL,
  cpaModel,
  isCodexResponsesModel,
  patchCodexSource,
  reasoningEfforts,
  streamCpaFast,
} from '../src/cpa-fast-stream.ts'
import { mapUsage } from '../src/pi-ai/stream.ts'

class FakeWebSocket {
  static instances = []

  constructor(url, options) {
    this.url = String(url)
    this.options = options
    this.readyState = 0
    this.listeners = new Map()
    this.sent = []
    FakeWebSocket.instances.push(this)
    queueMicrotask(() => {
      this.readyState = 1
      this.emit('open', {})
    })
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    listeners.push(listener)
    this.listeners.set(type, listeners)
  }

  removeEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? []
    this.listeners.set(type, listeners.filter(candidate => candidate !== listener))
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) listener(event)
  }

  send(value) {
    this.sent.push(JSON.parse(String(value)))
    queueMicrotask(() => {
      this.readyState = 3
      const message = (event) => this.emit('message', { data: JSON.stringify(event) })
      message({ type: 'response.created', response: { id: 'response-1' } })
      message({
        type: 'response.output_item.added',
        output_index: 0,
        item: { type: 'message', id: 'message-1', content: [] },
      })
      message({ type: 'response.output_text.delta', output_index: 0, delta: 'ok' })
      message({
        type: 'response.output_item.done',
        output_index: 0,
        item: { type: 'message', id: 'message-1', content: [{ type: 'output_text', text: 'ok' }] },
      })
      message({
        type: 'response.completed',
        response: {
          id: 'response-1',
          status: 'completed',
          output: [],
          usage: {
            input_tokens: 10,
            output_tokens: 20,
            total_tokens: 30,
            output_tokens_details: { reasoning_tokens: 7 },
          },
        },
      })
    })
  }

  close(code = 1000, reason = 'done') {
    this.readyState = 3
    queueMicrotask(() => this.emit('close', { code, reason, wasClean: true }))
  }
}

test('keeps canonical reasoning levels and their CLIProxyAPI wire values', () => {
  const configured = { id: 'gpt-test', reasoningEfforts: { off: 'none', low: 'low', max: 'ultra', high: null } }
  assert.deepEqual(reasoningEfforts(configured), configured.reasoningEfforts)
  assert.equal(cpaModel({ provider: 'cpa', baseURL: 'http://127.0.0.1:8317/v1', models: [] }, configured, configured.id, configured.reasoningEfforts).api, CLIPROXYAPI_CODEX_API)
  assert.deepEqual(cpaModel({ provider: 'cpa', baseURL: 'http://127.0.0.1:8317/v1', models: [] }, configured, configured.id, configured.reasoningEfforts).thinkingLevelMap, configured.reasoningEfforts)
})

test('recognizes Codex GPT namespaces without claiming other provider families', () => {
  assert.equal(isCodexResponsesModel('gpt-5.6-sol'), true)
  assert.equal(isCodexResponsesModel('openai/gpt-5.6-sol'), true)
  assert.equal(isCodexResponsesModel('o3'), true)
  assert.equal(isCodexResponsesModel('claude-sonnet-4'), false)
  assert.equal(isCodexResponsesModel('gemini-3.1-pro'), false)
})

test('normalizes CLIProxyAPI v1 inference URLs to the Codex backend endpoint', () => {
  assert.equal(codexBaseURL('http://127.0.0.1:8317/v1'), 'http://127.0.0.1:8317/backend-api')
  assert.equal(codexBaseURL('http://127.0.0.1:8317/backend-api'), 'http://127.0.0.1:8317/backend-api')
})

test('maps pi-ai reasoning usage into the Harness usage contract', () => {
  assert.deepEqual(mapUsage({
    input: 10, output: 20, reasoning: 12, cacheRead: 3, cacheWrite: 4,
  }), {
    inputTokens: 10, outputTokens: 20, reasoningTokens: 12, cacheReadTokens: 3, cacheWriteTokens: 4,
  })
})

test('patches the installed Codex adapter for plain CPA keys and provider history', async () => {
  const source = await readFile(new URL('../node_modules/@earendil-works/pi-ai/dist/api/openai-codex-responses.js', import.meta.url), 'utf8')
  const patched = patchCodexSource(source, ['cpa'])
  assert.match(patched, /return typeof accountId === "string"/)
  assert.match(patched, /if \(accountId\) \{\s*headers\.set\("chatgpt-account-id", accountId\)/)
  assert.match(patched, /new Set\(\[[^\]]*"cpa"\]\)/)
  assert.match(patched, /api: "cliproxyapi-codex-responses"/)
  assert.match(patched, /const websocketDisabledForSession = false;/)
  assert.match(patched, /let websocketRetries = 0;/)
})

test('builds Codex-shaped standard requests with keyless CPA auth and usage metadata', async () => {
  const previousWebSocket = globalThis.WebSocket
  globalThis.WebSocket = FakeWebSocket
  FakeWebSocket.instances = []
  try {
    const chunks = []
    for await (const chunk of streamCpaFast({
      provider: 'cpa',
      model: 'gpt-test',
      system: 'system',
      sessionId: 'standard-session',
      reasoningEffort: 'high',
      signal: new AbortController().signal,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    }, {
      provider: 'cpa',
      baseURL: 'http://127.0.0.1:8317/v1',
      models: [{ id: 'gpt-test', reasoningEfforts: { high: 'ultra' } }],
    }, async () => undefined, undefined, undefined)) chunks.push(chunk)

    const socket = FakeWebSocket.instances[0]
    assert.equal(socket.url, 'ws://127.0.0.1:8317/backend-api/codex/responses')
    assert.equal(socket.sent[0].store, false)
    assert.equal(socket.sent[0].service_tier, undefined)
    assert.equal(socket.sent[0].reasoning.effort, 'ultra')
    assert.equal(socket.sent[0].prompt_cache_key, 'standard-session')
    assert.equal(socket.sent[0].include[0], 'reasoning.encrypted_content')
    assert.equal(socket.sent[0].parallel_tool_calls, true)
    const headers = new Headers(socket.options.headers)
    assert.equal(headers.get('authorization'), 'Bearer dsh-cliproxyapi-no-key')
    assert.equal(headers.get('chatgpt-account-id'), null)
    assert.equal(headers.get('originator'), 'pi')
    assert.equal(headers.get('session-id'), 'standard-session')
    assert.equal(headers.get('openai-beta'), 'responses_websockets=2026-02-06')
    assert.deepEqual(chunks.find(chunk => chunk.type === 'usage')?.usage, {
      inputTokens: 10,
      outputTokens: 20,
      reasoningTokens: 7,
    })
    assert.equal(chunks.at(-1)?.type, 'finish')
  } finally {
    globalThis.WebSocket = previousWebSocket
  }
})
