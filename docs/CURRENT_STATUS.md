# CURRENT_STATUS

## 1. Current Phase

**Phase:** Milestone 1 — Placeholder Editor Spike

**Coding status:** Milestone 0 已完成，包括自动化构建验证和测试 Vault 手动验证。

目前已经完成：

- 创建 `codex/bootstrap-plugin` 开发分支；
- 创建标准 Obsidian Community Plugin skeleton；
- 配置 TypeScript、esbuild 和 npm scripts；
- 添加最小插件入口、manifest 和 `.gitignore`；
- 添加本地构建与测试 Vault 加载说明。
- 已确认 `npm run dev` 会启动 esbuild watch mode，修改 `main.ts` 会触发重建；该流程不会自动重新加载 Obsidian 插件。
- 已创建 `codex/placeholder-editor-spike` 分支并开始 Milestone 1 的 placeholder/editor 技术 spike。

此前已经完成：

- 明确产品核心问题；
- 明确主要用户流程；
- 明确四种引用粒度；
- 明确精确文本引用是核心差异；
- 明确精确跳转后的临时高亮必须进入 V1；
- 明确渐进增强原则；
- 明确不能只依赖 absolute offset；
- 明确需要 placeholder 支撑跨笔记流程；
- 明确优先开发为原生 Obsidian Community Plugin；
- 已形成初步技术架构。

目前尚未完成：

- 验证 Obsidian API / CodeMirror API 细节；
- 验证 Reading View / Live Preview / Source Mode 点击行为；
- 设计正式 metadata schema；
- 编写自动化测试；
- 编写手动测试清单；
- 设计插件设置页；
- 发布流程。
- placeholder/editor spike 的代码验证与构建验证。

Milestone 0 手动验证已通过：

- 插件出现在 Community plugins 列表中；
- 在专用测试 Vault 中启用成功；
- 控制台显示 `Loading Obsidian Reference Plugin`；
- 禁用成功，控制台显示 `Unloading Obsidian Reference Plugin`；
- 再次启用成功；
- 未观察到插件特有错误；
- 控制台中的 WebGL fallback warnings 与本插件无关。

自动验证状态：

- `npm run typecheck` 通过；
- `npm run build` 通过，并生成 `main.js`；
- `git diff --check` 通过；
- 依赖已安装，`package-lock.json` 已生成。

本次 spike 当前验证状态：

- `git diff --check` 通过。
- `npm ci` 已成功完成。
- `npm run build` 通过，并生成被 `.gitignore` 忽略的 `main.js`。
- `npm run typecheck` 未通过：`main.ts` 当前有 13 个 Obsidian API 类型、可空值和编辑器范围参数错误；本次验证未修改实现。
- 尚未在 Obsidian 测试 Vault 中验证命令交互；因此“切换到其他笔记再回来后仍能找到 placeholder”仍保持未勾选。

---

## 2. Current Product Definition

V1 的核心能力已经比较明确：

```text
快捷键
→ 源笔记插入 placeholder
→ 搜索并选择目标笔记
→ 选择引用粒度
→ 如果是精确引用，则打开目标笔记并划选文本
→ Enter 确认
→ 输入 Alias 或直接 Enter 使用默认文本
→ 自动返回源笔记
→ 替换 placeholder
→ 点击链接
→ 打开目标并精确高亮
```

---

## 3. Current Architecture Direction

### Source anchor

使用隐藏唯一 placeholder：

```markdown
%%smart-ref:<uuid>%%
```

### Standard fallback target

精确文本引用依然依赖：

```markdown
[[Note#^block-id|Alias]]
```

### Precise metadata

额外保存 reference ID 和精确目标信息。

建议可见 Markdown 结构：

```markdown
[[Note#^block-id|Alias]] %%ref:<ref-id>%%
```

具体格式仍需最小原型验证。

### Precise navigation

优先：

```text
File
→ Block
→ Offset validation
→ Exact text
→ Prefix/Suffix disambiguation
→ Fallback
```

### Highlight

优先使用 CodeMirror 6 Decoration 或等效非破坏式高亮。

---

## 4. Immediate Next Step

Milestone 0 checkpoint 已提交。当前正在进行 Milestone 1 的第一个技术 spike：只验证 source-note placeholder 的插入、跨笔记后按稳定 ID 查找、替换与取消。

本次开发流程验证记录：

- `npm run dev`：已由用户手动验证可启动 esbuild watch mode。
- 修改 `main.ts`：已由用户手动验证会触发重建。
- Obsidian 自动 reload：已确认不提供，测试时需要手动重新加载插件或重启测试 Vault。

本 spike 不实现 note picker、引用粒度、精确文本选择、block ID、metadata persistence、点击拦截或高亮。

本 checkpoint 已提交为 `b3a022e` 并推送到 `origin/codex/placeholder-editor-spike`。当前下一步是在专用测试 Vault 中验证插入、切换返回、替换和取消流程；typecheck 错误需在后续单独修复。

不要直接开始写完整 UI。

第一步应建立最小技术 Spike，验证项目最关键、风险最高的能力。

### Spike A — Obsidian plugin skeleton

建立插件项目并确认：

- 可以加载；
- 可以注册 command；
- 可以获得 Editor；
- 可以插入 placeholder；
- 可以打开目标文件。

### Spike B — Exact selection capture

