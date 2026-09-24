# TASKS

本文件按 milestone 组织开发任务。

每个 milestone 应尽量形成可独立 review 的 commit / PR。

---

# Milestone 0 — Repository & Development Setup

## Goal

建立可重复开发、运行、测试的 Obsidian Community Plugin 工程。

## Tasks

- [x] 初始化 Git 项目结构
- [x] 创建标准 Obsidian plugin skeleton
- [x] 配置 TypeScript
- [x] 配置 package scripts
- [x] 添加 `manifest.json`
- [x] 添加插件入口
- [x] 添加基础 README
- [x] 添加 `.gitignore`
- [x] 确认可在测试 Vault 中加载
- [x] 确认 watch/rebuild development workflow（不包含自动 reload）
- [x] 确认开发只在测试 Vault 中进行

## Acceptance Criteria

- [x] `npm install` / `npm ci` 成功（此前 checkpoint）
- [x] `npm run dev` 或等价命令成功
- [x] Obsidian 可以加载插件
- [x] 插件可以注册 command
- [x] 不修改正式用户 Vault

---

# Milestone 1 — Critical Technical Spikes

## Goal

先验证项目风险最高的技术能力，不追求完整 UI。

---

## 1.1 Editor / Placeholder Spike

- [x] 注册 `Create Smart Reference` command
- [x] 获取当前 active Markdown editor
- [x] 获取当前 cursor
- [x] 生成唯一 placeholder ID
- [x] 插入：

```markdown
%%smart-ref:<uuid>%%
```

- [x] 保存源文件 path
- [x] 保存 placeholder ID
- [x] 能重新找到 placeholder
- [x] 能替换 placeholder
- [x] 能取消并删除 placeholder（实现完成；跨笔记/重载需再次手动验证）

### Acceptance Criteria

- [x] 切换到其他笔记再回来后，仍能找到 placeholder（此前替换验证；新取消路径待复测）
- [x] 不依赖原始 line/column 完成替换

---

## 1.2 Pending Operation State Spike

- [x] Persist operation ID, source path, placeholder token, operation state, and selected target path
- [x] Select an existing Markdown note as the target
- [x] Generate a real native Wiki Block Link from the selected target
- [x] Replace the source placeholder after switching notes
- [x] Cancel after switching notes using persisted source path (implementation; manual revalidation pending)
- [x] Clear pending state only after replacement or cancellation succeeds
- [x] Refuse mutation when the placeholder is missing or duplicated

---

## 1.3 Target Note Picker Spike

- [x] 读取 Vault 中 Markdown 文件
- [x] 实现搜索框
- [x] 支持 fuzzy search（Obsidian `FuzzySuggestModal`）
- [x] 用户可以选择目标笔记
- [x] 用户可以 Esc 取消
- [x] 选择后可以打开目标笔记
- [x] `selectSuggestion` 在 modal close 前提交 selected target
- [x] selection / close / duplicate callbacks 使用 single-settlement guard
- [x] modal lifecycle settlement pure tests

### Acceptance Criteria

- [ ] 100+ 笔记下搜索仍可用
- [ ] 选择后目标文件正确打开（已实现，待 Obsidian 手动验证）
- [x] Runtime regression: choose target → onClose does not cancel → pending/placeholder survive (manually validated)

---

## 1.4 Exact Selection Capture Spike

- [x] 进入“精确选择模式”
- [x] 显示选择状态提示
- [x] 获取用户当前 selection
- [x] 获取 selected text
- [x] 获取 from/to editor position
- [x] 将 editor position 映射到 Markdown source offset
- [x] Enter 确认
- [x] Esc 取消
- [x] 防止空 selection 被确认
- [x] keydown 使用 capture phase，在 CodeMirror mutation 前捕获 Enter/Escape
- [x] selection mode 之外不消费正常 Enter/Escape
- [x] 保留 target WorkspaceLeaf，避免只依赖 global active view
- [x] 拆分 pending/view/path/empty-selection runtime diagnostics

### Acceptance Criteria

