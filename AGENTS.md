# Agent Rules

## 1. 文档同步强制规则

修改任何代码后，**必须**同步检查并更新相关文档，无需用户提醒。

### 触发条件

| 代码变更 | 需检查的文档 |
|---------|------------|
| `src/background/**` | `docs/TECH_DESIGN.md`（架构/数据流部分） |
| `src/content/**` | `docs/TECH_DESIGN.md`（内容脚本部分）、`docs/USER_GUIDE.md`（功能使用说明） |
| `src/popup/**` | `docs/USER_GUIDE.md`（操作界面说明） |
| `src/options/**` | `docs/USER_GUIDE.md`（设置页说明） |
| `src/shared/**` | `docs/TECH_DESIGN.md`（共享模块部分） |
| `manifest.json` | `docs/PRD.md`（产品定义）、`docs/TECH_DESIGN.md`（权限/架构） |
| `docs/**` | 无需额外检查 |
| 新增功能/模块 | `docs/PRD.md`、`docs/TECH_DESIGN.md`、`docs/USER_GUIDE.md` 三份全检 |

### 执行要求
1. **新增功能**：三份文档按需补充对应章节。
2. **修改现有逻辑**：检查对应文档是否有描述过时，有则更新。
3. **删除功能**：同步删除或标记文档中对应说明。
4. **确实无需更新**：在回复末尾用一行简要说明理由，如 `> 文档无需更新：本次为纯内部重构，对外功能无变化。`

## 2. @doc 注释约定

关键代码文件头部必须保留 `@doc` 注释，标明该文件对应的文档位置。Agent 修改文件时，先读对应文档再改代码。

```js
// @doc docs/TECH_DESIGN.md#内容提取模块
// @doc docs/USER_GUIDE.md#如何使用反驳助手
```

如果新建文件且涉及用户可见功能，**必须**在文件头部添加 `@doc` 注释。

## 3. 禁止行为
- 不要等用户开口才更新文档。
- 不要用"下次补"跳过文档。
