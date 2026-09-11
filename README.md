# CLIProxyAPI Provider for DeepSeek Harness

[English](./README_EN.md) | 简体中文

为 DeepSeek Harness 添加一个基于 OpenAI Responses API 的 `CLIProxyAPI` 模型供应商。

插件会自动从 CLIProxyAPI 获取模型列表，无需手动添加或维护模型。本项目不发布到 npm，跨机器安装必须使用经过验证的固定 Git commit 或 tarball。

## Fork 增强特性（v0.4.3）

> 本项目为 [`router-for-me/dsh-cliproxyapi-provider`](https://github.com/router-for-me/dsh-cliproxyapi-provider) 的维护与增强分支（维护仓库：[`LiuRJ99/dsh-cpa-plugin`](https://github.com/LiuRJ99/dsh-cpa-plugin)，当前版本 `v0.4.3`）。在保留上游 Provider 基础能力的前提下，重点补齐账号额度可视化、速度模式、以及供下游插件消费的图像生成底座服务。

### 1. 本 Fork 安装方式

```bash
# 推荐：安装经过完整验证的 v0.4.3 Release Tag
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#v0.4.3"
```

不要使用裸包名或 `#main` 安装本 fork。

### 2. 与上游的差异

| | 上游 | 本 fork `v0.4.3` |
|---|---|---|
| 账号额度界面 | 无 | 多窗口额度解析 + 三色进度条 + 账号切换弹窗 |
| 速度模式 | 无 | `priority` 服务等级的标准/快速切换 |
| 图像生成服务 | 无 | 导出 `./image-generation` 契约与 `dshCpaImageGeneration` 服务标识 |
| 参考图编辑 | 无 | `edit()` 契约，统一承接 GPT 与 Gemini 双协议 |
| 图片模型发现 | 无 | 从 CPA 目录动态投影图片模型元数据 |
| DSH `0.1.2-rc.1` 兼容 | — | 已适配 Replay Envelope 与错误分类机制 |

具体增强条目见下方 [二次开发功能](#二次开发功能)。

### 3. 与上游同步

```bash
git remote add upstream https://github.com/router-for-me/dsh-cliproxyapi-provider.git
git fetch upstream
git merge upstream/main     # 合并后必须重新叠加本 fork 的兼容声明与额度解析修复
pnpm run typecheck && pnpm run bundle
```

合并后请回归验证「二次开发功能」三条增强仍然可用——上游没有这些能力，冲突不会自动暴露。

## 使用方式

### 从固定 Git Release Tag 安装（推荐）

```sh
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#v0.4.3"
```

也可以从固定 Git commit 安装：

```sh
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#<40位commit>"
```

不要使用 `#main`、`@latest` 或 A 机器 profile 中的本地 `link:`。目标机器必须先在 candidate profile 中完成安装和验证，再迁移到正式 `web` profile。

启动或重启 DeepSeek Harness Web：

```sh
dsh --profile web
```

### 更新已有安装

更新时将版本 tag 或 commit 替换为新的已验证目标，并重新执行 `dsh plugin add`：

```sh
dsh plugin --profile web add "github:LiuRJ99/dsh-cpa-plugin#v0.4.3"
```

不要使用无差别的 `dsh plugin --profile web update`，因为它可能同时更新 profile 中的其他插件。

### 安装前提

- DSH Host 必须满足当前插件声明的 peer 兼容范围；
- Node.js 必须满足 `engines`，源码构建使用仓库声明的 pnpm 版本；
- pnpm 11 源码安装使用本仓库 `pnpm-workspace.yaml` 中的布尔 `allowBuilds`；
- `@google/genai` 和 `protobufjs` 的安装脚本只在确认其用途后允许执行；
- 该 workspace 的构建策略不会自动传递给 DSH profile。若目标 profile 使用 pnpm 11，必须在 profile 自己的 `pnpm-workspace.yaml` 配置所需的构建授权。

### 配置

打开 Harness 后：

1. 进入 **设置 → 插件 → CLIProxyAPI**。
2. 填写 CLIProxyAPI 的**模型 API 地址**，例如 `http://localhost:8317/v1`。
3. 填写模型调用 **API Key**；无鉴权服务可以留空。
4. 如需账号状态和额度，填写 CLIProxyAPI 的 **Management Key**，对应 `remote-management.secret-key`。
5. 选择统一刷新频率：**手动、5 分钟、30 分钟、1 小时、3 小时或 5 小时**。默认是 5 分钟。
6. 保存配置。

“刷新”会由 Harness Host 侧统一同步模型列表、账号状态和账号额度。选择“手动”只关闭自动刷新，不影响手动点击“刷新”。

## 二次开发功能

本项目在官方 CLIProxyAPI Provider 基础上提供以下二次开发与增强特性：

### 1. 账号额度与健康状态展示

- **多窗口额度解析**：在设置页清晰展示账号状态、套餐、身份和额度窗口；针对 Codex 同时存在的 **5 小时窗口**与**周额度窗口**进行并发解析并分别标注周期。
- **输入栏常驻状态与滑动窗口统计**：在消息输入框显示当前模型绑定的账号状态、额度进度条与近期滑动窗口请求统计，并提供响应式折叠优化。
- **账号快速切换弹窗**：点击账号状态条可呼出切换面板（Account Switcher Popup），实时查看并切换到支持当前模型的其他可用账号。
- **健康度与三色进度条**：使用绿色（充足）、黄色（偏低）、红色（耗尽/不可用）直观展示各账号额度水位。
- **实时同步与陈旧提示**：定期轮询 Host 账号快照以保证 Web UI 额度最新，检测到刷新失效或陈旧数据时明确标注 Stale 状态。
- **智能隐藏**：无账号支持当前模型时，输入栏状态指示器自动静默隐藏。

### 2. 速度模式（Dynamic Service Tiers）

- 对支持 `priority` 服务等级的模型提供“标准 / 快速”模式无缝切换。
- 快速模式由 Harness Host 侧转发，普通模式不改变原有模型请求流程。
- 支持基于模型 slug 与动态别名映射速度能力，并在会话中实时镜像 CPA 速度状态。
- 模型目录刷新时自动清理与失效过期的速度能力，同时完整保留用户手动配置的模型容量与参数。
- 深度适配 DeepSeek Harness 0.1.2 的 Replay Envelope 与错误分类机制。

### 3. 图像生成底座服务（CPA Image Service）

- **统一服务契约**：导出稳定的 `./image-generation` 入口契约与 `dshCpaImageGeneration` 服务标识，供下游消费方（如 `dsh-image-gen`）免凭据直接集成。
- **双引擎协议承接**：统一承接 GPT (`images/generations`) 与 Gemini (`chat/completions`) 双路 CPA 图像生成协议。
- **动态图片模型发现（Dynamic CPA Image Models）**：自动从 CLIProxyAPI 模型目录动态提取并投影图片模型元数据，向下游提供脱敏的 `listModels()` 与 `model` 校验；CPA 服务端新增同协议图片模型时，无需 ImageGen 等下游插件重新硬编码或发布新版本即可直接感知与使用。
- **参考图与垫图编辑能力**：核心服务打通图片修改链路，支持 `edit` 契约，自动接收并提取多张前置参考图/附件传递给上游 API。
- **模型选择器隔离**：在常规文本对话模型选择器与设置中自动过滤仅图像模型（Image-only models），避免与文本对话流冲突。

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
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm run typecheck:image-generation-contract
pnpm run bundle
pnpm run verify:package
pnpm run pack:github
```