- [ ] 可选择段落中的任意一句话
- [ ] 可选择任意几个词
- [x] 能保存 selectedText、range 和上下文 metadata（待 UI 复测）
- [x] 取消路径不写入目标文件（实现及纯逻辑验证；待 UI 复测）
- [x] Runtime regression: Target opens → select → Enter → block ID → replace placeholder → return source (manually validated)

---

## 1.5 Block Identification / Creation Spike

- [x] 确定当前 selection 所在 Markdown block
- [x] 检测 block 是否已有 `^block-id`
- [x] 如无，则创建稳定 block ID
- [x] 如有，则复用
- [x] 返回 block ID
- [ ] 验证 Obsidian 能正常跳转到该 block

### Acceptance Criteria

- [x] 普通 paragraph 纯逻辑测试通过；Obsidian native jump 待验证
- [x] 普通 single-line list item 纯逻辑测试通过；Obsidian native jump 待验证
- [x] 不重复创建多个 block ID（自动测试）

---

## 1.6 Precise Highlight Spike

- [x] 给定 target file + block ID 打开目标
- [x] 滚动到 block/range（实现，待 Obsidian 手动验证）
- [x] 在 block 内找到 selectedText
- [x] 通过 CodeMirror 6 Decoration 高亮精确范围
- [x] 高亮自动移除
- [x] 不永久修改 Markdown
- [x] 不要求真实 selection 才能看到高亮

### Acceptance Criteria

- [ ] 点击/命令触发后用户可以明显看到原始选中文字
- [x] Markdown 文件内容不增加任何高亮标记（implementation invariant）
- [ ] 高亮消失后编辑器状态正常

---

# Deferred roadmap milestone — Core Reference Data Model

> Sequencing note: the reviewed Milestone 1 spike already provides the minimal
> data model needed for navigation. The approved current Milestone 2 is Smart
> Reference Click Interception below; full schema/versioning work remains deferred.

## Goal

设计并实现可版本化的引用元数据。

## Tasks

- [ ] 定义 reference schema
- [ ] 加入 schema version
- [ ] 至少保存：
  - [ ] refId
  - [ ] targetFile
  - [ ] blockId
  - [ ] selectedText
  - [ ] startOffset
  - [ ] endOffset
  - [ ] prefix
  - [ ] suffix
- [ ] 实现 reference create
- [ ] 实现 reference read
- [ ] 实现 reference update
- [ ] 实现 reference delete
- [ ] 实现 plugin load / save
- [ ] 决定 `data.json` 或独立 JSON
- [ ] 加基本 migration 结构
- [ ] 写 schema 注释文档

## Acceptance Criteria

- [ ] 重启 Obsidian 后引用仍可恢复
- [ ] metadata 可与 Git 一起保存
- [ ] refId 唯一
- [ ] 数据损坏时插件不应破坏 Markdown

---

# Milestone 3 — Reference Target Recovery

## Goal

允许目标文本在轻微编辑后仍能被恢复。

## Tasks

- [ ] 实现 block ID 定位
- [ ] 实现 stored offset validation
- [ ] 实现 exact selectedText search
- [ ] 实现 prefix + selectedText + suffix disambiguation
- [ ] 对重复 selectedText 做 disambiguation
- [ ] 设计 fallback result
- [ ] 无法恢复时至少跳到 block
- [ ] 给失败状态提供非阻塞提示

## Acceptance Tests

### Case A — No edits

- [ ] 原文未变化
- [ ] 精确恢复成功

### Case B — Text inserted before selection

- [ ] absolute offset 失效
- [ ] exact text / context 恢复成功

### Case C — Same phrase appears twice

- [ ] prefix/suffix 能区分

### Case D — Selected text lightly edited

- [ ] 若无法精确恢复，则降级到 block
- [ ] 不跳到错误的同名片段

---

# Milestone 4 — Link Generation

## Goal

统一生成 Note / Heading / Block / Precise Text 四种链接。

## Tasks

### Note

- [ ] `[[Note]]`
- [ ] `[[Note|Alias]]`

### Heading

