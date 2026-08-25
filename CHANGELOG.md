# Changelog

All notable changes to this project will be documented in this file.

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
