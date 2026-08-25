import test from 'node:test'
import assert from 'node:assert/strict'
import {
  catalogURL,
  isHiddenImageModel,
  isImageOnlyModel,
  modelProfileOf,
  readCodexCatalog,
  reasoningEffortsOf,
} from '../src/catalog.js'

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

test('marks only the explicit image-only ids and keeps ordinary gemini models visible', () => {
  assert.equal(modelProfileOf({ id: 'gpt-image-2' })?.imageGeneration, true)
  assert.equal(modelProfileOf({ id: 'gemini-3.1-flash-image' })?.imageGeneration, true)
  assert.equal(modelProfileOf({ id: 'gpt-image-1.5' })?.imageGeneration, true)
  assert.equal(modelProfileOf({ id: 'gemini-3.1-flash-lite' })?.imageGeneration, undefined)
  assert.equal(modelProfileOf({ id: 'gemini-3.1-flash-high' })?.imageGeneration, undefined)
  assert.equal(modelProfileOf({ id: 'gpt-image-2-mini' })?.imageGeneration, undefined)
  assert.equal(isImageOnlyModel({ id: 'gpt-image-2' }), true)
  assert.equal(isImageOnlyModel('gemini-3.1-flash-image'), true)
  assert.equal(isImageOnlyModel({ slug: 'gpt-image-1.5' }), true)
  assert.equal(isImageOnlyModel({ model: 'gemini-3.1-flash-image' }), true)
  assert.equal(isImageOnlyModel({ id: 'gemini-3.1-flash-lite' }), false)
  assert.equal(isImageOnlyModel({ slug: 'gemini-3.1-flash-lite' }), false)
  assert.equal(isImageOnlyModel({ model: 'gemini-3.1-flash-high' }), false)
  assert.equal(isImageOnlyModel({ id: 'gemini-3.1-flash-high' }), false)
  assert.equal(isImageOnlyModel({ id: 'gemini-3.1-flash-low' }), false)
  assert.equal(isImageOnlyModel({ id: 'gemini-3.1-flash-agent' }), false)
})

test('re-admits hidden image-only entries without using suffix inference', () => {
  const models = readCodexCatalog({ models: [
    { id: 'gpt-image-2', visibility: 'hide', max_context_window: 32000 },
    { id: 'gemini-3.1-flash-image', visibility: 'hide', max_context_window: 32000 },
    { id: 'gemini-3.1-flash-lite', visibility: 'hide', max_context_window: 32000 },
    { id: 'gpt-image-2-mini', visibility: 'hide', max_context_window: 32000 },
    { id: 'gemini-3.1-flash-high', max_context_window: 32000 },
  ] }, { defaultContextWindow: 262144, defaultMaxTokens: 32768, defaultInput: ['text'] })

  assert.deepEqual(models.map((model) => model.id), [
    'gpt-image-2',
    'gemini-3.1-flash-image',
    'gemini-3.1-flash-high',
  ])
  assert.equal(isHiddenImageModel({ id: 'gpt-image-2', visibility: 'hide' }), true)
  assert.equal(isHiddenImageModel({ id: 'gemini-3.1-flash-image', visibility: 'hide' }), true)
  assert.equal(isHiddenImageModel({ id: 'gemini-3.1-flash-lite', visibility: 'hide' }), false)
  assert.equal(isHiddenImageModel({ id: 'gpt-image-2-mini', visibility: 'hide' }), false)
})

test('builds the Codex-compatible catalog URL', () => {
  assert.equal(
    catalogURL('http://127.0.0.1:8317/v1/'),
    'http://127.0.0.1:8317/v1/models?client_version=dsh-cpa-plugin',
  )
})

test('rejects malformed and empty catalogs', () => {
  assert.throws(() => readCodexCatalog({ data: [] }), /no "models" array/)
  assert.throws(() => readCodexCatalog({ models: [] }), /no usable models/)
})
