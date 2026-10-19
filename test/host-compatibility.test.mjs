import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import test from 'node:test'
import assert from 'node:assert/strict'

const require = createRequire(import.meta.url)
const semver = require('semver')
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
const hostRanges = [manifest.engines.dsh, manifest.dsh.compatibility.dsh,
  ...Object.entries(manifest.peerDependencies ?? {})
    .filter(([name]) => name === '@deepseek-ai/dsh' || name.startsWith('@deepseek-ai/dsh-'))
    .map(([, range]) => range)]

// This checks admission policy, not runtime compatibility of hypothetical Hosts.
test('a newer Host remains eligible without a plugin release for each RC', () => {
  for (const host of ['0.2.0-rc.2', '0.2.1-rc.1', '0.2.1-rc.2', '0.2.1-rc.9', '0.2.2-alpha.1', '0.3.0-rc.1', '1.0.0']) {
    for (const range of hostRanges) {
      assert.equal(semver.satisfies(host, range, { includePrerelease: true }), true, `${host} must remain eligible under ${range}`)
    }
  }
})

test('the known minimum Host requirement remains enforced', () => {
  for (const range of hostRanges) {
    assert.equal(semver.satisfies('0.1.7-rc.1', range, { includePrerelease: true }), false)
  }
})