- [ ] Heading picker
- [ ] `[[Note#Heading]]`
- [ ] `[[Note#Heading|Alias]]`

### Block

- [ ] Block picker / selection
- [ ] `[[Note#^block]]`
- [ ] `[[Note#^block|Alias]]`

### Precise Text

- [ ] 标准 block link
- [ ] reference metadata
- [ ] ref marker / association representation
- [ ] 默认 alias = selectedText
- [ ] 自定义 alias

## Acceptance Criteria

- [ ] 四种类型均可生成
- [ ] 所有基础链接均为合法 Obsidian Wiki Link
- [ ] 精确模式在插件禁用时仍至少可以跳到 block

---

# Milestone 5 — Full Guided Workflow

## Goal

把各个技术模块串成一次完整交互。

## Tasks

- [ ] 用户在源笔记触发快捷键
- [ ] 插入 placeholder
- [ ] 打开 target picker
- [ ] 选择 reference granularity
- [ ] Note 模式完成
- [ ] Heading 模式完成
- [ ] Block 模式完成
- [ ] Precise Text 模式完成
- [ ] Alias modal
- [ ] 空 Alias = default
- [ ] 输入 Alias = custom
- [ ] 返回 source note
- [ ] 替换 placeholder
- [ ] 任意阶段 Esc 可取消
- [ ] 异常路径清理 placeholder

## Acceptance Criteria

完成以下端到端场景：

```text
Knowledge.md
→ command
→ Capture.md
→ precise text
→ select original phrase
→ Enter
→ custom alias
→ return
→ generated link
```

中途不需要用户手工复制任何 block ID 或 ref ID。

---

# Milestone 2 — Smart Reference Click Interception

_Originally numbered roadmap Milestone 6; promoted by the approved development sequence._

## Goal

用户点击精确引用时执行增强跳转。

## Tasks

- [x] 确定 ref metadata 与链接的绑定机制
- [x] 识别 smart reference click
- [x] 不拦截普通 link
- [x] missing ref / metadata / target 时保留 native click fallback
- [x] 打开 target file
- [x] 找 target block
- [x] 恢复 precise range
- [x] scroll into view
- [x] temporary highlight
- [x] highlight cleanup
- [x] recovery failure 时 fallback 到 block
- [x] 保留 manual highlight debug command
- [x] 单元测试 marker parsing、reference lookup、missing reference

## View Modes

- [ ] Live Preview（实现完成，待 Obsidian 手动验证）
- [ ] Reading View（实现完成，待 Obsidian 手动验证）
- [x] Source Mode compatibility boundary documented; raw-source links are not intercepted

## Click-runtime repair after manual validation

Real Obsidian runtime found whole-block highlighting for unchanged text and loss
of enhancement after unrelated Source edits. Native block navigation survived.

- [x] Return actual applied highlight kind, not source locator kind alone
- [x] Allow folded rendered whitespace during exact-text matching
- [x] Resolve Live Preview link by containing view, source line, target and ordinal
- [x] Pure tests for edits before/after link, elsewhere in Source, and alias changes
- [x] Pure test that rendered exact failure reports block fallback
- [x] Add debug distinctions for association, metadata, target, locator, and rendered fallback
- [ ] Real-Obsidian: unchanged target highlights only selected phrase in Live Preview
- [ ] Real-Obsidian: unchanged target highlights only selected phrase in Reading View
- [x] Real-Obsidian: Source edits before/after/elsewhere retain navigation (user validated)
- [ ] Real-Obsidian: alias change retains enhanced highlight (reported broken; fix awaiting validation)
- [ ] Real-Obsidian: confirm native link fallback with plugin disabled

### Reading View runtime repair

- [x] Map exact rendered offsets to individual Text nodes and wrap split nodes safely
- [x] Preserve block highlight when exact rendered text cannot be wrapped
- [x] Pair rendered anchors by target/order across ordinary and Smart Wiki Links
- [x] Use current alias only as an unambiguous fallback if source/rendered counts differ
- [x] Add pure multi-node and same-target/alias regression tests
- [ ] Real-Obsidian: unchanged target highlights only selected words in Reading View
- [ ] Real-Obsidian: edited alias retains enhancement in Reading View and Live Preview
- [ ] Real-Obsidian: temporary spans are removed without altering rendered content

