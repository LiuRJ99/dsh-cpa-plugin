# DSH CPA Image Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `dsh-cpa-plugin` 中提供一个由 Host 拥有网络和凭据的原生图片生成服务，统一支持 GPT Image 2 与 Gemini Image，并让普通 CPA 模型选择器不再展示图片专用模型。

**Architecture:** 在 typed add-on 的 `src/image-generation.ts` 中维护 `engine: 'gpt' | 'gemini'` 到 CPA 模型 ID、URL、请求/响应协议的映射；通过 `ctx.provide('dshCpaImageGeneration', service)` 暴露给下游原生插件。`src/index.js` 继续加载 add-on，但删除旧的按普通 `llm/stream` 模型选择触发的图片网络拦截。客户端只过滤展示层，Host 服务不依赖选择器状态。

**Tech Stack:** TypeScript/ESM、Node.js 22+、Cordis `ctx.provide`、`tsdown` 双入口构建、Node 内置测试运行器、现有 `@deepseek-ai/dsh-llm` `LlmError` 与 `attributionHeaders`。

## Global Constraints

- 本 change 只修改 `/Volumes/S790C/work/liurenjie/work/dsh-work/dsh-cpa-plugin/.worktrees/dsh-cpa-image-provider`，下游 `dsh-image-gen` 的适配在 Provider change 完成并交付包入口后再执行。
- 下游公共请求只允许 `engine: 'gpt' | 'gemini'`；`gpt-image-2`、`gemini-3.1-flash-image`、CPA endpoint、API key 和供应商协议均由 Provider 内部维护。
- 默认引擎由下游配置决定，Provider 不实现 GPT/Gemini 自动 fallback；本 change 只负责两个引擎的 Host 服务。
- GPT 使用 `${baseURL}/images/generations`，内部模型固定为 `gpt-image-2`；Gemini 使用 `${baseURL}/chat/completions`，内部模型固定为 `gemini-3.1-flash-image`，请求为非流式最小 envelope。
- 图片服务每次调用动态读取当前 CPA route 和 credential；不得在 `apply` 阶段缓存 endpoint、model profile 或 key。
- 普通选择器和 CPA 模型设置页面过滤显式 image-only ID，但过滤不能成为图片服务的路由依据；`gemini-3.1-flash-lite` 必须继续作为普通文本模型可见。
- 不按 `-high`、`-low`、`-agent`、`-extra-low` 等后缀推断图片能力；不加入参考图编辑、多图输出、视频输入或自动能力发现。
- 响应 body 和图片字节必须有界读取；错误不得包含 API key、Authorization header、完整上游 body 或完整 data URL。
- 不提交 API key、带凭据的 endpoint、本地响应捕获、生成图片或临时 smoke-test 文件。
- 每个任务按顺序执行，测试命令和 git 状态检查完成后再进行该任务的单独提交；不得把 Comet 运行日志和无关生成文件加入提交。

---

## Task 1: 实现可独立测试的 CPA 图片服务核心

**Files:**

- Create: `src/image-generation.ts`
- Create: `test/image-generation.test.js`
- Modify: `tsdown.config.mjs`

**Interfaces:**

公开契约保持为：

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

`createCpaImageGenerationService` 作为 `@internal` Host composition seam，由 add-on 注册代码和单元测试使用；下游只导入上面的服务名、engine 类型、请求类型和结果类型。

