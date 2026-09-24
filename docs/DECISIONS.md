# DECISIONS

本文件记录项目目前已经讨论明确的产品与技术方向。

对于尚未真正通过代码验证的细节，会明确标注为“实现阶段可调整”，避免把建议误认为不可变约束。

---

## D-001 — 产品定位：不是普通链接生成器，而是 Obsidian 精确引用系统

**Status:** Confirmed

插件的核心定位不是“更方便地生成 `[[Wiki Link]]`”，而是：

> 为 Obsidian 增加从 Note、Heading、Block 到精确文本范围的完整引用能力，并允许“显示文本”和“来源原文”不同。

原因：

- 普通 Obsidian 已经可以很好地链接笔记、标题和 block；
- 当前真正缺失的是“我在 A 笔记显示自己的总结，但能精确回溯到 B 笔记某一句原文”的体验；
- 精确引用才是本项目与普通链接插件的主要差异。

---

## D-002 — V1 必须覆盖四种引用粒度

**Status:** Confirmed

V1 引用粒度：

1. Note
2. Heading
3. Block
4. Precise Text

原因：

插件应该同时兼顾：

- 一般内部链接；
- 标题级引用；
- 段落级引用；
- 精确文本引用。

这样用户无需在多个插件之间切换。

---

## D-003 — 采用“源笔记占位符”解决跨笔记流程返回问题

**Status:** Confirmed

触发插件后，在源笔记当前光标位置插入唯一隐藏占位符，例如：

```markdown
%%smart-ref:550e8400%%
```

完成引用后再替换该占位符。

原因：

- 用户之后会跳转到另一个笔记；
- 不能只依赖当前 Editor 实例；
- 不能只保存行号和列号，因为源笔记可能发生变化；
- 隐藏注释可以安全存在于 Markdown 中，并方便精确回收。

---

## D-004 — 精确文本模式由用户亲自划选目标文字

**Status:** Confirmed

精确模式不是在弹窗中只搜索 block，而是：

```text
选择目标笔记
→ 打开目标笔记
→ 用户鼠标划选具体文字
→ Enter 确认
```

原因：

- 最直观；
- 可以选择段落中的任意部分；
- 不要求用户知道 block ID；
- 与“引用我眼前看到的这几个字”这一需求一致。

---

## D-005 — Enter 确认，Esc 取消

**Status:** Confirmed

在精确选区模式中：

- Enter：确认当前选区；
- Esc：取消。

Alias 输入阶段：

- 空输入 + Enter：使用默认显示文本；
- 输入文字 + Enter：使用自定义显示文本。

原因：

这是整个流程中最快、最自然的键盘交互。

---

## D-006 — 显示文本可以与被引用原文不同

**Status:** Confirmed

这是项目核心需求之一。

例如：

目标原文：

```text
对异常现象保持敏感
```

源笔记显示：

```text
关注实验中的异常现象
```

链接必须仍然精确返回原始文字。

原因：

用户希望把原始记录、Capture、文献笔记中的内容提炼成自己的表达，同时保留可追溯来源。

---

## D-007 — 精确文本引用仍应建立在标准 Obsidian Block Link 上

**Status:** Confirmed at architecture level

精确引用必须至少有一个标准 Obsidian block 作为稳定的降级目标。

建议输出：

```markdown
[[Note#^block-id|Alias]] %%ref:xxxx%%
```

原因：

- Obsidian 原生不支持“链接到段落中的任意字符范围”；
- Block 可以作为最接近的原生稳定锚点；
- 插件被禁用或卸载后，用户仍然可以跳到相关段落；
- 避免 Markdown 被私有协议锁死。

**Note:** `%%ref:xxxx%%` 的具体文本格式仍可在编码前调整，但“标准 Wiki Link + 额外精确引用元数据”的架构原则不应改变。

---

## D-008 — 插件必须遵守渐进增强原则

**Status:** Confirmed

行为：

### 插件启用

```text
点击链接
→ 打开目标 block
→ 恢复精确文本
→ 自动滚动
→ 临时高亮
```

### 插件禁用 / 卸载

```text
点击链接
→ 仍然由 Obsidian 打开目标 block
```

原因：

用户的 Markdown 数据归用户所有，不能被插件锁死。

