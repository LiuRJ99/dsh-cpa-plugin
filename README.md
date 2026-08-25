# CLIProxyAPI Provider for DeepSeek Harness

[English](./README_EN.md) | 简体中文

为 DeepSeek Harness 添加一个基于 OpenAI Responses API 的 `CLIProxyAPI` 模型供应商。

插件会自动从 CLIProxyAPI 获取模型列表，无需手动添加或维护模型。本项目不发布到 npm，安装时直接从 GitHub 仓库获取。

## 使用方式

### 从 GitHub 安装

```sh
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#main"
```

启动或重启 DeepSeek Harness Web：

```sh
dsh --profile web
```

如果已经安装过插件，更新 GitHub 版本：

```sh
dsh plugin --profile web update
```

### 配置

打开 Harness 后：

1. 进入 **设置 → 插件 → CLIProxyAPI**。
2. 填写 CLIProxyAPI 的**模型 API 地址**，例如 `http://127.0.0.1:8317/v1`。
3. 填写模型调用 **API Key**；无鉴权服务可以留空。
4. 如需账号状态和额度，填写 CLIProxyAPI 的 **Management Key**，对应 `remote-management.secret-key`。
5. 选择统一刷新频率：**手动、5 分钟、30 分钟、1 小时、3 小时或 5 小时**。默认是 5 分钟。
6. 保存配置。

“刷新”会由 Harness Host 侧统一同步模型列表、账号状态和账号额度。选择“手动”只关闭自动刷新，不影响手动点击“刷新”。

## 二次开发功能

本项目在官方 CLIProxyAPI Provider 基础上只保留以下二次开发功能：

### 1. 账号额度显示

- 在设置页显示账号状态、套餐、账号身份和额度窗口。
- 在消息输入栏显示当前模型对应的账号和额度。
- 点击账号状态条可以查看并切换到其他支持当前模型的账号。
- 使用绿色、黄色、红色状态和额度进度条展示可用、额度偏低和不可用状态。
- 没有账号支持当前模型时，输入栏账号状态条自动隐藏。

### 2. 速度模式

- 对支持 `priority` 服务等级的模型提供“标准 / 快速”模式。
- 快速模式由 Harness Host 侧转发，普通模式不改变原有模型请求流程。
- 具体可用性取决于 CLIProxyAPI 返回的模型能力信息。
- 支持基于模型 slug/别名映射速度能力，并在会话中实时镜像 CPA 速度状态。
- 模型目录刷新时自动清理与失效过期的速度能力，同时完整保留用户手动配置的模型容量与参数。
- 深度适配 DeepSeek Harness RC.8+ 的 Replay Envelope 与错误分类机制。

### 3. 图像生成服务

- 导出稳定的 `./image-generation` 入口契约与 `dshCpaImageGeneration` 服务标识，供下游消费方直接集成。
- 统一承接 GPT (`images/generations`) 与 Gemini (`chat/completions`) 双路 CPA 图像生成协议。
- 在常规模型选择器与设置中自动过滤仅图像模型（Image-only models），避免与文本对话流冲突。

## 当前测试范围

目前只实际测试过以下 CLIProxyAPI 渠道：

- **Antigravity**：账号状态、额度显示。
- **Codex**：账号状态、额度显示和速度模式相关流程。

其他 CLIProxyAPI 渠道尚未完成测试，不对其行为做保证。

## 版本记录

详见 [CHANGELOG.md](./CHANGELOG.md)。

## 卸载

```sh
dsh plugin --profile web remove @LiuRJ99/dsh-cpa-plugin
```

卸载后重启 DeepSeek Harness Web 即可。插件不会修改 DeepSeek Harness 或 CLIProxyAPI 源码。

## 本地开发检查

```sh
pnpm install
pnpm run typecheck
pnpm run test
pnpm run bundle
```