- [x] **Step 1: 建立失败测试和 fake HTTP 工具。**

  在 `test/image-generation.test.js` 中从 `../lib/image-generation.js` 导入测试 seam，使用 `new Response()` 构造 JSON 响应，记录每次 fake fetch 的 URL、请求头和 body。先覆盖下列行为：

  ```js
  test('GPT maps engine to images/generations and decodes b64_json', async () => {
    const image = await service.generate({
      engine: 'gpt',
      prompt: 'a blue circle',
      signal: new AbortController().signal,
    })
    assert.equal(calls[0].url, 'http://cpa.example/v1/images/generations')
    assert.equal(JSON.parse(calls[0].init.body).model, 'gpt-image-2')
    assert.equal(JSON.parse(calls[0].init.body).n, 1)
    assert.deepEqual(image.data, Uint8Array.from([0x89, 0x50, 0x4e, 0x47]))
    assert.equal(image.mediaType, 'image/png')
  })

  test('Gemini maps engine to chat completions and decodes message.images', async () => {
    const image = await service.generate({
      engine: 'gemini',
      prompt: 'a blue circle',
      signal: new AbortController().signal,
    })
    const body = JSON.parse(calls[0].init.body)
    assert.equal(calls[0].url, 'http://cpa.example/v1/chat/completions')
    assert.equal(body.model, 'gemini-3.1-flash-image')
    assert.deepEqual(body.messages, [{ role: 'user', content: 'a blue circle' }])
    assert.equal(body.stream, false)
    assert.deepEqual(image.data, Uint8Array.from([0xff, 0xd8, 0xff]))
    assert.equal(image.mediaType, 'image/jpeg')
  })
  ```

  同时添加 GPT `data[].url` 兼容响应、空 prompt、成功但无图片、非法 JSON、非 2xx、未知媒体类型、空凭据和 abort 测试。错误断言只检查安全错误分类和状态，不依赖完整上游 body。

- [x] **Step 2: 运行红灯检查。**（`tdd_mode: direct` 下以串行 bundle + 定向测试作为验证。）

  先运行：

  ```bash
  npm run bundle
  node --test test/image-generation.test.js
  ```

  预期在服务模块和独立 entry 尚未实现时失败；记录失败点后继续实现，不修改测试来绕过失败。

- [x] **Step 3: 添加服务类型、路由 seam 和显式引擎映射。**

  在 `src/image-generation.ts` 中实现 `createCpaImageGenerationService(resolveRoute, readCredential, deps)`，内部只接受包含 `baseURL`、`apiKeyEnv` 的 Host route。使用固定映射：

  ```ts
  const GPT_MODEL = 'gpt-image-2'
  const GEMINI_MODEL = 'gemini-3.1-flash-image'
  ```

  `generate` 的顺序固定为：检查已取消的 signal；trim 并校验非空 prompt；校验 engine；解析当前 route；解析非空 credential；根据 engine 生成请求；有界读取响应；解析并返回第一张标准化图片。

  GPT 请求 body 为 `model`、`prompt`、`n: 1`、`output_format: 'png'`、`size`、`quality: 'auto'`，默认 `size` 为 `1024x1024`，`size` 优先于 `imageSize`。未提供可验证映射的 `aspectRatio` 以 `UNSUPPORTED_OPTION` 拒绝。Gemini 只发送 `model`、`messages: [{ role: 'user', content: prompt }]`、`stream: false`；Gemini 的尺寸扩展字段在当前 MVP 中以 `UNSUPPORTED_OPTION` 拒绝，不向 CPA 发明私有字段。

- [x] **Step 4: 实现安全的响应读取和解析。**

  复用 CPA catalog 的 reader 思路，新增有界 byte reader：在累计字节超过固定响应上限时取消 reader 并抛出 `RESPONSE_TOO_LARGE`；图片 URL 下载也使用相同的 byte 上限。JSON 解析失败抛出 `INVALID_RESPONSE`，非 2xx 抛出只包含协议和 HTTP status 的 `UPSTREAM_HTTP_ERROR`。

  GPT 解析优先读取 `data[0].b64_json`，没有时读取 `data[0].url` 并下载其 bytes。Gemini 读取 `choices[0].message.images[0].image_url.url`，只接受 `data:image/png|jpeg|webp|gif;base64,...`。Base64 解码失败、媒体类型不支持、成功响应没有图片、下载响应非 2xx 都分别转换为安全的 `LlmError`。使用 `attributionHeaders()`，`Authorization` 只在 Host 发出的 CPA 请求中出现。