---

## D-009 — 精确点击后的“临时高亮”属于 V1 核心功能

**Status:** Confirmed

早期方案曾考虑把精确高亮放到后续版本，但用户明确指出：

> “点击链接 → 跳过去 → 自动高亮刚才选中的那几个字，这个也蛮重要的。”

因此当前决定：

**精确高亮纳入 V1 核心闭环。**

---

## D-010 — 精确高亮优先采用 CodeMirror Decoration，而不是永久修改 Markdown

**Status:** Technical direction confirmed; exact implementation can change

推荐使用 CodeMirror 6 Decoration 或等效的编辑器视觉扩展机制。

不应：

- 自动插入 `==text==`；
- 插入 HTML span；
- 永久改变来源 Markdown；
- 依靠真实 Selection 作为唯一视觉反馈。

原因：

临时 Decoration：

- 非破坏；
- 可自动消失；
- 更适合视觉定位；
- 不污染用户文本。

---

## D-011 — 精确引用定位不能只保存绝对字符 offset

**Status:** Confirmed

原因：

如果用户在目标文本前插入或删除内容，固定 offset 会失效。

因此引用恢复必须采用多层策略。

推荐恢复层次：

1. target file
2. block ID
3. 原 offset 校验
4. block 内 exact selected text
5. prefix + selected text + suffix
6. fallback matching

---

## D-012 — 引用元数据至少需要保存上下文

**Status:** Confirmed at data-requirement level

精确引用至少需要能够表达：

```ts
{
  refId,
  targetFile,
  blockId,
  selectedText,
  startOffset,
  endOffset,
  prefix,
  suffix
}
```

具体：

- 字段名称；
- 数据库形式；
- 是否额外保存 hash；
- prefix/suffix 长度；

均属于实现阶段细节。

---

## D-013 — 如果目标段落没有 block ID，插件自动创建

**Status:** Confirmed

用户不应手工管理：

```markdown
^abc123
```

精确引用和 Block 引用都应由插件在需要时自动创建稳定 block ID。

---

## D-014 — 插件应统一普通引用和精确引用流程

**Status:** Confirmed

不要只为“精确文本”做一个孤立命令。

主入口应统一支持：

```text
Note
Heading
Block
Precise Text
```

原因：

这样插件既能解决普通场景，也能解决精细场景，形成完整产品而不是单一 workaround。

---

## D-015 — 不采用自定义协议作为唯一链接表示

**Status:** Confirmed

不建议：

```text
smartref://7f31ac
```

作为最终 Markdown 中唯一链接。

原因：

- 插件卸载后链接失效；
- 不符合渐进增强；
- 降低可移植性；
- 增加 Markdown 锁定。

---

## D-016 — 取消流程必须是安全的

**Status:** Confirmed

用户在任意关键步骤按 Esc 或关闭流程时：

- 不应留下半成品链接；
- 不应留下无意义 placeholder；
- 不应破坏目标文本；
- 如已添加 block ID，需要决定是否保留；V1 可以优先允许保留，因为 block ID 本身合法且无害。

最后一点属于实现时可验证的 UX 细节。

---

## D-017 — 项目优先开发为原生 Obsidian Community Plugin

**Status:** Confirmed

不依赖 QuickAdd / Templater 作为核心运行环境。

原因：

- 需要跨编辑器状态管理；
- 需要点击拦截 / 增强；
- 需要精确高亮；
- 需要持久引用元数据；
- 原生插件更适合完整实现。

---

## D-018 — 技术栈优先 TypeScript + Obsidian Plugin API + CodeMirror 6

**Status:** Confirmed at high level

推荐：

- TypeScript
- Obsidian Community Plugin API
- Vault API
- Workspace / Editor API
- Modal / SuggestModal
- CodeMirror 6 editor extension
- Plugin data storage

实际依赖版本在项目初始化时锁定。

---

## D-019 — 高亮持续时间不是当前硬性产品决定

**Status:** Open implementation detail

曾举例使用 2～3 秒高亮。

这只是体验示例，不应作为硬编码需求。

实现时：

- 设置合理默认值；
- 最好可配置；
- 优先保证“可看见 + 不打扰”。

---

