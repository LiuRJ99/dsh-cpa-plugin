import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))

const clientExternals = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-web-react',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-connection/client',
  '@deepseek-ai/dsh-client-runtime/client',
]

const host = {
  name: 'dsh-cpa-plugin/addon',
  entry: {
    index: resolve(here, 'src/index.ts'),
    'image-generation': resolve(here, 'src/image-generation-public.ts'),
    'image-generation-internal': resolve(here, 'src/image-generation.ts'),
  },
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  clean: true,
  dts: false,
  deps: {
    // Keep the shipped Host artifact focused on plugin-owned logic. The local
    // `src/pi-ai/*` compatibility shims are bundled, but the published runtime
    // packages stay external so their transitive OpenAI Images SDK code does
    // not become a second shipped image-network owner inside lib/index.js.
    neverBundle: [
      /^@deepseek-ai\/dsh-llm-pi-ai(?:\/|$)/,
      /^@earendil-works\/pi-ai(?:\/|$)/,
    ],
  },
}

const client = {
  name: 'dsh-cpa-plugin/legacy-client-addon',
  entry: { client: resolve(here, 'src/client/index.ts') },
  outDir: 'lib',
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  fixedExtension: false,
  clean: false,
  dts: false,
  sourcemap: true,
  deps: {
    neverBundle: clientExternals,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV ?? 'production'),
  },
  outputOptions: {
    entryFileNames: 'client.js',
    banner: 'window.__ModuleLoader__.load({ id: "@LiuRJ99/dsh-cpa-plugin/legacy-client-addon", factory: (require) => {',
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default [host, client]