- [x] **Step 5: 配置独立 Host entry 并运行绿灯测试。**

  在 `tsdown.config.mjs` 的 Host entry 中增加 `image-generation: resolve(here, 'src/image-generation.ts')`，保留现有 `index` entry；不要复制第二份协议实现。运行：

  ```bash
  npm run bundle
  node --test test/image-generation.test.js
  ```

  预期服务测试全部通过，且 `lib/image-generation.js` 可被 Node ESM 导入。

- [x] **Step 6: 提交服务核心。**

  ```bash
  git add src/image-generation.ts test/image-generation.test.js tsdown.config.mjs
  git commit -m "feat: add CPA image generation core"
  ```

## Task 2: 注册 Host 服务并发布稳定子路径

**Files:**

- Modify: `src/index.ts`
- Modify: `package.json`
- Create or modify: `test/image-generation-addon.test.js`
- Modify: `test/index.test.js`（仅补充 add-on/provider seam 回归）

**Interfaces:**

- `src/index.ts` 在已有 `readCredential` 安装之后调用 `ctx.provide(IMAGE_GENERATION_SERVICE, service)`。
- route resolver 每次 `generate` 执行时调用 `cpaFastRoute(ctx, effectiveConfig(ctx, config))`，不在 `apply` 时读取 route。
- package export 增加：

  ```json
  "./image-generation": {
    "types": "./src/image-generation-public.ts",
    "import": "./lib/image-generation.js"
  }
  ```

- [x] **Step 1: 写服务注册和动态配置失败测试。**

  为 add-on 测试 harness 增加 `provide` 捕获、`get('settings')`、`inject(['credentials'])` 所需的最小 seam，避免引入真实外部 HTTP。测试 `apply` 后存在键为 `dshCpaImageGeneration` 的服务，并通过 fake fetch 验证：第一次调用使用初始 `baseURL` 与 credential；修改 settings profile 后第二次调用使用新 route；credential resolver 的引用来自当前 profile，而不是启动时快照。

  在主 Provider 回归 harness 中增加 `provided` 只读观察，确认 `src/index.js` 在具备 add-on seam 的上下文中仍加载 `lib/index.js`，且普通 discovery/profile 同步行为没有因服务注册改变。

- [x] **Step 2: 运行红灯检查。**（`tdd_mode: direct` 下以实现后 focused bundle/test 作为验证。）

  ```bash
  npm run bundle
  node --test test/image-generation-addon.test.js test/index.test.js
  ```

  预期服务尚未被 `ctx.provide` 注册或 package subpath 尚未稳定导出时失败。

- [x] **Step 3: 在 typed add-on 中注册服务。**

  在 `src/index.ts` 导入 `IMAGE_GENERATION_SERVICE`、`CpaImageGenerationService` 和 internal factory，并在 `readCredential` 闭包创建后注册：

  ```ts
  const imageService = createCpaImageGenerationService(
    () => {
      const route = cpaFastRoute(ctx, effectiveConfig(ctx, config))
      return route === undefined ? undefined : {
        baseURL: route.baseURL,
        apiKeyEnv: route.apiKeyEnv,
      }
    },
    readCredential,
  )
  ctx.provide(IMAGE_GENERATION_SERVICE, imageService satisfies CpaImageGenerationService)
  ```

  route 不存在、profile 的 `api` 不是 `openai-responses`、key ref 缺失或 key 为空时由服务在调用时给出安全错误；不改变现有 model capability、execution、account/quota 和 Fast stream provider。

- [x] **Step 4: 增加 package export 和 contract import 检查。**

  在 `package.json` 增加 `./image-generation` export，保持 `src` 已在 `files` 中；运行构建后用 Node ESM import 检查 `IMAGE_GENERATION_SERVICE`，再让 add-on 测试从 `lib/index.js` 获取 service。公共类型入口使用 `src/image-generation-public.ts`，Host-only factory 由 internal runtime entry 组装，并以真实 TypeScript consumer contract test 验证稳定子路径可以解析且不暴露内部 factory。

