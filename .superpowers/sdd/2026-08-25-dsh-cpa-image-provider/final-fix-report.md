# Final fix report

Date: 2026-08-25

## Changed files

- `src/image-generation.ts`
- `test/image-generation.test.js`
- `test/image-generation-addon.test.js`
- `src/index.ts`
- `test/index.test.js`
- `package.json`
- `package-lock.json`
- `lib/image-generation-internal.js`
- `lib/index.js`

The Host bundle artifacts were regenerated intentionally. `pnpm-lock.yaml` was checked and required no change because pnpm does not record the root package engine constraint; its `@earendil-works/pi-ai@0.82.1` package entry already declares Node `>=22.19.0`. Existing `.gitignore`, collaboration directories, and OpenSpec files were left untouched.

## Fixes

- Response `arrayBuffer()` and streaming `reader.read()` failures now map to stable `TRANSPORT` or `ABORTED` errors without exposing endpoint text, raw errors, or abort reasons. Downloaded unsupported media types cancel their response body before rejection.
- Capability-loaded image-only IDs are excluded from the fast model set, including aliases, while ordinary priority text models retain fast stream routing.
- Image-generation fixtures now use synthetic markers; tests assert credential resolver selection and Authorization header shape/presence rather than complete values.
- Package and npm lockfile engine constraints now require Node `>=22.19.0`.

## Verification actually run

- `npm run bundle` — pass.
- `node --test test/image-generation.test.js test/image-generation-addon.test.js test/index.test.js` — 35/35 pass.
- `npm install --package-lock-only --ignore-scripts` — pass.
- `pnpm install --lockfile-only --ignore-scripts` — pass.
- `npm ci --dry-run --ignore-scripts` — pass.
- `npm run typecheck:image-generation-contract` — pass.
- `npm test` — 58/58 pass.
- `npm run check` — syntax checks and 58/58 tests pass.
- `npm pack --dry-run` with an isolated npm cache — pass; 36 expected package files.
- Package/lock engine assertion and generated bundle-owner assertion — pass.
- Secret-like scans — no real credential patterns or complete Authorization fixture assertions; only the existing non-secret `PLACEHOLDER_AUTHORIZATION` sentinel matched the broad Bearer scan.

## Remaining limitations

- `npm run typecheck` remains exit 2 because of the pre-existing client module-resolution/implicit-`any` baseline and existing `src/index.ts` external-module callback diagnostics; the new catalog import does not add a diagnostic.
- `pnpm install --frozen-lockfile --offline --ignore-scripts` accepted the lockfile as current but could not finish because the local pnpm store lacks `@deepseek-ai/dsh-brand@0.1.0-rc.8`; this is an environment cache limitation.
- No real CPA GPT/Gemini smoke was run because no credential was available or used.
