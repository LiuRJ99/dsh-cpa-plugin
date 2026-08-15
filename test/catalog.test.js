import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogURL, modelProfileOf, readCodexCatalog, reasoningEffortsOf } from '../src/catalog.js'

test('maps Codex reasoning levels to Harness canonical levels', () => {
  assert.deepEqual(reasoningEffortsOf({ supported_reasoning_levels: [
    { effort: 'none' }, { effort: 'minimal' }, { effort: 'high' }, { effort: 'ultra' },
  ] }), { off: 'none', minimal: 'minimal', high: 'high', max: 'ultra' })
})

test('omits an off-only reasoning capability rejected by llm-pi-ai', () => {
  assert.equal(reasoningEffortsOf({ supported_reasoning_levels: [
    { effort: 'none' }, { effort: 'off' },
  ] }), undefined)
})

test('maps model metadata and applies safe fallbacks', () => {
  assert.deepEqual(modelProfileOf({
    slug: 'gpt-test', display_name: 'GPT Test', max_context_window: 372000,
    input_modalities: ['text', 'image', 'audio'],
    supported_reasoning_levels: [{ effort: 'low' }, { effort: 'xhigh' }],
  }, { defaultContextWindow: 262144, defaultMaxTokens: 32768, defaultInput: ['text'] }), {
    id: 'gpt-test', name: 'GPT Test', contextWindow: 372000, maxTokens: 32768,
    input: ['text', 'image'], reasoningEfforts: { low: 'low', xhigh: 'xhigh' },
  })
})

test('extracts modalities and reasoning from the Codex catalog response', () => {
  const models = readCodexCatalog({ models: [
    {
      slug: 'gpt-5.6-sol',
      display_name: 'GPT 5.6 Sol',
      max_context_window: 372000,
      input_modalities: ['text', 'image'],
      supported_reasoning_levels: [
        { effort: 'low' },
        { effort: 'medium' },
        { effort: 'high' },
        { effort: 'xhigh' },
        { effort: 'max' },
        { effort: 'ultra' },
      ],
    },
    {
      slug: 'gpt-5.6-spark',
      display_name: 'GPT 5.6 Spark',
      max_context_window: 128000,
      input_modalities: ['text'],
    },
  ] }, { defaultContextWindow: 262144, defaultMaxTokens: 32768, defaultInput: ['text'] })

  assert.deepEqual(models, [
    {
      id: 'gpt-5.6-sol',
      name: 'GPT 5.6 Sol',
      contextWindow: 372000,
      maxTokens: 32768,
      input: ['text', 'image'],
      reasoningEfforts: {
        low: 'low', medium: 'medium', high: 'high', xhigh: 'xhigh', max: 'max',
      },
    },
    {
      id: 'gpt-5.6-spark',
      name: 'GPT 5.6 Spark',
      contextWindow: 128000,
      maxTokens: 32768,
      input: ['text'],
    },
  ])
})

test('uses configured fallbacks when catalog capability fields are absent', () => {
  assert.deepEqual(modelProfileOf({ slug: 'fallback-model' }, {
    defaultContextWindow: 262144,
    defaultMaxTokens: 32768,
    defaultInput: ['text'],
  }), {
    id: 'fallback-model',
    name: 'fallback-model',
    contextWindow: 262144,
    maxTokens: 32768,
    input: ['text'],
  })
})

test('filters hidden models by default and deduplicates slugs', () => {
  const models = readCodexCatalog({ models: [
    { slug: 'visible', context_window: 1000 },
    { slug: 'visible', context_window: 2000 },
    { slug: 'hidden', visibility: 'hide', context_window: 3000 },
  ] }, { defaultContextWindow: 262144, defaultMaxTokens: 32768, defaultInput: ['text'] })
  assert.deepEqual(models.map((model) => model.id), ['visible'])
})

test('builds the Codex-compatible catalog URL', () => {
  assert.equal(
    catalogURL('http://127.0.0.1:8317/v1/'),
    'http://127.0.0.1:8317/v1/models?client_version=dsh-cliproxyapi-provider',
  )
})

test('rejects malformed and empty catalogs', () => {
  assert.throws(() => readCodexCatalog({ data: [] }), /no "models" array/)
  assert.throws(() => readCodexCatalog({ models: [] }), /no usable models/)
})