- [x] **Step 5: 运行注册和构建验证。**

  ```bash
  npm run bundle
  node --test test/image-generation.test.js test/image-generation-addon.test.js test/index.test.js
  npm run typecheck
  ```

  预期服务能从 `lib/index.js` 被 Host 注入，独立 `./image-generation` runtime entry 可加载，动态 route/key 测试通过。

- [x] **Step 6: 提交服务注册。**（实现与修复分别提交为 `0d3f02c`、`a9ee3a2`、`5a68a4d`。）

  ```bash
  git add src/index.ts package.json test/image-generation-addon.test.js test/index.test.js tsdown.config.mjs
  git commit -m "feat: register CPA image service"
  ```

## Task 3: 标记 image-only 模型并隐藏普通选择入口

**Files:**

- Modify: `src/catalog.js`
- Modify: `src/client/cpa-model-select.tsx`
- Modify: `src/client/cpa-model-settings.tsx`
- Modify: `test/catalog.test.js`
- Modify: `test/client.test.js`

**Interfaces:**

在 `src/catalog.js` 维护唯一显式集合并导出纯谓词：

```js
const IMAGE_ONLY_MODEL_IDS = new Set([
  'gpt-image-1.5',
  'gpt-image-2',
  'gemini-3.1-flash-image',
])

export function isImageOnlyModel(value) {
  const id = typeof value === 'string' ? value : modelIdOf(value)
  return id !== undefined && IMAGE_ONLY_MODEL_IDS.has(id)
}
```

- [x] **Step 1: 添加 catalog 和客户端失败断言。**

  `test/catalog.test.js` 增加：

  ```js
  assert.equal(modelProfileOf({ id: 'gpt-image-2' }).imageGeneration, true)
  assert.equal(modelProfileOf({ id: 'gemini-3.1-flash-image' }).imageGeneration, true)
  assert.equal(modelProfileOf({ id: 'gemini-3.1-flash-lite' }).imageGeneration, undefined)
  assert.equal(isImageOnlyModel({ id: 'gpt-image-2' }), true)
  assert.equal(isImageOnlyModel({ id: 'gemini-3.1-flash-lite' }), false)
  assert.equal(isImageOnlyModel({ id: 'gemini-3.1-flash-high' }), false)
  ```

  `test/client.test.js` 增加 source-level contract checks，要求 selector 的分组入口和 settings 的可编辑行都调用 `isImageOnlyModel`；同时断言 `gemini-3.1-flash-lite` 没有被过滤。测试不通过 React 内部状态伪造成功，纯展示策略由共享谓词和构建源检查共同确认。

- [x] **Step 2: 运行红灯检查。**（`tdd_mode: direct` 下以实现后 focused catalog/client tests 作为验证。）

  ```bash
  node --test test/catalog.test.js test/client.test.js
  ```

  预期 Gemini image-only 标记和客户端过滤断言在旧实现上失败。

- [x] **Step 3: 替换 catalog 中的旧图片模型推断。**

  用上述三项显式集合替换旧的 GPT 集合和 `mini/hd` 后缀推断。`modelProfileOf` 对集合内 ID 设置 `imageGeneration: true`；隐藏 entry 的保留策略仍只服务于 Host catalog，不把 `visibility` 或名称后缀扩展成新的图片模型。`isHiddenImageModel` 改为复用显式谓词，保证隐藏的 `gpt-image-2` 和 Gemini image entry 能进入 Host 能力目录。

- [x] **Step 4: 过滤普通 selector，同时保留当前 route 数据。**

  在 `cpa-model-select.tsx` 的 `displayModelGroups` 分组前过滤所有 `isImageOnlyModel(model.id)`，图片模型组成的 group 不渲染任何普通选择行，含普通 Gemini 模型的 group 正常渲染。

  在 `cpa-model-settings.tsx` 将 draft 全量数据和可见行分开：`draft.models` 保留 image-only entry 以避免保存时丢失 Host route 元数据；`projection().models`、可见 index 到实际 index 的编辑/删除映射只使用非图片行；`mergeModels` 可以保存新发现的图片 entry，但不把它们呈现为可编辑模型行。这样 UI 隐藏模型而不改变服务的动态 route。

