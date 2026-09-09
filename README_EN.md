# CLIProxyAPI Provider for DeepSeek Harness

English | [简体中文](./README.md)

Adds a `CLIProxyAPI` model provider based on the OpenAI Responses API to DeepSeek Harness.

The plugin automatically retrieves the model list from CLIProxyAPI, so models do not need to be added or maintained manually. This project is not published to npm; cross-machine installation must use an approved pinned Git commit or tarball.

## Usage

### Install from a pinned Git commit

```sh
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#<40-character-commit>"
```

Do not use `#main`, `@latest`, or a local `link:` from machine A. Install and verify the target on a candidate profile before promoting it to the formal `web` profile.

Start or restart DeepSeek Harness Web:

```sh
dsh --profile web
```

### Update an existing installation

Replace `<40-character-commit>` with a new, verified commit and run `dsh plugin add` again:

```sh
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#<new-40-character-commit>"
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

This project keeps only the following additions on top of the official CLIProxyAPI Provider:

### 1. Account quota display

- Shows account status, plan, account identity, and quota windows in Settings; Codex five-hour and weekly windows are shown separately when both are returned.
- Shows the current account and quota in the message composer.
- Clicking the account status strip lists and switches to other accounts that support the current model.
- Uses status colors and quota progress bars for available, quota-low, and unavailable accounts.
- Hides the composer account strip when no account supports the current model.

### 2. Speed modes

- Provides **Standard / Fast** modes for models that report the `priority` service tier.
- Fast mode is forwarded by the Harness Host; standard mode keeps the normal model request path.
- Availability depends on the model capability information returned by CLIProxyAPI.
- Supports slug and alias-based speed capability mapping while mirroring CPA session speed state in real time.
- Automatically invalidates stale speed capabilities during catalog refresh while preserving manually configured model capacities and parameters.
- Fully compatible with DeepSeek Harness RC.8+ Replay Envelopes and error classification.

### 3. Image Generation Service

- Exports the stable `./image-generation` entry contract and `dshCpaImageGeneration` service token for downstream consumers.
- Unified routing for GPT (`images/generations`) and Gemini (`chat/completions`) CPA image generation protocols.
- Projects image-model capabilities from the CPA catalog and exposes a redacted `listModels()` plus `model` validation to downstream consumers; new models in the same protocol family no longer require ImageGen ID changes. CPA metadata such as `image_generation`/`image_engine` is preferred, with compatibility support for the three legacy image IDs.
- Automatically filters image-only models from standard model selectors and settings to avoid conflicts with text conversation flows.

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