## D-020 — 引用元数据的实际持久化格式尚未最终确定

**Status:** Open

需要在编码前或 Milestone 1 中确定：

- 使用 Obsidian `data.json`；
- 还是单独的插件内部 JSON；
- 是否按 refId 索引；
- 是否做版本号与 migration；
- Git merge 冲突如何尽量降低。

要求只有一个：

> 数据必须本地、可迁移、可版本化，并能稳定恢复精确引用。

---

## D-021 — 点击事件的拦截方式需要通过最小原型验证

**Status:** Open technical validation

需要验证：

- 如何可靠识别“某个 Wiki Link 后面的 `%%ref:id%%` 属于该链接”；
- Live Preview / Reading View / Source Mode 的行为差异；
- 是否使用 DOM event interception；
- 是否需要 Markdown post processor；
- 是否通过编辑器 extension 关联引用元数据。

在原型验证前不要过早锁定底层实现。

---

## D-022 — 文件移动 / 重命名兼容必须考虑，但可分阶段完成

**Status:** Required, implementation scope to be decided

Obsidian 用户会重命名和移动笔记。

标准 Wiki Link 在 Obsidian 的“自动更新内部链接”配置下通常能得到帮助，但插件自己的 reference metadata 也需要同步。

V1 至少要设计：

- rename 事件处理；
- ref metadata target path 更新；
- 无法恢复时的降级。

---

## D-023 — 名称目前只是工作名

**Status:** Open

候选：

- Smart Reference
- Reference Linker
- Link Composer

在功能稳定前不需要花时间做品牌命名。

---

## D-024 — V1 的成功标准是完整闭环，而不是功能数量

**Status:** Confirmed

核心闭环：

```text
源笔记调用命令
→ 选择目标
→ 精确划选
→ 自定义显示文字
→ 返回源笔记
→ 生成兼容 Obsidian 的链接
→ 点击
→ 目标打开
→ 精确文字被高亮
→ 插件卸载后仍至少能跳到 block
```

只要这个闭环稳定，比先堆设置项或辅助功能更重要。

---

## D-025 — Placeholder 只是源笔记锚点，不是完整的引用状态

**Status:** Confirmed by Placeholder Spike v1

Placeholder 只标记源笔记中的替换位置。跨笔记操作必须另外持久化
operation ID、source path、placeholder token、流程状态和已选 target。

原因：placeholder 本身不能解析真实 target；取消与完成也不能依赖当前
active editor。只有成功替换或删除 placeholder 后才清理 pending state。

---

## D-026 — Milestone 1 使用 Obsidian 原生 FuzzySuggestModal

**Status:** Confirmed by implementation; UX performance needs manual validation

目标笔记选择使用 `FuzzySuggestModal<TFile>`，数据来自
`vault.getMarkdownFiles()`。这提供 Obsidian 原生 fuzzy filtering、键盘选择和
Esc 关闭语义，无需为技术 spike 引入自定义搜索组件。

选择 target 后，将 target path 写入 pending state，再通过 Workspace leaf 打开。
关闭 modal 而未选择时，执行统一 cancellation 并回收 source placeholder。

---

## D-027 — 编辑视图高亮使用注册的 CM6 StateField；Reading View 单独处理

**Status:** Editing-view implementation confirmed; runtime compatibility and Reading View pending

临时高亮实现为注册到 Obsidian editor 的 CodeMirror 6 `StateField` 和
`Decoration.mark`，通过 effect 设置/清除范围，四秒后自动移除。Markdown
只因合法 block ID 而改变，不写入任何高亮标记，也不使用真实 selection。

当前 Obsidian 公共 API 可以注册 editor extension，但没有公开从 `Editor`
dispatch 自定义 effect 的完整桥接。本 spike 使用 CodeMirror-backed Editor
运行时的 `cm` property；这是一项需要在目标 Obsidian 版本持续验证的兼容风险。

Reading View 不运行 CodeMirror，因此必须在后续 click-handling milestone 使用
单独的 DOM range / rendered-view highlighting layer。原生 Wiki Block Link 仍是
Reading View 和插件禁用时的 fallback。

---

## D-028 — Spike metadata 存入 data.json，Markdown 保留 native link + ref marker

