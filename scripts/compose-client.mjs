import { readFile, writeFile } from 'node:fs/promises'

// Keep the upstream client.js readable and reviewable. The generated artifact
// only composes the original factory with the separately built additive client
// factory; it does not replace the upstream entry point in source.
const upstream = await readFile(new URL('../client.js', import.meta.url), 'utf8')
const additive = await readFile(new URL('../lib/client.js', import.meta.url), 'utf8')
await writeFile(new URL('../lib/composed-client.js', import.meta.url), `${upstream.trimEnd()}\n\n${additive}`)
