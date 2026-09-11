# Changelog

All notable changes to this project will be documented in this file.

## [0.4.2] - 2026-09-11

### Changed

- Relaxed 15 `@deepseek-ai/dsh-*` peerDependencies to `>=0.1.2-rc.1 <0.2.0` to support newer DSH host versions.

## [0.4.1] - 2026-09-09

### Features

- Added dynamic CPA image-model selection without a second catalog owner: the existing Host capability cache now projects image metadata, the `dshCpaImageGeneration` service exposes an optional redacted `listModels()` catalog, and `generate()`/`edit()` accept a validated concrete `model` while retaining legacy engine defaults. GPT and Gemini remain protocol-family routes, so same-family models can be added without ImageGen model-ID changes.
- Added an optional backward-compatible `CpaImageGenerationService.edit()` capability with provider-neutral reference image bytes. GPT uses CLIProxyAPI `/v1/images/edits`; Gemini uses multimodal `/v1/chat/completions` content parts and preserves the existing `generate()` path.

### Packaging

- Pinned source builds to pnpm 11.7.0 and replaced the invalid `allowBuilds` placeholders with explicit boolean approvals for the required `@google/genai` and `protobufjs` hooks.
- Added package-entry/packlist verification and made the CI path use the same pnpm install and tarball flow consumed by DSH.

### Fixes

- **Switcher popup labels the quota window behind each percentage (弹窗显示额度类别)**: the account-switcher menu showed a bare figure (e.g. `77%`) without saying which quota window it belonged to. Each option now renders the category of the surfaced percentage — `5h`/`5小时` (five-hour window) or `Weekly limit`/`周限额` (weekly) — above the value, so a weekly fallback after an exhausted five-hour window is no longer indistinguishable from a five-hour figure. The picked window mirrors `accountQuotaPercent` exactly via the new `accountQuotaPercentEntry` helper.
- **Antigravity quota comes from the same daily endpoint the CPA panel uses (额度取数与后台一致)**: the quota summary was fetched from `cloudcode-pa.googleapis.com`, whose bucket fractions are stale (e.g. weekly 79% when the management panel shows 17%); `daily-cloudcode-pa.googleapis.com` returns the live values the panel displays. `fetchAccountQuota` now tries the daily endpoint first (then the daily sandbox, then the plain one as a fallback), so the composer/settings quota matches the CPA management page on every auto-refresh.
- **Failed quota refreshes are surfaced instead of silently reusing the last snapshot (刷新失败不再静默显示旧额度)**: transient upstream failures (502/429) made the Host drop the quota field and the client then re-merge the previous quota forever, so a user saw "100%/79%" while the account was really exhausted. The Host now marks such accounts `quotaStale` and the client keeps the old quota only as a visibly-stale fallback (tooltip: "额度刷新失败（显示上次结果）").
- **Transient CPA statuses no longer mask healthy accounts (error/429 不再误判不可用)**: `status: error|failed` from a failed probe, and historical 429 RESOURCE_EXHAUSTED payloads in `statusMessage`, made healthy accounts show as unavailable/quota-low. Availability now keys only on explicit credential states and on the account's quota windows for the selected model pool.
- **Composer shows a single quota figure, five-hour first (输入条显示单值：5小时优先)**: the account strip and the switcher menu display one percentage instead of "5小时 + 周限额" concatenations. Codex/Antigravity follow the same rule: prefer the five-hour window and use the weekly window only when five hours is absent or exhausted (0%), so a Codex Plus account shows its 5-hour 100% rather than the weekly 61% it previously reported as the minimum.
- **Composer quota reflects the model's pool on Antigravity accounts (输入条按模型池显示 Antigravity 额度)**: CPA's Antigravity quota payload splits its limits into per-model-family pools (`Gemini Models` vs `Claude and GPT models`), each carrying its own five-hour and weekly windows. The composer account indicator previously deduplicated those windows by kind across all pools and picked the lowest remaining value, so a Gemini session could display the Claude/GPT pool's quota (and vice versa) whenever one pool was lower. The indicator, its account-switcher menu, and the default-account picker now take the currently selected model's family into account and only surface that pool's windows, so switching between Gemini and Claude/GPT models shows the correct pool quota and availability. The settings page keeps showing every pool's windows, and a model scope that matches no pool label falls back to the whole window set instead of an empty quota. Covered by new unit tests for pool scoping and family classification.
- **Browser auto-refresh actually reaches the UI (Web 端自动刷新生效)**: the Host refreshed the model catalog and account/quota snapshot on its own timer, but the result only updated the Host's in-memory account cache — nothing pushed it to the Web client, so Settings and the composer indicator showed stale quota/status until a manual refresh. A new `CpaAutoRefresh` driver polls the Host's cached `/cpa accounts` snapshot on the configured interval (`5m/30m/1h/3h/5h`, Manual disables it), updating the shared client store so Settings cards and the composer account indicator stay current without user interaction. Interval changes re-arm the next tick immediately; background pull failures are silent and retried on the next tick; the driver is disposed with the client context.

