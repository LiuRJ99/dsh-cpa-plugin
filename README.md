# CLIProxyAPI Provider for DeepSeek Harness

[English](./README_EN.md) | 简体中文

为 DeepSeek Harness 添加一个基于 OpenAI Responses API 的 `CLIProxyAPI` 模型供应商。

插件会自动从 CLIProxyAPI 获取模型列表，无需手动添加或维护模型。

## 使用方式

安装插件：

```powershell
npx @deepseek-ai/dsh plugin --profile web add github:LiuRJ99/dsh-cpa-plugin
```

启动或重启 DeepSeek Harness Web：

```powershell
npx @deepseek-ai/dsh web
```

打开 Harness 后：

1. 进入 **设置 → 插件 → CLIProxyAPI**。
2. 填写 CLIProxyAPI 的 **API 地址**，例如
   `http://127.0.0.1:8317/v1`。
3. 填写 **API 密钥**；无鉴权服务可以留空。
4. 保存配置，模型列表会自动获取并定期刷新。

卸载插件：

```powershell
npx @deepseek-ai/dsh plugin --profile web remove @LiuRJ99/dsh-cpa-plugin
```

卸载后重启 DeepSeek Harness Web 即可。
