# CLIProxyAPI Provider for DeepSeek Harness

English | [简体中文](./README.md)

Adds a `CLIProxyAPI` model provider based on the OpenAI Responses API to DeepSeek Harness.

The plugin automatically retrieves the model list from CLIProxyAPI, so models do not need to be added or maintained manually. This project is not published to npm; cross-machine installation must use an approved pinned Git commit or tarball.

## Fork Enhancements (v0.4.3)

> This repository is a maintained and enhanced fork of [`router-for-me/dsh-cliproxyapi-provider`](https://github.com/router-for-me/dsh-cliproxyapi-provider) (maintained at [`LiuRJ99/dsh-cpa-plugin`](https://github.com/LiuRJ99/dsh-cpa-plugin), current version `v0.4.3`). While preserving the upstream provider core, it adds account quota visualization, speed modes, and the image-generation core service that downstream plugins consume.

### 1. Installation from this Fork

```bash
# Recommended: install the verified v0.4.3 Release Tag
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#v0.4.3"
```

Do not install this fork by bare package name or from `#main`.

### 2. Delta from upstream

| | upstream | this fork `v0.4.3` |
|---|---|---|
| Account quota UI | absent | Multi-window quota parsing, three-color progress bars, account switcher popup |
| Speed modes | absent | Standard / Fast switching on the `priority` service tier |
| Image-generation service | absent | Exports the `./image-generation` contract and the `dshCpaImageGeneration` service token |
| Reference-image editing | absent | An `edit()` contract covering both the GPT and Gemini protocol paths |
| Image-model discovery | absent | Projects image-model metadata dynamically from the CPA catalog |
| DSH `0.1.2-rc.1` compatibility | — | Adapted to the Replay Envelope and error-classification contract |

The individual enhancements are detailed under [Additive features](#additive-features) below.

### 3. Syncing with upstream

```bash
git remote add upstream https://github.com/router-for-me/dsh-cliproxyapi-provider.git
git fetch upstream
git merge upstream/main     # after merging, re-apply the fork's compatibility and quota-parsing fixes
pnpm run typecheck && pnpm run bundle
```

After any merge, re-verify that all three additive features still work — upstream has none of them, so a conflicting change will not surface as a merge conflict.

## Usage

### Install from a pinned Git release tag (Recommended)

```sh
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#v0.4.3"
```

Or install from a pinned Git commit:

```sh
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#<40-character-commit>"
```

Do not use `#main`, `@latest`, or a local `link:` from machine A. Install and verify the target on a candidate profile before promoting it to the formal `web` profile.

Start or restart DeepSeek Harness Web:

```sh
dsh --profile web
```

### Update an existing installation

Replace the tag or commit with a new, verified target and run `dsh plugin add` again:

```sh
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#v0.4.3"
```

Do not run an unscoped `dsh plugin --profile web update`, because it may update other plugins in the profile at the same time.

### Installation prerequisites

- The DSH Host must satisfy the peer compatibility range declared by this plugin.
- Node.js must satisfy `engines`; source builds use the pnpm version declared by this repository.
- pnpm 11 source installs use the boolean `allowBuilds` entries in this repository's `pnpm-workspace.yaml`.
- Allow the `@google/genai` and `protobufjs` install scripts only after confirming what they do.
- This workspace policy is not inherited by a DSH profile. If the target profile uses pnpm 11, configure the required build approvals in the profile's own `pnpm-workspace.yaml`.

### Configuration

After opening Harness:

1. Go to **Settings → Plugins → CLIProxyAPI**.
2. Enter the CLIProxyAPI **model API URL**, for example `http://localhost:8317/v1`.
3. Enter the model **API key**. Leave it empty if the service does not require authentication.
4. To display account status and quota, enter the CLIProxyAPI **Management Key** from `remote-management.secret-key`.
5. Choose the unified refresh interval: **manual, 5 minutes, 30 minutes, 1 hour, 3 hours, or 5 hours**. The default is 5 minutes.
6. Save the configuration.

The **Refresh** action synchronizes the model catalog, account status, and account quota through the Harness Host. Selecting **manual** disables automatic refresh but does not disable the manual Refresh action.

## Additive features

This project provides the following secondary developments and enhancements on top of the official CLIProxyAPI Provider:

### 1. Account quota & health display

- **Multi-window quota parsing**: Shows account status, subscription tier, account identity, and quota windows in Settings; Codex 5-hour and weekly windows are parsed concurrently and clearly labeled.
- **Composer indicator & sliding-window stats**: Displays current model account binding, quota progress bar, and recent sliding-window request statistics directly in the input composer, with responsive collapse on narrow layouts.
- **Account switcher popup**: Clicking the composer account status strip opens a switcher modal to view and switch between other available accounts supporting the current model.
- **Three-color health indicators**: Uses clear color indications (green for healthy, yellow for low quota, red for exhausted/unavailable) with progress bars.
- **Periodic host synchronization & stale warnings**: Polls host account snapshots periodically to keep the Web UI current, with explicit visual cues for stale refreshes or failed syncs.
- **Auto-hiding**: Automatically hides the composer status indicator when no account supports the selected model.

### 2. Speed modes (Dynamic service tiers)

- Provides seamless **Standard / Fast** mode switching for models supporting the `priority` service tier.
- Fast mode requests are forwarded by the Harness Host; standard mode preserves the default model execution path.
- Supports dynamic speed capability mapping via model slugs and aliases, mirroring CPA speed status in session runtime.
- Automatically invalidates stale speed capabilities during catalog refresh while preserving manually configured model capacities and parameters.
- Fully compatible with DeepSeek Harness 0.1.2 Replay Envelopes and error classification.

### 3. Image generation core service (CPA Image Service)

- **Unified service contract**: Exports the stable `./image-generation` entry contract and `dshCpaImageGeneration` service token for direct, credential-free downstream integration (e.g. by `dsh-image-gen`).
- **Dual protocol support**: Handles both GPT (`images/generations`) and Gemini (`chat/completions`) image generation protocols.
- **Dynamic CPA image model discovery**: Dynamically inspects and projects image model metadata from the CLIProxyAPI catalog, exposing redacted `listModels()` and model validation; new image models added upstream are recognized automatically without requiring downstream ImageGen plugin constant changes or updates.
- **Reference image & editing support**: Core service provides full support for the `edit` contract, accepting and parsing multiple conversation attachments / source images in sequence.
- **Model selector filtering**: Image-only models are automatically hidden from regular chat model selectors and settings to prevent accidental conversational misuse.

## Current test coverage

The following CLIProxyAPI channels have been tested in practice:

- **Antigravity**: account status and quota display.
- **Codex**: account status, quota display, and the speed-mode flow.

Other CLIProxyAPI channels have not been tested yet and are not guaranteed to work.

## Changelog

See [CHANGELOG.md](./CHANGELOG.md).

## Uninstall

```sh
dsh plugin --profile web remove @LiuRJ99/dsh-cpa-plugin
```

Restart DeepSeek Harness Web after uninstalling. The plugin does not modify the DeepSeek Harness or CLIProxyAPI source trees.

## Local development checks

```sh
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run typecheck:image-generation-contract
pnpm run bundle
pnpm run verify:package
pnpm run pack:github
```