### Reading View exact-highlight diagnosis

- [x] Add temporary logs for reference metadata, chosen rendered block, Text nodes, normalized matching, mapped segments, result, fallback reason, and exceptions
- [x] Capture real Reading View click log: link has no source editor view, meaning no usable `data-smart-ref-id` annotation
- [ ] Confirm the rendered link receives `data-smart-ref-id` in the disposable Vault after this branch is installed
- [ ] If enhanced navigation then reaches the target, use the rendered-highlight logs to diagnose any remaining exact-highlight fallback
- [ ] Make a separate focused repair and remove temporary debug logging

### Reading View link annotation

- [x] Match rendered section Wiki Links to anchors by resolved target path, block ID, and same-target order
- [x] Read rendered `href` when `data-href` is absent; remove alias equality fallback
- [x] Read `anchor.dataset.smartRefId` before Live Preview source association
- [x] Pure tests for edited alias, ordinary same-target link, different block ID, path resolution, and ambiguous counts
- [ ] Real-Obsidian: Smart link has annotation and click uses enhanced navigation
- [ ] Real-Obsidian: ordinary and unresolved links keep native navigation

Deliberately inserting text between the Wiki Link and `%%ref:id%%` breaks
adjacency by design; the native Wiki Block Link remains valid.

## Acceptance Criteria

- [x] 普通链接未被 handler preventDefault（自动化/代码审查；待 UI 回归）
- [ ] Smart Reference 使用增强行为（待 Obsidian 手动验证）
- [ ] 插件关闭后 link 仍可用（表示保持 native Wiki Link；待手动验证）

---

# Milestone 7 — File Rename / Move Handling

## Goal

用户移动或重命名目标文件后引用仍尽可能有效。

## Tasks

- [ ] 监听 Vault rename event
- [ ] 更新 reference metadata targetFile
- [ ] 验证 Obsidian 内部链接自动更新行为
- [ ] 必要时同步自有 marker
- [ ] 处理目标删除
- [ ] orphan reference 状态

## Acceptance Criteria

- [ ] 重命名目标文件后 precise reference 仍能找到 metadata
- [ ] 无法恢复时给出清晰降级行为

---

# Milestone 8 — UX Polish

## Goal

在核心闭环稳定后优化交互。

## Tasks

- [ ] 统一 Modal 视觉
- [ ] selection mode 顶部提示条
- [ ] 键盘导航
- [ ] 搜索结果高亮
- [ ] 最近目标笔记优先（可选）
- [ ] alias 输入自动预填默认值
- [ ] 完成后的轻量反馈
- [ ] 取消后的合理恢复
- [ ] 错误消息避免打断用户

## Optional

- [ ] 自定义默认 reference mode
- [ ] “记住上次选择”
- [ ] 最近引用历史

---

# Milestone 9 — Settings

## Goal

仅暴露真正有价值的设置。

## Candidate Settings

- [ ] precise jump emphasis mode
  - [ ] Temporary highlight
  - [ ] Selection
  - [ ] Highlight + selection
  - [ ] Cursor only
- [ ] highlight duration
- [ ] auto-create block ID
- [ ] auto-return to source
- [ ] shortest / full path link style

## Acceptance Criteria

- [ ] 合理默认值下无需配置即可使用
- [ ] 设置变化不会破坏已有 references

---

# Milestone 10 — Edge Cases

## Markdown Structures

- [ ] paragraph
- [ ] list item
- [ ] numbered list
- [ ] blockquote
- [ ] callout
- [ ] heading text
- [ ] table
- [ ] code block
- [ ] multiline selection

## Decide Explicitly

- [ ] 哪些 V1 正式支持
- [ ] 哪些明确提示 unsupported
- [ ] 哪些进入后续 milestone

不要默默生成错误引用。

---

# Milestone 11 — Testing

## Unit Tests

