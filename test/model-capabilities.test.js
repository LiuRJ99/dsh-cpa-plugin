import test from 'node:test'
import assert from 'node:assert/strict'
import { parseModelCapabilities } from '../lib/index.js'

test('parses CLIProxyAPI slugs and priority service tiers', () => {
  assert.deepEqual(parseModelCapabilities({ models: [
    {
      slug: 'gpt-5.6-sol',
      priority: 1,
      service_tiers: [{ id: 'priority', name: 'Fast', description: '1.5x speed, increased usage' }],
    },
  ] }), [{
    id: 'gpt-5.6-sol',
    serviceTiers: [{ id: 'priority', name: 'Fast', description: '1.5x speed, increased usage' }],
  }])
})

test('projects image capability metadata for the dedicated image catalog', () => {
  assert.deepEqual(parseModelCapabilities({ models: [
    {
      slug: 'gpt-image-2.5',
      display_name: 'GPT Image 2.5',
      image_generation: true,
      image_engine: 'gpt',
      image_edit: true,
    },
  ] }), [{
    id: 'gpt-image-2.5',
    name: 'GPT Image 2.5',
    serviceTiers: [],
    imageGeneration: true,
    imageEngine: 'gpt',
    imageEdit: true,
  }])
})

test('keeps slug, id, and model aliases for speed matching', () => {
  assert.deepEqual(parseModelCapabilities({ models: [
    {
      slug: 'luna-max',
      id: 'gpt-5.6-luna-max',
      model: 'gpt-5.6',
      service_tiers: [{ id: 'priority' }],
    },
  ] }), [{
    id: 'luna-max',
    aliases: ['gpt-5.6-luna-max', 'gpt-5.6'],
    serviceTiers: [{ id: 'priority' }],
  }])
})
