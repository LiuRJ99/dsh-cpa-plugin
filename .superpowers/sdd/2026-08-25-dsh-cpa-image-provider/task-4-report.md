# Task 4 Report

Date: 2026-08-25

Modified files:

- `src/index.js`
- `test/index.test.js`
- `.superpowers/sdd/2026-08-25-dsh-cpa-image-provider/task-4-report.md`

Deleted files:

- `src/cpa-image-stream.js`
- `test/cpa-image-stream.test.js`

Verification commands:

- `node --test test/index.test.js test/cpa-image-stream.test.js`
  - exit code: `1`
  - result: pre-deletion baseline failure in existing `test/cpa-image-stream.test.js` assertion `modelProfileOf flags imageGeneration for mini/hd variants`; used only as red/baseline evidence before deletion.
- `rg -n "cpa-image-stream" -S src test lib`
  - exit code: `1`
  - result: no production or test references remain.
- `node --test test/index.test.js test/image-generation.test.js test/image-generation-addon.test.js`
  - exit code: `0`
  - result: targeted post-deletion regression suite passed, including `llm/stream` next/sentinel checks for `gpt-image-2` and a normal text model.
- `npm test`
  - exit code: `0`
  - result: full Node test suite passed.
- `npm run typecheck`
  - exit code: `2`
  - result: existing baseline failures remain in client TypeScript sources, including unresolved `@deepseek-ai/dsh-client-*` modules and multiple implicit-`any` diagnostics; no Task 4 files appear in the failure list.
- `npm run bundle`
  - exit code: `0`
  - result: bundle completed successfully.

Existing failures:

- `npm run typecheck` still fails on pre-existing client-side module resolution and implicit-`any` errors in `src/client/*.tsx`, `src/client/*.ts`, and `src/index.ts`.

Concerns:

- `npm run bundle` refreshed generated client artifacts such as `lib/client.js`, `lib/client.js.map`, and `lib/composed-client.js`; per task instructions these files were left unstaged and excluded from the Task 4 commit.
- The old `llm/stream` image owner has been removed entirely; image network requests are now owned only by the CPA image service bundle (`src/image-generation.ts` / `lib/image-generation-internal.js`).

## Fix Round 1 — shipped Host artifact single-owner contract

Fix summary:

- Adjusted Host bundling to keep `@deepseek-ai/dsh-llm-pi-ai` and `@earendil-works/pi-ai` external at runtime while still bundling the plugin-owned `src/pi-ai/*` compatibility seam.
- Promoted `@earendil-works/pi-ai` from dev-only to runtime dependency because the rebuilt Host artifact now imports it directly instead of inlining it.
- Added a build-level regression in `test/index.test.js` that reads generated `lib/index.js` and `lib/image-generation-internal.js` to assert:
  - shipped `lib/index.js` does not contain bundled `openai/resources/images.mjs`, `Images.generate()`, or `"/images/generations"` via the OpenAI SDK owner;
  - shipped `lib/image-generation-internal.js` still contains the CPA image service implementation for `/images/generations`.

Fix round modified files:

- `tsdown.config.mjs`
- `package.json`
- `test/index.test.js`
- `lib/index.js`
- `.superpowers/sdd/2026-08-25-dsh-cpa-image-provider/task-4-report.md`

Fix round verification commands:

- `npm run bundle`
  - exit code: `0`
  - result: regenerated `lib/index.js` shrank from the previously inlined bundle to an external-import Host artifact and no longer contains the bundled OpenAI Images SDK implementation.
- `npm test`
  - exit code: `0`
  - result: full suite passed, including the new build-level artifact contract test.
- `node --test test/index.test.js test/image-generation.test.js test/image-generation-addon.test.js`
  - exit code: `0`
  - result: targeted suite passed, including `llm/stream` fallthrough regressions and the new artifact-owner assertion.
- `npm run typecheck`
  - exit code: `2`
  - result: same pre-existing baseline failures remain in `src/client/*` and `src/index.ts` for missing client module declarations and implicit-`any`; no new build-boundary-specific type failures were introduced.

Residual concern:

- `npm run bundle` still refreshes `lib/client.js`, `lib/client.js.map`, and `lib/composed-client.js`; these remain intentionally unstaged for this fix round.

## Fix Round 2 — runtime dependency lockfile closure

Fix summary:

- Synchronized `package-lock.json` and `pnpm-lock.yaml` with `package.json` after `@earendil-works/pi-ai` was promoted to a runtime dependency in Fix Round 1.
- Kept the previous Host bundle externalization, build-level artifact regression, and Task 4 `llm/stream` ownership removal intact; this round only closes the package delivery gap between manifest and lockfiles.

Fix round modified files:

- `package-lock.json`
- `pnpm-lock.yaml`
- `.superpowers/sdd/2026-08-25-dsh-cpa-image-provider/task-4-report.md`

Fix round lockfile update commands:

- `npm install --package-lock-only --ignore-scripts`
  - exit code: `0`
  - result: refreshed `package-lock.json` so the root package `dependencies` now include `@earendil-works/pi-ai`, removing the old dev-only mismatch.
- `pnpm install --lockfile-only --ignore-scripts`
  - exit code: `0`
  - result: refreshed `pnpm-lock.yaml` so the root importer now lists `@earendil-works/pi-ai` under production `dependencies`.

Fix round frozen-install style verification:

- `npm ci --dry-run --ignore-scripts`
  - exit code: `0`
  - result: npm lockfile and manifest are consistent for a clean install flow.
- `pnpm install --frozen-lockfile --offline --ignore-scripts`
  - exit code: `1`
  - result: lockfile was accepted as up to date, then installation stopped with `ERR_PNPM_NO_OFFLINE_TARBALL` because `@deepseek-ai/dsh-brand@0.1.0-rc.8` was missing from the local pnpm store; this is an environment cache limitation, not a lockfile mismatch.

Fix round build/test verification:

- `npm run bundle`
  - exit code: `0`
  - result: Host artifact rebuild still succeeds after the lockfile changes.
- `npm test`
  - exit code: `0`
  - result: full test suite passed, including the build-level assertion that `lib/index.js` no longer ships the OpenAI Images SDK owner.

Residual concern:

- `pnpm --offline` frozen-install verification remains limited by local store contents; the lockfile itself is current, but a fully offline install still needs the missing tarball to already exist in the pnpm cache.