- [x] **Step 5: 运行客户端和 catalog 验证。**

  ```bash
  node --test test/catalog.test.js test/client.test.js
  npm run bundle
  npm run typecheck
  ```

  预期三个 image-only ID 不出现在普通选择行，`gemini-3.1-flash-lite` 仍在普通列表，客户端 bundle 和 TypeScript 检查通过。

- [x] **Step 6: 提交 selector policy。**（实现与修复提交为 `047d043`、`9494826`。）

  ```bash
  git add src/catalog.js src/client/cpa-model-select.tsx src/client/cpa-model-settings.tsx test/catalog.test.js test/client.test.js
  git commit -m "fix: hide image-only models from CPA selectors"
  ```

## Task 4: 删除旧的 `llm/stream` 图片网络所有者

**Files:**

- Modify: `src/index.js`
- Modify: `test/index.test.js`
- Delete: `src/cpa-image-stream.js`
- Delete: `test/cpa-image-stream.test.js`（GPT 解码、URL、HTTP 错误和空结果测试已迁移到 `test/image-generation.test.js`）

- [x] **Step 1: 增加普通 stream 负向回归。**

  在 `test/index.test.js` 中保留一个 fake `llm/stream` 请求，使用 `provider: 'CLIProxyAPI'` 和 `model: 'gpt-image-2'`，断言最终调用 `next()` 并返回 sentinel；再用普通文本 model 做相同断言。该回归必须验证主 Provider 不再发送 `/images/generations`，而不是只验证 HTTP 没有返回图片。

- [x] **Step 2: 运行红灯检查。**（`tdd_mode: direct` 下以删除前基线记录和删除后 focused regression 作为验证。）

  ```bash
  node --test test/index.test.js test/cpa-image-stream.test.js
  ```

  预期旧 listener 仍会接管图片 model，负向回归失败。

- [x] **Step 3: 移除主入口图片拦截。**

  删除 `src/index.js` 对 `isImageGenerationModel`、`streamCpaImage` 和 `ctx.on('llm/stream', ...)` 图片短路的 import/listener；保留普通 catalog、profile synchronization、account/quota add-on 和 typed add-on 的 Fast stream listener。删除旧文件前确认所有必要的 Base64/URL 解析测试已经在新服务测试中存在。

- [x] **Step 4: 删除旧测试文件并运行回归。**

  ```bash
  git rm src/cpa-image-stream.js test/cpa-image-stream.test.js
  npm test
  npm run typecheck
  npm run bundle
  node --test test/index.test.js test/image-generation.test.js test/image-generation-addon.test.js
  ```

  预期完整 Node 测试、TypeScript、bundle 和服务/Provider 回归都通过；普通文本请求和图片 model 请求均落到下一个 middleware，图片 Host 请求只存在于 `src/image-generation.ts`。

- [x] **Step 5: 提交单一网络所有者迁移。**（实现、artifact boundary 与锁文件修复提交为 `d38b443`、`6086d73`、`eed543b`。）

  ```bash
  git add src/index.js test/index.test.js
  git commit -m "refactor: remove legacy image stream interception"
  ```

## Task 5: 完成包验证、版本交付和本地 CPA smoke

**Files:**

- Modify: `package.json`（公共 service subpath 已在 Task 2 加入；此处完成版本号）
- Modify: `CHANGELOG.md`（仅记录公开服务、引擎映射和 selector policy）

- [x] **Step 1: 做最终静态和单元验证。**

  按顺序运行：

  ```bash
  npm test
  npm run typecheck
  npm run bundle
  npm run check
  npm pack --dry-run
  ```

  `npm pack --dry-run` 必须包含 `src/image-generation.ts`、`lib/image-generation.js` 和 `lib/index.js`，不得包含本地响应、图片或 secret-like fixture。`npm run check` 的声明范围只覆盖本 worktree 的 Node syntax、bundle 和测试，不外推为生产正确性。

