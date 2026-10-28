# 路线图与变更日志

> 版本号以 `manifest.json` 为准。历史阶段（Phase 1-4）已归档进 git 历史，不再维护。

## 当前状态（2026-10-28）

v2.0 重构在 `refactor/v2` 分支，`main` 停在 `v1.1.2`。

| 批次 | 内容 | 状态 |
|---|---|---|
| B1 | 生成链路：纯文本 + `reasoning_effort` + 16384 预算；Prompt 388 行 → 约 730 字符 | ✅ |
| B2 | 面板：19 个可点元素 → 3 个 | ✅ |
| — | Prompt 回归网 `tests/prompt/` | ✅ |
| B3a | 删 popup，点图标直接开设置页；清理反馈链路（`UPDATE_FEEDBACK` / 历史反馈查询） | ✅ |
| B3b | 设置页 25 项 → 4 项；配置 schema v4（删 `errorTypes` / `features` / `strictness` / `temperature` / `maxTokens`） | ⏳ |
| B4 | 文档/文件合并，升 2.0.0 | ⏳ |

## 待办（按优先级）

- [ ] B3b：设置页只留 API Key / 模型 / 深度思考 / 历史（地址与自定义后缀进「高级」折叠区）；配置 schema 升 v4
- [ ] B4：`ui.js`/`injector.js`/`extractor.js` 合并、样式单真源、`manifest.json` 升 2.0.0
- [ ] 思考模式偶发不触发（`reasoning_tokens=0`）的产品侧处理
- [ ] Firefox 支持
- [ ] 历史记录单条删除 / 导出

## 变更日志

### v2.0.0-dev（2026-10-28，重构中，未发布）
- ✅ B1 正文生成改纯文本（去掉 `response_format`）＋ `reasoning_effort` ＋ `max_tokens` 16384，修复"每次生成都被截断 / 思考吃光预算"
- ✅ Prompt 388 行 / 50 处约束 → 三条判据 + 一个结构 + 篇幅规则（约 730 字符）
- ✅ 截断改为确定性失败、不再重试
- ✅ 配置 schema v2 → v3：新增 `thinking`
- ✅ B2 面板重写：`ui.js` 865 → 309 行，只留正文与两个动作
- ✅ 新增 Prompt 回归网 `tests/prompt/`：L0 判据 + 11 项断言 + 5 篇 golden 集
- ✅ 文档重组：删 PRD / 架构评审 / 营销手册，重写 AGENTS、TECH_DESIGN、PROMPT_DESIGN、USER_GUIDE

### v1.1.2（2026-10-27）— 重构前基线
- ✅ 配置引入 `configVersion` 与迁移链，旧数据读取时自动迁移并回写
- ✅ `customPromptSuffix` 补进默认配置；修正 `storage.local` 不同步的错误描述
- ✅ 打 `v1.1.1` / `v1.1.2` tag 并归档可加载产物

### v1.1.1（2026-10-19）
- ✅ 修复「生成失败：API 返回内容为空」：新增重试与失败分类，空返回 / 截断 / 429 / 5xx 自动退避，确定性失败不重试
- ✅ 重试时关闭 `response_format` 并追加「只输出 JSON」提醒；截断时放宽 `max_tokens`
- ✅ 识别网关 200 + `error` 体、`refusal` / `content_filter`；Claude 取 `content` 数组中的 `text` 块

### v1.1.0（2026-05-11）
- ✅ 支持最新模型版本；模型选择器按提供商动态切换；支持重新生成

### v1.0.0（2026-05-11）
- 🎉 首次发布：DeepSeek / Kimi / OpenAI / Claude / 自定义；多风格；自动填充 + 人工审核发布