**Status:** Provisional implementation decision for Milestone 1

当前精确引用输出保持：

```markdown
[[path/to/Note#^block-id|Alias]] %%ref:<ref-id>%%
```

详细定位 metadata 通过 Obsidian `loadData` / `saveData` 存入插件 `data.json`，
包括 target file、block ID、selected text、absolute offsets、prefix 和 suffix。

这已验证数据模型能够表达 offset validation、exact search、context
disambiguation 和 block fallback，但尚未确认 hidden marker 与 rendered link 的
最终 click association，也未建立 schema version/migration。因此该存储选择在
Milestone 2 正式 data model 前仍为 provisional，不改变渐进增强原则。

---

## D-029 — 点击增强采用 Reading View post processor + capture click handler

**Status:** Implemented; runtime validation pending

没有发现公开的 Obsidian event 能在 Wiki Link click 时同时提供相邻隐藏
comment 的 Markdown source context。因此采用分层方案：

1. Reading View 通过公开 `registerMarkdownPostProcessor` 和
   `getSectionInfo()` 读取当前 rendered section 的 source；
2. parser 只识别紧邻的 `[[...]] %%ref:<id>%%`；
3. post processor 将 ref ID 写到对应 rendered `a.internal-link` 的 data attribute；
4. document capture-phase click handler 只增强带该 attribute 的 link；
5. Live Preview link 使用 CodeMirror `posAtDOM` 回到 source offset，再运行同一 parser。

选择 capture phase 是为了在已确认 metadata 和 target 都有效时先于 Obsidian
native handler 执行精确跳转。以下情况不调用 `preventDefault`：

- 普通 Wiki Link；
- 无法找到相邻 marker；
- ref ID 不存在于 store；
- metadata target path 已不存在。

因此 missing/stale 状态会继续执行 Obsidian 原生 Block Link。插件关闭时也没有
handler/post processor，Markdown 仍是标准 Wiki Link。

Reading View link/source association 已由 D-036 更新为 path、block ID 和
同目标顺序匹配。包含混合 Markdown link 的复杂 section 仍需 test Vault 验证。

---

## D-030 — Editing 和 Reading View 使用不同的非持久高亮层

**Status:** Implemented; runtime validation pending

Editing / Live Preview 继续使用注册的 CM6 Decoration。Reading View 没有
CodeMirror document，因此在目标 block 的 rendered DOM 中查找 exact text，
临时包裹 text-node fragments 并在 timer 到期后还原 DOM。

两条路径都不修改 Markdown。恢复只能得到 block 或 rendered exact text 无法
唯一定位时，Reading View 高亮整个 block 作为安全 fallback。

Obsidian 仍未公开从 `Editor` dispatch CM6 effect 的 API。`editor.cm` 和
`posAtDOM` bridge 已集中隔离在 `src/navigation.ts`；bridge 不存在或 DOM node
不属于 editor 时返回 null，而不是中断 native navigation。

---

## D-031 — Selection confirmation 必须在 capture phase 并绑定 target leaf

**Status:** Confirmed by real Obsidian runtime failure; fix implemented, revalidation pending

真实手动测试发现：target note 正确打开并划选文字后，按 Enter 会看到 selection
collapse，流程不返回 source，并显示旧的合并错误提示：

```text
Return to the selected target note before confirming.
```

旧实现有两个不安全假设：

1. document bubble-phase keydown 能在 CodeMirror 处理 Enter 前读取 selection；
2. `workspace.getActiveViewOfType(MarkdownView)` 一定返回 workflow 打开的 target view。

修复决定：

- 只在 selection mode active 且 key 为 Enter/Escape 时，于 document capture
  phase 调用 `preventDefault` 和 `stopPropagation`；
- selection 内容和 positions 必须在第一个 async operation 前同步读取；
- 保存执行 `openFile(target)` 的 `WorkspaceLeaf`，并显式激活该 leaf；
- confirmation 优先使用 retained leaf 中 path 匹配的 `MarkdownView`，否则使用
  path 匹配的 active view；
- pending missing、expected target missing、no Markdown view、wrong active path、
  empty selection 必须分别诊断；expected/actual paths 只写入 debug log。

该改变不影响 selection mode 之外的键盘行为，也不改变 click interception 架构。