## [0.4.0] - 2026-08-25

### Features

- **Codex dual quota windows (Codex 双额度窗口)**: `parseCodexQuota` now parses the five-hour and weekly Codex quota windows together instead of picking a single window, so the settings page and composer indicator can show both windows separately when CPA returns both. Window order stays correct across CPA/ChatGPT response versions via explicit window sizes when present (`limit_window_seconds`), falling back to the primary/secondary field order.

### Fixes & Improvements

- Default CPA endpoint switched from `http://127.0.0.1:8317` to `http://localhost:8317` (config default, addon fallback and web client base URL), matching the updated README guidance.
- Exported `parseCodexQuota` from `lib/index.js` so downstream consumers can reuse the quota parsing logic; covered by two new unit tests.

## [0.3.0] - 2026-08-25

### Features

- Added the public `./image-generation` entry for the `dshCpaImageGeneration` service contract so downstream consumers can import the stable image-generation types and service token.
- Added engine-only CPA image generation routing with the verified GPT `images/generations` path and Gemini `chat/completions` image path.

### Fixes & Improvements

- Explicitly filters image-only models from the regular CPA selector/settings flows while keeping the dedicated image-generation service path available.
- Keeps image ownership in a single CPA image service implementation and removes the legacy stream-owner interception from the public Host bundle.

## [0.2.0] - 2026-08-23

### Features

- **Image Generation Stream (图像生成流)**:
  - Added a dedicated CPA image-generation stream (`cpa-image-stream.js`) that owns `gpt-image-*` models (e.g. `gpt-image-2`, `gpt-image-1.5`) outside the text chat waterfall, with per-model `imageGeneration` capability flagging in the catalog.
  - Re-admitted hidden image-generation models from the upstream catalog (`visibility: 'hide'`) so the image stream path can serve them, while every other hidden model stays excluded by default (`includeHiddenImageModels` opt-in available).

### Fixes & Improvements

- **Self-contained pi-ai adapter boundary (pi-ai 适配层本地化)**:
  - Vendored the small `toPiContext` / `toStreamChunks` / replay compatibility slice into `src/pi-ai/` so the fast path no longer depends on unpublished TypeScript sources of the `@deepseek-ai/dsh-llm-pi-ai` package.
- **RC.8 dependency stand-alone install (依赖独立化)**:
  - Replaced local `link:` devDependencies with published `0.1.0-rc.8` versions so the plugin installs cleanly from GitHub without workspace links.

---

## [0.1.0] - 2026-08-21

### Features

- **Account Quota & Status Display (账号额度与状态显示)**:
  - Added account quota, subscription tier, and identity cards in CLIProxyAPI settings.
  - Added composer input account indicator with real-time quota progress bar and one-click account switcher.
  - Added unified catalog and quota synchronization with configurable auto-refresh intervals (manual, 5m, 30m, 1h, 3h, 5h).
- **Speed Mode & Dynamic Service Tiers (速度模式与动态服务等级)**:
  - Added Standard / Fast speed mode switching for models supporting the `priority` service tier.
  - Implemented Host-side Fast stream routing for low-latency responses.
  - Mirrored CPA session speed state dynamically across execution contexts.

### Fixes & Improvements

- **Model Identity & Aliases (模型别名与标识匹配)**:
  - Supported model slug and identity alias mapping for accurate capability matching across varied naming conventions.
- **Speed Capabilities Lifecycle (速度能力生命周期管理)**:
  - Added automatic invalidation of stale speed capabilities upon catalog refresh.
  - Supported parsing of slug-based speed capability definitions.
- **Configuration Preservation (手动配置参数保护)**:
  - Preserved manually customized model capacities and context window limits during catalog synchronization.
- **DeepSeek Harness RC.8 Compatibility (DSH RC.8 兼容性升级)**:
  - Upgraded dependencies and peerDependencies to `0.1.0-rc.8`.
  - Adapted to the v2 Replay Envelope structure and graceful replay degradation.
  - Added HTTP 413 / payload-too-large error classification and context overflow handling.
- **Standalone GitHub Installation (GitHub 独立安装)**:
  - Cleaned up local workspace link dependencies for seamless GitHub-based installation.

---

## [0.0.1] - 2026-08-17

### Initial Release

- Initial implementation of the CLIProxyAPI provider for DeepSeek Harness.
- Automatic model catalog discovery from CLIProxyAPI endpoint.
- Web client settings integration for CLIProxyAPI provider configuration.