- [ ] ref ID generation
- [ ] metadata serialization
- [ ] exact search
- [ ] prefix/suffix disambiguation
- [ ] fallback locator
- [ ] link builder
- [ ] placeholder replacement

## Integration / Manual Tests

- [ ] create Note link
- [ ] create Heading link
- [ ] create Block link
- [ ] create Precise Text link
- [ ] custom alias
- [ ] default alias
- [ ] cancel at each stage
- [ ] rename target file
- [ ] edit text before target
- [ ] duplicate target phrase
- [ ] restart Obsidian
- [ ] disable plugin
- [ ] re-enable plugin

## Regression

- [ ] ordinary Wiki Links unaffected
- [ ] target Markdown not permanently modified except legitimate block ID
- [ ] no orphan placeholders after successful or canceled operations

---

# Milestone 12 — Documentation

## Tasks

- [ ] README
- [ ] Install
- [ ] Usage
- [ ] Core workflow GIF / screenshots
- [ ] Explain four reference modes
- [ ] Explain alias behavior
- [ ] Explain precise highlight
- [ ] Explain progressive enhancement
- [ ] Explain data storage
- [ ] Explain uninstall behavior
- [ ] Known limitations
- [ ] Troubleshooting

---

# Milestone 13 — Release Preparation

## Tasks

- [ ] choose final plugin name
- [ ] final manifest IDs
- [ ] version
- [ ] changelog
- [ ] license
- [ ] production build
- [ ] test fresh Vault install
- [ ] test upgrade path
- [ ] confirm no debug logging
- [ ] confirm metadata migration
- [ ] prepare Community Plugin submission requirements

---

# Future / Post-V1 Backlog

以下功能不进入当前核心闭环，除非实现过程中成本极低。

- [ ] 跨多个 block 的精确引用
- [ ] fuzzy recovery for edited selected text
- [ ] reference inspector / backlink panel
- [ ] broken reference repair UI
- [ ] batch reference health check
- [ ] ref rename / merge tools
- [ ] reference graph
- [ ] copy Smart Reference command
- [ ] right-click context menu integration
- [ ] command palette shortcuts for each reference type
- [ ] mobile-specific UX
- [ ] alternate render style
- [ ] export references
- [ ] import references
- [ ] reference history

---

# Current Priority Order

严格按以下顺序优先：

```text
1. Plugin skeleton
2. Placeholder
3. Target note picker
4. Exact selection capture
5. Block ID
6. Precise highlight
7. Metadata
8. Recovery
9. Full guided workflow
10. Click enhancement
11. Rename / edge cases
12. UX / Settings / Release
```

核心原则：

> 在“精确文本能够可靠创建、保存、重新定位并高亮”被证明之前，不投入大量时间做界面装饰和扩展功能。


## Reading View source-block/range repair

- [x] Runtime: Reading View annotation works; block-ID DOM lookup fails
- [x] Remove block-ID DOM lookup and match current source-block rendering to a paragraph
- [x] Normalize text and wrap per-node DOM Ranges for exact selections
- [x] Preserve paragraph fallback and add container/range diagnostics
- [x] Tests for mid-paragraph substring, source edits, whitespace, ambiguity, and fallback
- [ ] Real Obsidian: exact highlight, alias/source edits, formatting, and timed cleanup


## Reference marker redesign

- [x] Generate adjacent invisible HTML comment markers
- [x] Parse new markers and legacy same-line markers
- [x] Reading View DOM comment annotation plus section-source fallback
- [x] Tests for alias/source edits and stripped comments
- [ ] Real Obsidian: new creation, invisible marker, annotation, alias/source edits


## Reading View click-time resolution

- [x] Runtime: click precedes successful annotation; native fallback confirmed
- [x] Resolve current source at click time without requiring annotation
- [x] Reuse path/block/order identity; preserve ambiguity fallback
- [x] Log all five resolution paths
- [x] Six pure association tests and full tests/typecheck/build/diff checks
- [ ] Real Obsidian: unannotated click, alias/source edits, ordinary/ambiguous links
- [ ] Confirm enhanced navigation before evaluating target exact-highlight logs
