# 计划：清理废弃的 Plan 文件，建立 Plan 管理规范

## 问题

当前 `~/.kimi/plans/` 目录下积累了 7 个 plan 文件，其中多个是针对同一问题（评论框自动填充）的连续废弃迭代：

| Plan 文件 | 主题 | 状态 |
|-----------|------|------|
| `big-barda-rictor-carnage.md` | 支持最新模型 + 重新生成反驳 | ✅ 已实现 |
| `argent-pantha-cable.md` | 分析面板预览反驳内容 | ✅ 已实现 |
| `mantis-terra-simon-baz.md` | 面板内风格切换 | ✅ 已实现 |
| `black-hawk-constantine-black-hawk.md` | 无错误时重新分析 | ✅ 已实现 |
| `black-hawk-catwoman-aquaman.md` | 修复发布按钮置灰（execCommand 方案）| ❌ 已废弃 |
| `aqualad-catwoman-aquaman.md` | 修复发布按钮置灰（execCommand+事件模拟）| ❌ 已废弃 |
| `plastic-man-cyborg-quasar.md` | 修复发布按钮置灰（ClipboardEvent 方案）| ✅ 当前有效 |

保留废弃 plan 文件的问题：
1. 造成混淆——回头看时不知道哪个是当前有效方案
2. 占用磁盘空间（虽然不大）
3. 违背"单一真相源"原则

## 最佳实践方案

### 清理原则

**保留**：已实现且当前有效的功能 plan
**删除**：已废弃的迭代方案（特别是同一问题的旧版本）
**记录**：在最终有效 plan 中简要备注之前的尝试路径

### 执行清单

1. **删除废弃 plan**：
   - `black-hawk-catwoman-aquaman.md`（execCommand 方案，已废弃）
   - `aqualad-catwoman-aquaman.md`（execCommand+事件模拟，已废弃）
   - 删除对应的 `.swp` 交换文件

2. **在最终有效 plan 中补充迭代记录**：
   在 `plastic-man-cyborg-quasar.md` 开头添加"方案演进"小节，记录：
   - 迭代1：innerHTML + 合成事件 → 文本在 DOM 中但不在编辑器 state 中
   - 迭代2：execCommand('insertText') → 同上
   - 迭代3：navigator.clipboard + 模拟 Ctrl+V → 浏览器安全限制，isTrusted=false 被忽略
   - 迭代4（当前）：直接 ClipboardEvent('paste') + DataTransfer → 让编辑器走原生 paste handler

3. **可选：在 `plastic-man-cyborg-quasar.md` 中添加最终的 `_fillContentEditable` 完整代码作为参考**

## 未来 Plan 管理规范

1. **同一问题多次迭代**：保留最终有效 plan，废弃的立即删除（或归档到 plan 内的"方案演进"章节）
2. **plan 命名**：尽量包含功能关键词，方便识别
3. **plan 内容结构**：
   - 背景/问题
   - 方案演进（如有多次迭代）
   - 当前有效方案
   - 验收标准
4. **定期清理**：每次功能稳定后，清理同主题的旧 plan

## 验收标准

- [ ] 废弃 plan 文件已删除
- [ ] `.swp` 交换文件已删除
- [ ] 有效 plan 已补充方案演进记录
- [ ] 剩余 plan 文件清晰可辨，无冗余
