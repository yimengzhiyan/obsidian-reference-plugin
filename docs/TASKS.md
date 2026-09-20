# TASKS

本文件按 milestone 组织开发任务。

每个 milestone 应尽量形成可独立 review 的 commit / PR。

---

# Milestone 0 — Repository & Development Setup

## Goal

建立可重复开发、运行、测试的 Obsidian Community Plugin 工程。

## Tasks

- [ ] 初始化 Git 项目结构
- [ ] 创建标准 Obsidian plugin skeleton
- [ ] 配置 TypeScript
- [ ] 配置 package scripts
- [ ] 添加 `manifest.json`
- [ ] 添加插件入口
- [ ] 添加基础 README
- [ ] 添加 `.gitignore`
- [ ] 确认可在测试 Vault 中加载
- [ ] 确认 hot reload / build 工作流
- [ ] 确认开发只在测试 Vault 中进行

## Acceptance Criteria

- [ ] `npm install` 成功
- [ ] `npm run dev` 或等价命令成功
- [ ] Obsidian 可以加载插件
- [ ] 插件可以注册一个测试 command
- [ ] 不修改正式用户 Vault

---

# Milestone 1 — Critical Technical Spikes

## Goal

先验证项目风险最高的技术能力，不追求完整 UI。

---

## 1.1 Editor / Placeholder Spike

- [ ] 注册 `Create Smart Reference` command
- [ ] 获取当前 active Markdown editor
- [ ] 获取当前 cursor
- [ ] 生成唯一 placeholder ID
- [ ] 插入：

```markdown
%%smart-ref:<uuid>%%
```

- [ ] 保存源文件 path
- [ ] 保存 placeholder ID
- [ ] 能重新找到 placeholder
- [ ] 能替换 placeholder
- [ ] 能取消并删除 placeholder

### Acceptance Criteria

- [ ] 切换到其他笔记再回来后，仍能找到 placeholder
- [ ] 不依赖原始 line/column 完成替换

---

## 1.2 Target Note Picker Spike

- [ ] 读取 Vault 中 Markdown 文件
- [ ] 实现搜索框
- [ ] 支持 fuzzy search
- [ ] 用户可以选择目标笔记
- [ ] 用户可以 Esc 取消
- [ ] 选择后可以打开目标笔记

### Acceptance Criteria

- [ ] 100+ 笔记下搜索仍可用
- [ ] 选择后目标文件正确打开

---

## 1.3 Exact Selection Capture Spike

- [ ] 进入“精确选择模式”
- [ ] 显示选择状态提示
- [ ] 获取用户当前 selection
- [ ] 获取 selected text
- [ ] 获取 from/to editor position
- [ ] 将 editor position 映射到 Markdown source offset
- [ ] Enter 确认
- [ ] Esc 取消
- [ ] 防止空 selection 被确认

### Acceptance Criteria

- [ ] 可选择段落中的任意一句话
- [ ] 可选择任意几个词
- [ ] 能稳定保存 selectedText 和 range
- [ ] 取消后不污染目标文件

---

## 1.4 Block Identification / Creation Spike

- [ ] 确定当前 selection 所在 Markdown block
- [ ] 检测 block 是否已有 `^block-id`
- [ ] 如无，则创建稳定 block ID
- [ ] 如有，则复用
- [ ] 返回 block ID
- [ ] 验证 Obsidian 能正常跳转到该 block

### Acceptance Criteria

- [ ] 普通 paragraph 工作
- [ ] 普通 list item 至少完成技术验证
- [ ] 不重复创建多个 block ID

---

## 1.5 Precise Highlight Spike

- [ ] 给定 target file + block ID 打开目标
- [ ] 滚动到 block
- [ ] 在 block 内找到 selectedText
- [ ] 通过 CodeMirror Decoration 或等效方式高亮精确范围
- [ ] 高亮自动移除
- [ ] 不永久修改 Markdown
- [ ] 不要求真实 selection 才能看到高亮

### Acceptance Criteria

- [ ] 点击/命令触发后用户可以明显看到原始选中文字
- [ ] Markdown 文件内容不增加任何高亮标记
- [ ] 高亮消失后编辑器状态正常

---

# Milestone 2 — Core Reference Data Model

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

# Milestone 6 — Smart Reference Click Handling

## Goal

用户点击精确引用时执行增强跳转。

## Tasks

- [ ] 确定 ref metadata 与链接的绑定机制
- [ ] 识别 smart reference click
- [ ] 不拦截普通 link
- [ ] 打开 target file
- [ ] 找 target block
- [ ] 恢复 precise range
- [ ] scroll into view
- [ ] temporary highlight
- [ ] highlight cleanup
- [ ] recovery failure 时 fallback 到 block

## View Modes

- [ ] Live Preview
- [ ] Reading View
- [ ] Source Mode（至少确认兼容边界）

## Acceptance Criteria

- [ ] 普通链接仍使用正常 Obsidian 行为
- [ ] Smart Reference 使用增强行为
- [ ] 插件关闭后 link 仍可用

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
