---
comet_change: dsh-cpa-image-provider
role: technical-design
canonical_spec: openspec
---

# dsh-cpa-image-provider 深度技术设计

## 1. 设计范围与约束

本设计深化同一 change 下的两个 OpenSpec 能力：`cpa-image-generation` 与 `cpa-model-capability-filtering`。目标是让 `dsh-cpa-plugin` 成为 GPT Image 2 和 Gemini Image 的唯一 Host 网络所有者，并向下游原生 ImageGen 插件提供引擎级服务。

已确认的约束：

- 下游只能选择 `engine: 'gpt' | 'gemini'`，不能传 raw model ID。
- 默认引擎由下游配置控制，默认值为 `gpt`；用户可以手动切换为 `gemini`。
- GPT 映射 `gpt-image-2` 与 `/v1/images/generations`。
- Gemini 映射 `gemini-3.1-flash-image` 与非流式 `/v1/chat/completions`。
- CPA route 和凭据由 Host 每次调用动态解析；下游永远不接触 key、endpoint 或供应商协议。
- 普通模型选择器隐藏生图专用模型，但图片服务可以独立使用这些模型。
- 不实现 GPT/Gemini 自动 fallback、参考图编辑、多图输出、视频输入或自动能力发现。

## 2. 当前代码边界

当前包有两个 Host 层：

1. `src/index.js` 是主 Provider 入口，负责模型目录、profile 同步，并加载构建后的 `lib/index.js` add-on。
2. `src/index.ts` 由 `tsdown` 构建为 add-on，已经使用 `ctx.provide` 注册模型能力和执行能力服务，并通过 `effectiveConfig`、`cpaFastRoute` 和 `readCredential` 读取运行时配置。

旧的 `src/cpa-image-stream.js` 在 `src/index.js` 中注册 `llm/stream` 拦截，只能处理 GPT Image 的生成流。它不适合继续承载 Gemini 的 assistant 图片响应，也会让普通聊天模型选择路径拥有一份图片网络逻辑。

因此服务实现放在 typed add-on 中，主 Provider 只负责加载 add-on 和保留普通模型能力；图片请求的网络所有权迁移到新模块。

## 3. 公共服务契约

`src/image-generation.ts` 定义唯一公共契约：

```ts
export const IMAGE_GENERATION_SERVICE = 'dshCpaImageGeneration'

export type ImageEngine = 'gpt' | 'gemini'

export interface CpaImageGenerationRequest {
  engine: ImageEngine
  prompt: string
  aspectRatio?: string
  imageSize?: string
  size?: string
  signal: AbortSignal
}

export interface CpaGeneratedImage {
  data: Uint8Array
  mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
}

export interface CpaImageGenerationService {
  generate(request: CpaImageGenerationRequest): Promise<CpaGeneratedImage>
}
```

`CpaImageGenerationRequest` 的可选尺寸字段用于保持下游工具契约的扩展性。Gemini 的 `aspectRatio` 和 `imageSize` 通过 CLIProxyAPI 已支持的 `image_config` 扩展映射到原生 `generationConfig.imageConfig`；通用 `size` 字段仅适用于其他引擎，在 Gemini 请求中忽略。

服务契约和运行时实现通过 `./image-generation` 子路径发布。源代码保持单一实现，`lib/index.js` 中的 add-on 和独立子路径构建不得各自维护一套请求解析逻辑。

## 4. 服务注册与动态 route

在 `src/index.ts` 的 `apply` 内注册服务：

```ts
ctx.provide(IMAGE_GENERATION_SERVICE, {
  generate: request => generateCpaImage(
    request,
    () => cpaFastRoute(ctx, effectiveConfig(ctx, config)),
    readCredential,
  ),
} satisfies CpaImageGenerationService)
```

实现要点：

- `generate` 执行时才调用 route resolver；不在 `apply` 时读取 endpoint、model profile 或 key。
- route 不存在、API 类型不是 CPA 支持的 OpenAI-compatible 路由，或 `apiKeyEnv` 不能解析时，立即返回可诊断错误。
- `readCredential` 仍复用现有 `ctx.inject(['credentials'])` 逻辑；key 只进入 Host 的 `fetch` headers。
- route 的 base URL 统一去除末尾斜杠，并按当前 profile 是否已有 `/v1` 追加 endpoint，避免重复 `/v1`。
- `AbortSignal` 贯穿 route 请求、超时控制、response body 读取和下游解析。

主 `src/index.js` 移除 `isImageGenerationModel`、`streamCpaImage` 导入和对应的 `llm/stream` listener，但继续调用 `applyCpaAddon`，使 add-on 服务在下游插件注入前完成注册。

## 5. 两条请求协议

### 5.1 GPT Image

请求：

```json
{
  "model": "gpt-image-2",
  "prompt": "...",
  "n": 1,
  "output_format": "png",
  "size": "1024x1024",
  "quality": "auto"
}
```

目标路径为 `/images/generations`。解析顺序保持旧实现兼容：优先读取 `data[].b64_json`，同时支持已有的 `data[].url` 形式。Base64 或 URL 结果统一转换为 `Uint8Array`，媒体类型根据输出格式或 data URL 推断。

### 5.2 Gemini Image

请求使用已经验证的最小 OpenAI-compatible envelope：

```json
{
  "model": "gemini-3.1-flash-image",
  "messages": [
    { "role": "user", "content": "..." }
  ],
  "stream": false
}
```

解析 `choices[0].message.images[]`，读取其中的 `image_url.url`。当前已验证的返回值是 `data:image/jpeg;base64,...`；只接受允许的图片媒体类型并转换为标准化图片结果。Gemini 的文本 `content` 不能作为成功图片结果。

