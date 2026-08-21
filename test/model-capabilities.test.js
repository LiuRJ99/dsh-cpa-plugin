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