---

## D-032 — SuggestModal selection 必须在 base close 前单次提交

**Status:** Confirmed by real Obsidian runtime failure; fix implemented, revalidation pending

第二次真实手动测试确认：previous selection fix 保留了选区，但 target picker
选择后 pending state 已丢失，source placeholder 也已删除；Target 仍会随后打开。
这与实际 lifecycle 一致：

```text
select suggestion
→ modal onClose
→ old selected flag 仍为 false
→ done(null) / cancelReference
→ placeholder 删除且 pending 清空
→ onChooseItem / done(file)
→ Target 打开
```

Obsidian public API 声明 `SuggestModal.selectSuggestion(value, event)` 可以 override，
但没有保证 `onClose` 和 `onChooseItem` 的调用顺序。因此决定：

- override `selectSuggestion`；
- 在调用 `super.selectSuggestion` 之前提交 selected file；
- selection、`onChooseItem` fallback 和 `onClose` cancellation 共用一个
  single-settlement guard；
- callback 只能收到一次结果；
- 不使用 arbitrary timeout 推迟 cancellation。

真实取消仍由 `onClose` 提交 `null`；如果 selection 已经提交，close 和后续
choose callback 都是 no-op。该修复不改变 capture-phase keyboard handling、
retained target leaf、selection diagnostics 或 click interception。

---

## D-033 — Live Preview 点击关联使用当前 source line 的 target/顺序

**Status:** Runtime failure observed; replacement implemented, runtime revalidation pending

真实 Obsidian 测试中，Source 普通编辑后 native Block Link 仍能导航，但增强高亮
消失。旧方案把 `posAtDOM(anchor)` 当作 Wiki Link 内部的 source offset，
`findSmartReferenceAtOffset` 仅接受该范围内的 offset。CodeMirror 对 rendered
DOM node 的映射只保证获得编辑器位置，不保证 anchor 映射到 Wiki Link 的某个字符；
因此这个约束不适合做稳定关联。具体失败的 runtime stage 尚需新日志确认。

新决定：先找包含点击 anchor 的 `MarkdownView`，用 `posAtDOM` 只定位当前
source line，再按 link `data-href` 和同目标 link 的顺序，关联该行当前的
Wiki Links（含普通 Wiki Link，避免误借 ref ID）。如果 line mapping 不可用，
只在全笔记中此 target 的 Wiki Link 唯一时回退关联；重复 target 必须放弃
增强并交给原生导航。每次从当前 Markdown 解析，所以前后插字、无关编辑及
alias 修改不依赖旧 offset 或显示文字。

仍保持 `[[Target#^block-id|Alias]] %%ref:id%%` 的相邻 marker 合约。若在
Wiki Link 与 marker 之间插入非空白内容，增强关联失效，native link 保留。
使用 `editor.cm` 的有限 bridge 仍是兼容风险；未引入自定义 URL/private
click event。混合 Markdown/Wiki link、重复相同 target 和 Obsidian runtime
映射仍需 test Vault 验证。

---

## D-034 — 导航结果必须反映真正应用的高亮

**Status:** Runtime failure observed; reporting fix implemented, runtime revalidation pending

真实点击未编辑的 target 时出现整个 block 高亮。旧 `navigate()` 只看
`locateReference().kind`，即使 Reading View 的 exact DOM wrapping 失败并
高亮 block，也可能返回 `highlighted-exact`。这是已确认的结果传播错误；
导致 DOM wrapping 失败的具体原因（block ID 所在元素范围、rendered
whitespace 或 source locator）尚未从该 Vault 的日志确认。

新决定：rendered/editor highlight 层必须返回实际应用的 `exact` 或 `block`
种类；最终 `NavigationResult` 以此为准。Reading View 先扩展到包含 block
ID 的 paragraph/list item，再用允许空白折叠的 rendered text 搜索。无法唯一
定位时继续安全地高亮 block，并记录 debug 日志，不再声称 exact 已高亮，
也不向用户显示暗示原文已被修改的错误 Notice。Markdown 不作高亮修改。

---

## D-035 — Reading View 用顺序关联链接，并逐 Text node 包裹精确范围

**Status:** Rendered text wrapping pending runtime validation; association rule superseded by D-036

