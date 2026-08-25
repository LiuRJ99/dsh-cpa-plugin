## 1. CPA 图片服务

- [x] 1.1 新增 `src/image-generation.ts`，定义 `ImageEngine`、请求/响应类型与 `dshCpaImageGeneration` 服务契约。
- [x] 1.2 为 GPT Image 2 实现 `/v1/images/generations` 请求、数据 URL/图片响应解析和取消信号传递。
- [x] 1.3 为 Gemini Image 实现 `/v1/chat/completions` 非流式请求，并解析 `message.images[].image_url.url`。
- [x] 1.4 新增 `test/image-generation.test.js`，覆盖 GPT、Gemini、无图片响应、上游错误、鉴权错误和取消行为。
- [x] 1.5 在 `src/index.ts`/`src/index.js` 中解析活动 CPA route、注册 Host 服务，并通过 `./image-generation` 导出公共类型与运行时入口。

## 2. 模型能力与选择器

- [x] 2.1 在 `src/catalog.js` 中显式标记 `gpt-image-1.5`、`gpt-image-2` 和 `gemini-3.1-flash-image` 为生图专用模型。
- [x] 2.2 抽取可复用的 image-only 判断逻辑，确保 `gemini-3.1-flash-lite` 和 `-high/-low/-agent` 别名不会被误判。
- [x] 2.3 在 `src/client/cpa-model-select.tsx` 和 `src/client/cpa-model-settings.tsx` 中过滤生图专用模型行，但不影响图片服务调用。
- [x] 2.4 更新 `test/catalog.test.js` 与 `test/client.test.js`，验证生图模型隐藏、普通 Gemini 模型保留和服务独立可用。

## 3. 单一网络所有者

- [ ] 3.1 将现有 GPT 图片响应解析测试迁移到新服务测试，并为普通 `llm/stream` 增加继续调用下游 middleware 的负例回归测试。
- [ ] 3.2 从 `src/index.js` 移除旧的 image-generation `llm/stream` 拦截，不再把图片模型当作普通聊天模型路由。
- [ ] 3.3 删除不再需要的 `src/cpa-image-stream.js`，同步清理其测试和过时导入。
- [ ] 3.4 更新 `test/index.test.js` 与相关包构建输出，确认文本模型聊天路径未改变。

## 4. 验证与交付

- [ ] 4.1 更新 `package.json` exports、版本和类型声明，使下游插件可导入 `./image-generation`。
- [ ] 4.2 运行 CPA 单元测试、类型检查和构建，修复本 change 引入的失败。
- [ ] 4.3 使用本地 CPA relay 验证 GPT Image 2 与 Gemini Image 的真实响应路径，并记录不含密钥的结果摘要。
- [ ] 4.4 复核变更文件不包含响应捕获、生成图片或任何密钥值。
