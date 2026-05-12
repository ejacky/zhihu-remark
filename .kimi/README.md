# .kimi/ 目录说明

## 用途

本目录归档 Kimi CLI (Kimi Code CLI) 的 **plan mode 历史计划文件**。

## 来源

这些 `.md` 文件原本存储在各开发机器的 `~/.kimi/plans/`（即 `%HOME%/.kimi/plans/`）目录下，由 Kimi CLI 在 plan mode 中自动生成。它们是本项目的功能规划、设计决策和技术方案的完整记录。

## 为什么纳入版本控制

1. **历史追溯**：回顾"当时为什么这样设计"，避免重复踩坑
2. **跨机器同步**：通过 git 在多台开发机之间同步 plan 历史
3. **团队协作**：其他开发者可以了解功能演进的完整脉络
4. **知识沉淀**：plan 文件中包含大量产品分析、方案对比和技术细节

## 命名规范

归档到本目录时，将 Kimi CLI 生成的随机文件名（如 `argent-pantha-cable.md`）重命名为带编号的功能描述名：

```
001-反驳内容预览.md
002-重新生成与动态模型.md
003-折叠回答检测.md
...
```

编号前缀便于按时间顺序浏览。

## 工作流程

```
机器 A（开发）                          机器 B（开发）
  │                                      │
  ├── ~/.kimi/plans/                     ├── ~/.kimi/plans/
  │   └── [活跃 plan，Kimi CLI 读写]      │   └── [活跃 plan，Kimi CLI 读写]
  │        ↑                             │        ↑
  │        │ plan mode 中 Kimi CLI 使用   │        │ plan mode 中 Kimi CLI 使用
  │        │                             │        │
  └── .kimi/plans/                       └── .kimi/plans/
        └── [归档 plan，只读]                  └── [归档 plan，只读]
              ↑                                  ↑
              └────────── git 同步 ──────────────┘
```

### 归档一个 plan

```bash
# plan 完成后，从 Kimi CLI 目录复制到项目内
mv ~/.kimi/plans/xxx-yyy-zzz.md ~/projects/zhihu-remark/.kimi/plans/009-功能描述.md
git add .kimi/plans/
git commit -m "docs: 归档 plan - 功能描述"
```

### 在新机器上继续执行某个 plan

```bash
# 从项目归档复制到 Kimi CLI 工作目录
cp ~/projects/zhihu-remark/.kimi/plans/009-功能描述.md ~/.kimi/plans/
# 然后在项目目录执行 kimi plan，即可加载该 plan
```

## 注意事项

- **Kimi CLI 不会自动读取本目录**：plan mode 只使用 `~/.kimi/plans/`。本目录纯粹是人工维护的归档
- **不要修改归档文件**：归档的 plan 文件是历史记录，如需修改应创建新的 plan
- **定期清理**：已实现的功能 plan 保留归档；已废弃的迭代方案应在归档时剔除，只保留最终有效版本

## 当前归档列表

| 编号 | 文件 | 状态 | 说明 |
|------|------|------|------|
| 001 | 反驳内容预览.md | ✅ 已实现 | 错误分析面板中增加反驳内容预览区域 |
| 002 | 重新生成与动态模型.md | ✅ 已实现 | 支持重新生成反驳 + 模型下拉框动态化 |
| 003 | 折叠回答检测.md | ✅ 已实现 | 检测折叠回答并提示用户展开 |
| 004 | 面板内风格切换.md | ✅ 已实现 | 分析面板内切换反驳风格并缓存多份结果 |
| 005 | 评论框填充修复.md | ✅ 已实现 | 使用 ClipboardEvent paste 正确填充评论框 |
| 006 | 无错误时重新分析.md | ✅ 已实现 | 无错误面板增加"再次检测"按钮 |
| 007 | 推荐页阅读全文按钮消失.md | ✅ 已实现 | 修复推荐页展开回答后按钮消失问题 |
| 008 | 清理废弃Plan与规范管理.md | ✅ 已实现 | 建立 plan 文件管理规范 |