## 6. 响应、错误与安全处理

请求发送和响应读取集中在 `image-generation.ts`，不复用已经绑定 `llm/stream` chunk 语义的旧 generator。

处理顺序：

1. 检查 prompt 非空和 signal 是否已取消。
2. 动态解析 route，再解析 key。
3. 发送带 `content-type`、`accept`、CPA attribution 和 Host-only `Authorization` 的请求。
4. 有界读取 response body，解析 JSON；非 2xx 只保留 HTTP 状态和截断后的上游错误。
5. 从对应协议提取图片，校验 Base64、媒体类型和字节数。
6. 返回完整 `CpaGeneratedImage`；任何失败都不返回部分数据。

必须覆盖的失败：

- route 不存在或凭据为空；
- HTTP 401/403/429/5xx；
- body 不是合法 JSON；
- 成功响应没有图片；
- data URL 媒体类型不受支持；
- Base64 解码失败或响应超过限制；
- `AbortSignal` 在网络或读取过程中取消。

错误中不得出现 API key、Authorization Header、完整上游 body 或完整 data URL。日志只记录状态、协议分支和有限的解析原因。

## 7. 模型能力与界面过滤

在 `src/catalog.js` 中维护显式的 image-only ID 集合：

```js
const IMAGE_ONLY_MODEL_IDS = new Set([
  'gpt-image-1.5',
  'gpt-image-2',
  'gemini-3.1-flash-image',
])
```

`modelProfileOf` 为这些 ID 设置 `imageGeneration: true`。`isImageOnlyModel` 作为唯一展示过滤谓词，供：

- `src/client/cpa-model-select.tsx` 的普通选择行过滤；
- `src/client/cpa-model-settings.tsx` 的可编辑模型行过滤。

不得按 `-high`、`-low`、`-agent` 或 `-extra-low` 后缀推断图片能力。`gemini-3.1-flash-lite` 必须继续进入普通选择器。服务注册和引擎映射不能读取过滤后的 UI 列表。

## 8. 包构建与导出

调整 `tsdown.config.mjs` 的 Host entry，使 `src/image-generation.ts` 产生稳定的 `lib/image-generation.js` 子路径产物，同时保持 `lib/index.js` add-on 入口。`package.json` 增加：

```json
"./image-generation": {
  "types": "./src/image-generation.ts",
  "import": "./lib/image-generation.js"
}
```

如果构建链可以稳定生成声明文件，优先将 `types` 指向对应 `.d.ts`；否则保留已纳入发布包的源类型路径，并在下游 TypeScript contract test 中验证类型可解析。该选择不改变运行时服务名和接口。

`src/cpa-image-stream.js` 删除前，先将仍然需要的 GPT 解码测试迁移到 `test/image-generation.test.js`。不得在新模块和旧模块中同时保留两个可发送图片请求的实现。

## 9. 测试设计

### 服务测试

新增 `test/image-generation.test.js`，使用依赖注入的 `fetchImpl` 和 credential resolver，至少覆盖：

- GPT 请求 URL、model、prompt、`n`、size、format 和 `b64_json` 解析；
- GPT URL 响应兼容性；
- Gemini 请求 URL、model、`messages`、`stream: false` 和 data URL 解析；
- 成功但无图片、非法 JSON、HTTP 错误和未知媒体类型；
- credential resolver 返回空值时不发出请求，错误不包含 key；
- fetch 被 abort 时原样传播取消原因。

### 模型与客户端测试

更新 `test/catalog.test.js` 和 `test/client.test.js`：

- image-only ID 标记正确；
- `gemini-3.1-flash-lite` 不被标记；
- 只包含图片模型的组不产生普通选择行；
- 普通 Gemini 模型仍产生选择行；
- image service 的引擎调用不依赖选择器输出。

### Provider 回归测试

更新 `test/index.test.js`，使用 fake `llm/stream` 请求证明图片请求会调用下一个 middleware，不再由 Provider 主路径发送 `/images/generations`。同时保留普通 discovery、profile 同步和文本请求已有测试。

### 构建与真实联调

执行：

```bash
npm test
npm run typecheck
npm run bundle
npm run check
```

构建通过后，使用本地 CPA relay 对两个引擎各执行一次 Host 级 smoke test。验证内容只包括请求路径、HTTP 成功、标准化媒体类型和非空图片字节；密钥、完整响应和生成图片不进入日志、测试 fixture 或提交。

## 10. 发布与回滚

Provider change 先在独立 worktree 完成并产出可被下游导入的包。发布前检查：

- `dshCpaImageGeneration` 服务可被注入；
- `./image-generation` 运行时导出可加载；
- 普通模型选择器隐藏三个 image-only ID；
- 旧 `llm/stream` 图片拦截已删除；
- npm 包文件列表不含本地响应捕获、图片或密钥。

随后 Adapter change 才接入服务并切换其默认引擎。没有数据库或附件格式迁移；如 Provider 发布后发现兼容问题，可对 Provider 分支做 revert，Adapter 继续停留在依赖未满足状态，不允许偷偷恢复直连供应商。

## 11. 已知边界

- Gemini 专属尺寸控制依赖 CLIProxyAPI 版本对 `image_config` 的支持；若 relay 版本过旧，仍可能退回默认尺寸，但插件不会因参数兼容性在本地预先失败。
- 引擎级公共契约不会让下游选择任意未来模型；新增模型应在 CPA 内部补能力映射和测试。
- 本地 relay 的成功只能证明当前本地配置和协议路径，不能证明所有 CPA 账号、上游供应商或生产部署均正确。