- [x] **Step 2: 增加发布前 import 和 contract 检查。**

  使用构建产物验证 `./image-generation` 能被 ESM 导入，检查 `IMAGE_GENERATION_SERVICE` 值为 `dshCpaImageGeneration`，并检查 `ImageEngine` 的运行时调用只接受 `gpt`/`gemini`。确认 `lib/index.js` 中没有第二个独立的图片请求实现。

- [x] **Step 3: 执行本地 CPA Host smoke。**（已尝试；当前终端 credential-missing，GPT/Gemini 真实响应未验证。）

  使用本机已经配置的 CPA model route 和 credential，各执行一次 Host service 调用：GPT 只验证 `/v1/images/generations`、`gpt-image-2`、非空图片 bytes 与标准 media type；Gemini 只验证 `/v1/chat/completions`、`gemini-3.1-flash-image`、`message.images` JPEG data URL 解码和非空 bytes。终端输出只记录 engine、path、status、media type 和 byte count，不记录 key、Authorization、完整响应或图片内容。若本地 relay 不可用，记录具体命令和失败范围，不把本地不可用描述为代码通过。

- [x] **Step 4: 更新版本和变更记录。**

  将 `package.json` 版本从 `0.2.0` 提升到下一个 minor 版本 `0.3.0`，在 `CHANGELOG.md` 记录：`dshCpaImageGeneration`、`./image-generation`、GPT/Gemini 两条 CPA 路径、显式 image-only 过滤和旧 stream 拦截移除。变更记录不包含本地 endpoint、模型 key 或 response capture。

- [x] **Step 5: 重新运行交付验证并提交。**（release commit `536cf4b`。）

  ```bash
  npm run bundle
  npm test
  npm run typecheck
  npm run check
  npm pack --dry-run
  git add package.json CHANGELOG.md
  git commit -m "chore: release CPA image provider contract"
  ```

## Provider Change 完成标准

- `dsh-cpa-plugin` 注入 `dshCpaImageGeneration`，下游只需要 engine-only contract。
- GPT Image 2 使用 `/v1/images/generations`，Gemini Image 使用 `/v1/chat/completions` 和 `message.images[].image_url.url`。
- route 与 credential 在每次请求动态解析，图片服务不泄露 key、endpoint 或完整响应。
- `gpt-image-1.5`、`gpt-image-2`、`gemini-3.1-flash-image` 从普通 CPA selector/settings UI 隐藏，`gemini-3.1-flash-lite` 保持可见。
- `src/cpa-image-stream.js` 与主 Provider 的旧图片 `llm/stream` listener 已删除，图片网络请求只有一份实现。
- `./image-generation` 构建产物和类型入口可被下游 `dsh-image-gen` 导入，npm dry-run 包含所需文件。
- 单元测试、typecheck、bundle、check 和本地 Host smoke 的证据范围分别记录；Provider 完成后才开始 Adapter change。

## Execution Handoff

Provider 完成后，将以下信息交给 Adapter worktree：最新 Provider commit、`npm pack --dry-run` 文件列表、`./image-generation` import 验证结果、GPT/Gemini Host smoke 的窄范围结果，以及任何未能在本地 relay 验证的边界。Adapter 不得复制 Provider 的模型 ID、协议和 credential 解析逻辑。

## Self-review Checklist

- [ ] 所有已批准要求都有任务覆盖：engine-only contract、动态 route/key、GPT/Gemini 协议、显式 image-only 过滤、普通 selector 隐藏、旧 stream 移除、`.codex-plugin` 由下游 change 负责、Provider package export 和本地验证。
- [ ] 每个实现任务都有明确文件、接口、失败测试、实现动作、验证命令和串行提交命令。
- [ ] 计划没有要求下游读取 CPA key，也没有把 image-only UI 过滤当作 Host 路由依据。
- [ ] 没有加入自动 fallback、后缀推断、未经 relay 验证的 Gemini 私有字段或未要求的兼容层。
- [ ] 计划中的每项成功声明都有对应的命令或语义断言，不能用编译成功替代真实 CPA smoke。
