## Task 2 Report

- Status: DONE_WITH_CONCERNS
- Date: 2026-08-25
- Commit: `0d3f02cc3601375e06ecb354e87f53eef017d153`

### Changed Files

- `src/index.ts`
- `package.json`
- `test/image-generation-addon.test.js`
- `test/index.test.js`
- `lib/index.js` (bundle artifact)
- `lib/image-generation.js` (bundle artifact)

### What Changed

- 在 Host add-on 中引入并注册 `IMAGE_GENERATION_SERVICE`。
- 注册位置放在 `credentials` 注入闭包建立之后，服务在 `generate()` 时动态调用 `cpaFastRoute(ctx, effectiveConfig(ctx, config))`，不在 `apply()` 时快照 route 或 key。
- 新增 `./image-generation` package export：
  - `types -> ./src/image-generation.ts`
  - `import -> ./lib/image-generation.js`
- 新增 focused add-on harness 测试，覆盖：
  - `ctx.provide()` 注册成功；
  - 第一次调用使用初始 `baseURL` 与 credential；
  - profile 更新后第二次调用使用新 route；
  - credential 引用随当前 `apiKeyEnv` 变化，不依赖启动时快照。
- 在 `test/index.test.js` 补 provider seam 回归：
  - `src/index.js` 组合后仍可通过 `lib/index.js` 暴露 Host image service；
  - discovery / profile sync 既有行为未因服务注册回归。

### Commands And Results

1. 红灯检查

```bash
npm run bundle
```

- Result: exit 0

```bash
node --test test/image-generation-addon.test.js test/index.test.js
```

- Result: exit 1
- 关键失败：
  - `ERR_PACKAGE_PATH_NOT_EXPORTED`，`./image-generation` 尚未导出；
  - 测试 harness 缺少 `settings.register` / `connection.rpc.handle` seam。

2. 实现后验证

```bash
npm run bundle
```

- Result: exit 0

```bash
node --test test/image-generation-addon.test.js test/index.test.js
```

- Result: exit 0
- Summary: `14 passed, 0 failed`

```bash
node --test test/image-generation.test.js test/image-generation-addon.test.js test/index.test.js
```

- Result: exit 0
- Summary: `27 passed, 0 failed`

```bash
npm run typecheck
```

- Result: exit 2
- 失败范围不在本任务修改内，主要是现有 client 侧模块解析与隐式 `any`：
  - `@deepseek-ai/dsh-client-runtime/client`
  - `@deepseek-ai/dsh-client-ui-slots`
  - `@deepseek-ai/dsh-client-connection/client`
  - 以及多个 `src/client/*.ts(x)` 既有类型错误
  - 另有 `src/index.ts` 对 `@deepseek-ai/dsh-client-connection` 的既有解析问题

3. 提交

```bash
git add src/index.ts package.json test/image-generation-addon.test.js test/index.test.js lib/index.js lib/image-generation.js
git commit -m "feat: register CPA image service"
```

- Result: exit 0
- Commit: `0d3f02cc3601375e06ecb354e87f53eef017d153`

### Concerns

- `npm run typecheck` 当前无法作为本切片完成证据，因为仓库存在与 Task 2 无关的既有 TypeScript 问题。
- bundle 产物 `lib/index.js` 受打包输出影响，diff 体积较大，但来源仅为本次 source 变更重新构建。

### Risk-Signal Self-Report

- Scope discipline: low risk
  - 仅改 Host 服务注册、package export、对应测试与 bundle 产物。
- Behavior risk: low to medium
  - 新服务入口是增量注册，未修改现有 capability / execution / stream 路径。
- Verification confidence: medium-high
  - image-generation contract tests、focused add-on tests、provider seam regression 全绿。
  - TypeScript 全量检查未通过，但失败项看起来是本任务前已存在的基线问题。

## Fix Round 1 (Review Follow-up)

- Status: DONE_WITH_CONCERNS

### Fix Summary

- 将 `./image-generation` 拆成稳定公开入口与 Host 内部实现入口：
  - 新增 `src/image-generation-public.ts`，只重新导出 `IMAGE_GENERATION_SERVICE` 和公开类型；
  - `tsdown.config.mjs` 改为同时构建：
    - `lib/image-generation.js` 作为 public subpath runtime；
    - `lib/image-generation-internal.js` 作为内部 factory bundle。
- `package.json` 的 `./image-generation.types` 改为 `./src/image-generation-public.ts`，避免把 `createCpaImageGenerationService` 暴露给 typed consumer。
- `test/image-generation.test.js` 改为验证内部 bundle `../lib/image-generation-internal.js`。
- `test/image-generation-addon.test.js` 增加 runtime surface 检查，确认 public subpath 不再暴露 `createCpaImageGenerationService`。
- 新增 `test/image-generation-contract.ts` 和 `npm run typecheck:image-generation-contract`，用真实 TypeScript 解析 `@LiuRJ99/dsh-cpa-plugin/image-generation`：
  - 验证公开 service constant / request / response / service types；
  - 用 `@ts-expect-error` 验证内部 factory 不能从稳定子路径导入。

### Changed Files

- `src/image-generation-public.ts`
- `tsdown.config.mjs`
- `package.json`
- `test/image-generation.test.js`
- `test/image-generation-addon.test.js`
- `test/image-generation-contract.ts`
- `lib/image-generation.js` (bundle artifact)
- `lib/image-generation-internal.js` (bundle artifact)
- `lib/index.js` (bundle artifact rebuild)

### Commands And Results

```bash
npm run bundle
```

- Result: exit 0

```bash
node --test test/image-generation.test.js test/image-generation-addon.test.js test/index.test.js
```

- Result: exit 0
- Summary: `27 passed, 0 failed`

```bash
npm run typecheck:image-generation-contract
```

- Result: exit 0
- Verified:
  - `@LiuRJ99/dsh-cpa-plugin/image-generation` 可被 consumer-style TypeScript 解析；
  - 稳定子路径公开类型满足 contract；
  - Host-only factory 不在公开 subpath 上。

```bash
npm run typecheck
```

- Result: exit 2
- 仍为既有基线失败，范围与前述一致，主要集中在 `src/client/*.ts(x)` 和 `src/index.ts` 的既有模块解析 / 隐式 `any`。

### Unresolved Concern

- 全量 `npm run typecheck` 仍不能作为 Task 2 完成证据，但新增的 `typecheck:image-generation-contract` 已专门覆盖本轮 review 指出的 typed consumer contract 要求。
