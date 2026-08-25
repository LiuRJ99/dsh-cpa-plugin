# Task 3 Report

Date: 2026-08-25

Changed files:

- `src/catalog.js`
- `src/client/cpa-model-select.tsx`
- `src/client/cpa-model-settings.tsx`
- `test/catalog.test.js`
- `test/client.test.js`

Design notes:

- Added one explicit image-only id set in `src/catalog.js` for `gpt-image-1.5`, `gpt-image-2`, and `gemini-3.1-flash-image`.
- Exported `isImageOnlyModel(value)` and reused it from both CPA selector and CPA settings instead of relying on suffix or alias inference.
- `modelProfileOf()` now marks only those explicit ids with `imageGeneration: true`; `isHiddenImageModel()` still re-admits hidden image routes for the Host catalog without treating `visibility` as a UI-only predicate.
- `cpa-model-select.tsx` now filters visible groups through the shared predicate, including empty-state handling when only image-only entries exist.
- `cpa-model-settings.tsx` now separates full `draft.models` from visible rows, maps visible indices back to full indices for edit/remove, and preserves non-editable image-only entries across discover/merge/save.
- Settings drafts now retain per-model extra fields so hidden image route metadata survives load/save cycles instead of being dropped during normalization.

Verification:

- `node --test test/catalog.test.js test/client.test.js` → exit `0`
- `npm run bundle` → exit `0`
- `npm run typecheck` → exit `2`
- Focused re-run after the final TS import suppression:
  - `node --test test/catalog.test.js test/client.test.js` → exit `0`
  - `npm run typecheck` → exit `2`

Known `npm run typecheck` baseline failures:

- Client module-resolution failures for missing declarations:
  - `@deepseek-ai/dsh-client-runtime/client`
  - `@deepseek-ai/dsh-client-ui-slots`
  - `@deepseek-ai/dsh-client-ui-model-selection/client`
  - `@deepseek-ai/dsh-client-connection/client`
  - `@deepseek-ai/dsh-client-ui-primitives`
  - `@deepseek-ai/dsh-client-ui-settings-plugins/client`
  - `@deepseek-ai/dsh-client-locale/client`
  - `@deepseek-ai/dsh-client-ui-conversation/client`
  - `@deepseek-ai/dsh-client-ui-settings/client`
  - `@deepseek-ai/dsh-client-connection`
- Existing implicit-`any` and related client typing errors remain in:
  - `src/client/cpa-account-indicator.tsx`
  - `src/client/cpa-client.ts`
  - `src/client/cpa-model-select.tsx`
  - `src/client/cpa-model-settings.tsx`
  - `src/client/cpa-settings-card.tsx`
  - `src/client/index.ts`
  - `src/index.ts`
- Existing non-module-resolution baseline example still present:
  - `src/client/cpa-client.ts(358,49): TS2345 Argument of type '{} | null' is not assignable to parameter of type 'string'.`

Concerns:

- `npm run bundle` refreshed generated `lib/client.js`, `lib/client.js.map`, and `lib/composed-client.js`; they were left out of this task commit because file ownership for Task 3 is limited to the source/test files above plus this report.