用户验证 `click-runtime-fix` 后确认：Source 前后/无关编辑后的导航稳定，
但 Reading View 对未改动的 target 总是高亮整个 block；修改 Wiki Link alias
后 native link 仍导航，但增强高亮丢失。

旧 Reading View `annotateRenderedSmartReferences` 首先按 target 寻找 anchor，
但还要求 `candidate.textContent === alias`，且遍历的 source 列表只有 Smart
Links。这既把显示文本变成关联的硬条件，也可能把普通同 target link 的 anchor
借给 Smart Link。新决定是把**所有**当前 source Wiki Links 与 rendered anchors
按 target 和同目标出现顺序配对；alias 仅在数量不一致且当前 alias 唯一匹配时
作为保守回退。含糊时不加 metadata，原生 Wiki Block Link 继续生效。

旧 `wrapText` 实际上已经逐 Text node 调用 `surroundContents`，所以不能把
“总是 block fallback”直接归因于跨节点 `surroundContents` 异常：fallback
表示没有成功找到/包裹任何 span；异常则会中断导航。具体 Obsidian DOM
形态仍待复测。新实现把归一化文本 offset 映射到各 Text node，使用
`splitText` 只包裹各节点的匹配部分，恢复时移除 wrapper；也允许 block ID
anchor 紧邻 paragraph/list item 的渲染布局。无法唯一定位时仍只高亮 block，
不修改 Markdown。这个实现和结果报告都需要真实 Reading View 回归确认。

---

## D-036 — Reading View 链接按目标文件、block ID 和顺序注解

**Status:** Implemented; real Obsidian revalidation pending

真实 Obsidian 点击日志显示 `[Smart Reference] clicked link has no source editor view`。
此日志出现在 link 没有 `data-smart-ref-id` 时：click handler 才回退尝试 Live
Preview 的 source editor，而 Reading View 本来就没有该 editor。因此当前观察到的
Reading View 整块效果可能是 Obsidian 原生 block 导航，并不能证明插件的精确
高亮 renderer 已经失败。

保留公开 `registerMarkdownPostProcessor` 和当前 section 的 Markdown source。
为每个 rendered block link 取 `data-href`，缺失时取 `href`（也覆盖没有
`internal-link` class 的 `<a href>`）；源链接和
rendered link 都按解析后的目标文件路径、block ID 和同目标出现顺序关联。
目标路径用当前 source note 的 `getFirstLinkpathDest` 解析。普通 Wiki Link 也
参与顺序计数。数量不一致时不注解，移除旧的 alias 等值回退；alias 变化不应
影响身份。click handler 先读 `anchor.dataset.smartRefId`，只有没有注解时才
尝试 Live Preview 关联。缺少 section、marker、metadata 或 target 时保留
Obsidian 原生点击行为。


---

## D-037 — Reading View maps source-block text to rendered containers

**Status:** Implemented; runtime validation pending

Runtime confirms link annotation succeeds but block IDs are not exposed as DOM
IDs/attributes in the tested Reading View. Use blockId only for source lookup.
Render the current source block without its trailing ID through Obsidian's public
MarkdownRenderer into a detached container, then match normalized full block text
to a unique visible paragraph/list item. Do not identify the block by the selected
substring. Duplicate full text is ambiguous and remains unsupported rather than
choosing the wrong block. Embedded notes are excluded.

Within the selected container, use normalized text/context matching and map the
result back to Text nodes. Wrap a DOM Range contained within each matched Text
node, preserving surrounding inline elements. Exact matching failure retains the
container highlight; unavailable/ambiguous containers cannot receive a safe block
fallback. Source metadata, link annotation, and selection remain unchanged.


## D-038 — Adjacent HTML comment stores link/refId association

Generate `[[Target#^block|alias]]<!--smart-ref:uuid-->` as one Markdown paragraph.
Keep existing reference metadata unchanged. Parse adjacent HTML comments and retain
legacy same-line percent-comment compatibility. Reading View uses the immediate
DOM comment if retained, with section-source association as fallback when rendering
filters comments. Alias is never identity. This supersedes the generated percent
marker syntax from D-029. Detached legacy paragraphs require explicit relocation;
no automatic migration guesses which link owns them. Real Obsidian validation pending.


