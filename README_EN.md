# CLIProxyAPI Provider for DeepSeek Harness

English | [简体中文](./README.md)

Adds a `CLIProxyAPI` model provider based on the OpenAI Responses API to DeepSeek Harness.

The plugin automatically retrieves the model list from CLIProxyAPI, so models do not need to be added or maintained manually.

## Usage

Install the plugin:

```powershell
npx @deepseek-ai/dsh plugin --profile web add github:LiuRJ99/dsh-cpa-plugin
```

Start or restart DeepSeek Harness Web:

```powershell
npx @deepseek-ai/dsh web
```

After opening Harness:

1. Go to **Settings → Plugins → CLIProxyAPI**.
2. Enter the CLIProxyAPI **API URL**, for example
   `http://127.0.0.1:8317/v1`.
3. Enter the **API key**. Leave it empty if the service does not require authentication.
4. Save the configuration. The model list will be retrieved automatically and refreshed periodically.

Uninstall the plugin:

```powershell
npx @deepseek-ai/dsh plugin --profile web remove @LiuRJ99/dsh-cpa-plugin
```

Restart DeepSeek Harness Web after uninstalling the plugin.
