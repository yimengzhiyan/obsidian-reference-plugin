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

## D-025 — Placeholder 只是源笔记锚点，不是完整的引用状态

**Status:** Confirmed by Placeholder Spike v1

Placeholder 的职责是标记源笔记中最终需要替换的位置。它本身不能表达完整的引用操作，也不能独立生成可解析的最终链接。

因此，跨笔记流程必须为 pending operation 保存持久化元数据，至少包括：

- operation ID / placeholder ID；
- source note path；
- 当前操作状态；
- 已选择的 target note（如已选择）；
- 后续需要生成的 replacement 信息。

原因：

- Spike v1 中的 `[[Placeholder Target]]` 会被 Obsidian 当作真实 WikiLink，并尝试打开一个不存在的新文件；
- 这证明 placeholder 不能承担 target resolution 或最终引用生成职责；
- 取消操作必须从持久化 pending state 找回 source note 和 placeholder，而不能依赖当前 active editor。

取消流程应在删除 placeholder 成功后才清理 pending state；source note 不在当前 active view、尚未打开或插件重新加载后，仍应能安全解析并取消。

最终输出仍应使用原生 Obsidian WikiLink 作为基础表示；精确引用需要的额外 metadata 可以通过插件自己的持久化数据和隐藏 reference marker 关联，但不能用插件私有协议替代原生链接。