验证：

- 打开目标笔记后；
- 用户划选任意文字；
- 插件能稳定获得 selection：
  - selected text
  - from/to position
  - 所属 block / paragraph
- Enter / Esc 可以被合理处理。

### Spike C — Block ID creation

验证：

- 自动检测目标段落是否已有 block ID；
- 没有时安全追加；
- 能得到稳定 `[[file#^id]]`。

### Spike D — Precise jump + temporary highlight

这是最关键的技术验证。

做一个硬编码 demo：

```text
给定：
target file
block ID
selected text

点击命令
→ 打开文件
→ 找到 block
→ 找到 selected text
→ 滚动
→ CodeMirror Decoration 高亮
```

如果这一链路不能稳定成立，需要尽早调整架构。

### Spike E — Reading / Editing mode behavior

至少验证：

- Live Preview
- Reading View

Source Mode 可在完成核心闭环后继续验证。

---

## 5. Recommended First Commit Sequence

建议不要一次性提交大量功能。

### Commit 1

```text
chore: initialize Obsidian plugin project
```

内容：

- sample plugin / minimal plugin skeleton；
- package scripts；
- manifest；
- TypeScript config；
- basic README。

### Commit 2

```text
feat: add source placeholder command
```

内容：

- command；
- UUID；
- placeholder 插入 / 清理。

### Commit 3

```text
feat: add target note picker
```

内容：

- Markdown 文件搜索；
- 选择目标；
- 打开目标。

### Commit 4

```text
spike: capture precise editor selection
```

内容：

- 精确划选；
- Enter / Esc；
- debug metadata。

### Commit 5

```text
spike: highlight precise target range
```

内容：

- jump；
- locate；
- decoration；
- auto scroll。

完成前五个 commit 后，再决定正式业务架构。

---

## 6. Open Questions Requiring Implementation Validation

这些不是产品需求不明确，而是底层实现需要通过代码验证。

### 6.1 Link-to-ref association

需要确定：

```markdown
[[Note#^block|Alias]] %%ref:id%%
```

中的 `ref:id` 如何与前面的链接最可靠关联。

要考虑：

- 同一行多个链接；
- 用户手工编辑 alias；
- 用户换行；
- Reading View 渲染后 comment 不显示。

可能需要不同的 metadata representation。

---

### 6.2 Click interception

需要验证精确引用点击在不同视图中的拦截方式。

目标：

```text
插件识别 smart reference
→ 自己执行 precise navigation
```

但不能破坏普通 Wiki Link。

---

### 6.3 Block boundaries

要定义：

- 普通段落；
- list item；
- blockquote；
- callout；
- heading；
- code block；
- table cell；

哪些可以作为精确引用目标。

V1 可以先明确支持最常见 Markdown paragraph / list item，再逐步扩展。

---

### 6.4 Multiline selection

需要决定：

精确文本是否支持跨多个 Markdown block 的 selection。

建议 V1：

- 优先支持单 block 内任意范围；
- 跨 block selection 暂时给出限制或拆分。

这项尚未最终确认，应通过实现成本判断。

---

### 6.5 Metadata persistence

需选择：

- `data.json`
- 自定义 references.json
- 其他插件私有存储

并加入 schema version。

---

### 6.6 Rename handling

需要监听文件 rename / move：

```text
old path
→ new path
```

并更新 metadata。

---

## 7. Risks

### High Risk

- 不同 Obsidian 编辑 / 阅读模式下的 click handling；
- CodeMirror range 与 Markdown source offset 映射；
- 原文编辑后的精确引用恢复；
- link 与 hidden ref metadata 的稳定绑定。

### Medium Risk

- 自动 block ID 插入；
- 文件重命名后的 metadata 更新；
- multiline / list / quote 等复杂 Markdown block。

### Low Risk

- Note search modal；
- Alias 输入；
- placeholder 插入；
- 普通 Note / Heading / Block link 生成。

---

## 8. Development Constraints

- 优先公开 API；
- 不修改 Obsidian core；
- 不永久修改被引用文本的视觉格式；
- 不使用只能被本插件解释的链接作为唯一目标；
- 不依赖 QuickAdd / Templater；
- 所有 destructive operation 必须可取消；
- 开发和测试优先使用独立测试 Vault。

---

## 9. Current Definition of Done for First Prototype

Prototype 不是“UI 很完整”。

第一阶段 prototype 达标条件：

1. 插件可以正常加载；
2. 命令可以插入 placeholder；
3. 可以选择目标文件；
4. 可以打开目标文件；
5. 可以获取用户精确 selection；
6. 可以为目标 paragraph 创建 / 获得 block ID；
7. 可以生成标准 Block Wiki Link；
8. 可以保存 selection metadata；
9. 可以从 metadata 再次找到 selection；
10. 可以滚动到目标；
11. 可以临时高亮精确文本。

完成这些以后才进入完整 UX 串联。

---

## 10. Next Action for Codex

从 `docs/TASKS.md` 的 **Milestone 0 / Milestone 1** 开始。

在没有完成关键技术 Spike 前：

- 不要提前构建复杂 Settings；
- 不要做品牌 UI；
- 不要做发布准备；
- 不要做非核心扩展功能。

优先证明：

> “精确文本引用能够可靠创建、保存、跳转并高亮。”

这是整个项目成立的技术基础。