## D-039 — Resolve Reading View references synchronously on click

Definitive runtime logs show a click without refId followed later by successful
annotation. Postprocessor timing cannot determine whether enhancement works.
Resolve from DOM attribute, adjacent comment, then current containing-view source.
Reuse annotation's source parser and resolved path/block identity/order matcher.
Count mismatches remain native; unique source/rendered target pairs are safe.
Do not wait for annotation or cancel native clicks until refId, metadata and target
are validated. Log the actual association path. This change does not modify target
highlighting, and the observed native block effect is not evidence of its failure.


## D-040 — Editor highlights convert recovered offsets and verify CM6 marks

Reading View exact highlighting is runtime-validated and its DOM Range code is
unchanged. Editor targets use current editor text for the existing locator, then
convert recovered offsets via Obsidian offsetToPos to CodeMirror document positions.
Stored offsets are never blindly reapplied after locator recovery. Reuse the
registered decoration field, installing it in the current state if absent, and
verify the resulting mark before reporting success. Preserve block fallback and
cleanup. Both Live Preview and Source share this editor strategy.


## D-041 — Live Preview span clicks use current CodeMirror source

Runtime DOM inspection confirms Live Preview internal links are spans, not anchors.
Detect the closest cm-hmd-internal-link for nested clicks. Resolve through containing
editor/cm-line positions and existing Wiki Link parsing; use complete line ordinal
mapping only when counts agree. Do not borrow metadata from ordinary links.
Share the existing metadata checks/navigation pipeline with the anchor handler.
Reading View handling and both highlight algorithms remain unchanged.


## D-042 — Validated workflow and integration diagnostics policy

**Status:** Core workflow user-verified in real Obsidian; prepared for integration

Reading View click resolution/exact DOM Ranges and Live Preview span interception,
refId resolution, editor navigation/exact CM6 decorations are confirmed working.
This supersedes earlier runtime-pending statements for the core paths, not the
broader edge-case coverage. Retain all functional fixes and the separate view
strategies documented in README. No metadata/UI redesign is part of integration.

All runtime diagnostics use src/debug.ts with SMART_REFERENCE_DEBUG=false by
default. Payloads are lazy to avoid text collection and layout reads while off.
Troubleshooting requires enabling the source flag, rebuilding and reloading; reset
it before integration/release. No settings UI or metadata schema change is needed.
Known ambiguity, parser, embedded-note, editor bridge and rename/move limitations
remain explicit. Merge requires separate user authorization.


## D-043 — Conceal metadata with Live Preview replacement decorations

Use the public editorLivePreviewField to gate a dedicated CM6 StateField of
Decoration.replace ranges. Hide complete legacy percent markers and smart-ref HTML
comments without changing Markdown, source offsets, reference data or navigation.
Source mode (or an unavailable mode field) returns no concealment decorations.
Atomic ranges keep cursor movement out of hidden metadata; switch to Source for
raw marker edits. Rebuild on document/mode changes, not selection-only transactions.
Exact highlighting remains an independent decoration field. Runtime revalidation pending.


## D-044 — Conceal generated target anchors in Live Preview

Extend D-043's existing replacement field to line-ending whitespace-delimited
^sr-xxxxxxxx tokens, where x is lowercase hexadecimal, matching createBlockId.
Preserve all Markdown and source offsets. Source mode reveals raw anchors. Do not
hide arbitrary user block IDs or target fragments inside Wiki Links. Generated
ownership is inferred from the reserved pattern; a manually created identical
pattern is also concealed. Navigation/highlight/storage algorithms are unchanged.


## D-045 — Style generated anchor syntax tokens through CM6 marks

Supersedes D-044's replacement mechanism for anchors after runtime failure.
Keep the reserved, line-ending ^sr- plus eight lowercase hex pattern. Apply a
smart-ref-hidden-block-id mark and editor base theme that hides it, including
nested/co-located cm-blockid tokens. Do not mutate CodeMirror DOM or hide every
cm-blockid token. Mode gating and atomic ranges remain; Source has no concealment
marks. Marker comments still use replacement decorations. Debug logs report
matched IDs/count; actual visibility must be validated in Obsidian.
