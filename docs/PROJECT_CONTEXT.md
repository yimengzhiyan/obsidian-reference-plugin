# PROJECT_CONTEXT

## 1. Project Overview

**Working name:** Smart Reference / Reference Linker（暂定名）

这是一个面向 Obsidian 的 Community Plugin，目标不是简单复制或生成 Wiki Link，而是为 Obsidian 增加一套更完整的“引用与溯源”工作流。

核心价值：

> 用户可以在当前笔记中插入一个链接，显示为自己重新组织后的文字，但该链接仍然准确指向另一个笔记中的原始来源；如果引用的是精确文字，点击后应跳转到目标笔记并高亮当初引用的具体文本。

插件需要同时兼容 Obsidian 原生的普通链接能力，并在此基础上增加“精确文本引用（precise text reference）”。

---

## 2. Product Goals

### 2.1 Primary Goal

将以下原本需要手工完成的流程压缩为一次连续、明确、可撤销的交互：

1. 在当前笔记的鼠标/光标位置调用快捷键；
2. 插入临时占位符，记录最终链接应返回的位置；
3. 打开引用选择界面；
4. 搜索并选择目标笔记；
5. 选择引用粒度；
6. 如果选择精确文本，则打开目标笔记并由用户鼠标划选具体文字；
7. 用户确认选区；
8. 询问是否自定义当前笔记中的显示文本；
9. 自动返回源笔记；
10. 用最终链接替换占位符。

目标是覆盖从普通 `[[Note]]` 到精确文本引用的完整内部引用场景。

---

## 3. Target User Flow

### 3.1 Entry

用户在当前笔记中将光标放在希望插入引用的位置，然后触发插件快捷键。

示例：

```text
当前正在写一段总结……
                    ↑
                光标位置
```

插件立即在此处插入唯一占位符，例如：

```markdown
%%smart-ref:550e8400%%
```

占位符必须满足：

- 在 Markdown 阅读模式下不可见；
- 全局唯一；
- 即使用户在后续步骤中切换到其他笔记，也能可靠定位原始插入位置；
- 用户取消流程时必须清理。

---

### 3.2 Select Target Note

插件打开一个可搜索的选择界面：

```text
选择引用笔记

🔍 搜索……

000_Capture
科研想法
创新的底层思维
……
```

要求：

- 支持模糊搜索；
- 只需要优先覆盖 Markdown 笔记；
- 用户可以取消；
- 选择完成后进入“引用粒度”选择。

---

### 3.3 Select Reference Granularity

至少支持四个层级：

```text
引用位置

○ 整篇笔记
○ 标题 / 章节
○ 整个 Block / 段落
● 精确文字
```

四种模式分别对应：

#### A. 整篇笔记

标准 Obsidian 链接：

```markdown
[[Note]]
```

或：

```markdown
[[Note|Alias]]
```

#### B. 标题 / 章节

标准 Obsidian Heading 链接：

```markdown
[[Note#Heading]]
```

或：

```markdown
[[Note#Heading|Alias]]
```

#### C. Block / 段落

标准 Obsidian Block Link：

```markdown
[[Note#^block-id]]
```

或：

```markdown
[[Note#^block-id|Alias]]
```

如果目标段落尚无 block ID，插件应自动创建。

#### D. 精确文字

目标是引用一个段落中的任意文本范围。

用户选择此模式后：

1. 插件打开目标笔记；
2. 进入“选择引用”状态；
3. 顶部或浮层提示用户用鼠标划选目标文字；
4. 用户按 Enter 确认，Esc 取消；
5. 插件记录精确文本范围和上下文；
6. 所在段落需要具备稳定的 block ID；
7. 返回源笔记前进入显示文本确认步骤。

---

## 4. Precise Text Selection UX

进入精确文本模式后，目标笔记中应出现明显但不干扰编辑的状态提示，例如：

```text
Smart Reference

请划选需要引用的文字

Enter 确认
Esc 取消
```

用户可能从一个较长段落中只划选一句话或几个词。

示例目标段落：

```text
创新很多时候并不是凭空产生一个新的想法，
而是对异常现象保持敏感，并尝试从相反的方向理解它。
```

用户只划选：

```text
对异常现象保持敏感
```

插件应把：

- 目标文件；
- 所在 block；
- 精确选中文本；
- 选区位置；
- 必要上下文；

作为引用定位信息保存。

---

## 5. Display Text / Alias Flow

目标引用确定后，插件必须询问当前笔记中希望显示什么文字。

默认行为：

- 如果用户不输入任何内容，直接按 Enter：
  - 普通 Note / Heading / Block 引用使用合理的默认显示文本；
  - 精确文本引用默认使用刚才选中的原文。
- 如果用户输入内容后按 Enter：
  - 使用用户输入的自定义显示文本。

例如目标原文为：

```text
对异常现象保持敏感
```

用户输入：

```text
关注实验中的异常现象
```

源笔记中最终显示：

```text
关注实验中的异常现象
```

但点击后仍定位到：

```text
对异常现象保持敏感
```

---

## 6. Final Link Behavior

### 6.1 Standard Link Compatibility

最终输出必须尽可能保留合法的 Obsidian Wiki Link。

精确引用不能只生成依赖插件才能解析的自定义协议链接。

推荐的 V1 输出结构：

```markdown
[[科研/创新思维#^a82f1c|关注实验中的异常现象]] %%ref:7f31ac%%
```

其中：

```markdown
[[科研/创新思维#^a82f1c|关注实验中的异常现象]]
```

是标准 Obsidian 链接。

```markdown
%%ref:7f31ac%%
```

是插件用于恢复精确文本定位信息的隐藏引用标识。

这样：

- 插件存在时：点击链接后跳到 block，并精确高亮原始文字；
- 插件不存在时：仍然可以依靠 Obsidian 原生行为跳到目标 block。

这是项目的重要设计原则：**渐进增强，而不是插件锁定。**

---

## 7. Click / Navigation Behavior

对于普通 Note / Heading / Block 链接，可以保持 Obsidian 原生行为。

对于带 Smart Reference 元数据的精确文本引用：

1. 用户点击链接；
2. 插件识别该链接对应的 reference ID；
3. 打开目标文件；
4. 定位到目标 block；
5. 恢复精确文本范围；
6. 自动滚动到可见区域；
7. 对原始选中文本做临时视觉高亮；
8. 高亮随后自动消失或淡出。

示例：

```text
创新很多时候并不是凭空产生一个新的想法，
而是【对异常现象保持敏感】，并尝试从相反的方向理解它。
        ↑
      临时高亮
```

“精确高亮”是 V1 核心需求，不应降级为以后再做的增强项。

---

## 8. Precise Reference Resilience

不能只依赖固定字符 offset。

原因：

原文前方一旦插入内容，绝对字符位置就会变化。

因此引用恢复必须采用多层定位策略。

建议顺序：

1. **Target file**
2. **Block ID**
3. **Stored offset validation**
4. **Exact selected text search inside block**
5. **Prefix + selected text + suffix disambiguation**
6. **Fallback matching strategy**

至少应保存类似以下信息：

```ts
{
  refId: "7f31ac",
  targetFile: "科研/创新思维.md",
  blockId: "a82f1c",
  selectedText: "对异常现象保持敏感",
  startOffset: 1327,
  endOffset: 1338,
  prefix: "而是",
  suffix: "并尝试从相反的方向理解它"
}
```

具体数据结构可以在实现阶段调整，但必须保留“多层恢复”能力。

---

## 9. Temporary Highlight

精确引用点击后的高亮应优先采用 CodeMirror Decoration 或等效的非破坏式显示方式。

目标：

- 不把文本永久修改成 Markdown 高亮；
- 不依赖真实 Selection 作为唯一反馈；
- 不应破坏用户当前编辑状态；
- 自动滚动到目标；
- 高亮是临时的；
- 高亮结束后原文恢复正常显示。

未来设置项可以支持：

```text
跳转后的强调方式

○ 临时高亮
○ 真正选中文字
○ 高亮 + 选中
○ 只移动光标
```

V1 默认建议：

```text
临时高亮
```

具体持续时间属于可调实现参数，不是当前硬性产品要求。

---

## 10. Placeholder Lifecycle

占位符用于跨笔记工作流中的“返回锚点”。

推荐格式：

```markdown
%%smart-ref:<uuid>%%
```

流程：

```text
源笔记
  ↓
插入 placeholder
  ↓
打开目标笔记
  ↓
完成目标选择
  ↓
生成最终引用
  ↓
重新定位源文件中的 placeholder
  ↓
替换 placeholder
```

取消时：

```text
找到 placeholder
↓
删除
↓
恢复用户到合理状态
```

插件不应只依赖“原始行号 + 列号”，因为用户在操作期间可能修改源文件。

---

## 11. Required V1 Features

### Core

- 注册插件命令；
- 支持绑定快捷键；
- 在当前光标位置插入唯一占位符；
- 搜索并选择 Markdown 笔记；
- 支持四种引用粒度：
  - Note
  - Heading
  - Block
  - Precise Text
- 自动创建必要的 block ID；
- 精确文本选择模式；
- Enter 确认；
- Esc 取消；
- 显示文本 / Alias 输入；
- 空输入使用默认值；
- 自动返回源笔记；
- 自动替换占位符；
- 标准 Obsidian Wiki Link 作为基础输出；
- 精确引用元数据；
- 点击精确引用后：
  - 打开目标笔记；
  - 定位到 block；
  - 定位到精确文本；
  - 临时高亮；
- 原文轻微变化后的基本引用恢复；
- 完整取消与异常清理逻辑。

---

## 12. Recommended Settings

V1 可以保持设置较少，但至少预留以下配置能力：

- 默认快捷键由用户通过 Obsidian Hotkeys 配置；
- 精确跳转后的强调方式；
- 高亮持续时间；
- 是否自动为目标段落创建 block ID；
- 是否在完成后自动返回源笔记；
- 生成 Wiki Link 时是否优先使用最短路径 / 完整路径。

其中不是所有设置都必须第一批实现，优先保证主流程稳定。

---

## 13. Non-Goals

以下内容不是 V1 核心目标：

### 13.1 不做 Markdown 语法替代品

插件不能把整个系统建立在：

```text
smartref://xxxx
```

这种只有插件存在才能工作的协议上。

### 13.2 不做永久文本标记

精确引用的来源文本不应被自动改写为：

```markdown
==高亮文本==
```

或插入永久 span 标记，仅用于实现定位。

### 13.3 不要求修改 Obsidian 核心

应通过公开插件 API、编辑器扩展能力和合理的事件处理完成。

### 13.4 不做完整文献管理系统

V1 不负责：

- Zotero 替代；
- Citation Key 管理；
- BibTeX；
- 学术参考文献格式化。

项目定位是 Obsidian 内部知识引用。

### 13.5 不做自动语义判断来源

插件不会自动猜测“当前这句话应该链接到哪个笔记”。

用户仍需明确选择目标笔记和目标内容。

### 13.6 不做复杂多人协作同步系统

引用元数据需要适合 Git 管理，但 V1 不需要建立独立服务器或云同步后端。

---

## 14. Product Principles

### 14.1 User-controlled

所有引用目标必须由用户明确选择。

### 14.2 Precise but recoverable

精确到文本，但必须允许原文发生轻微变化后继续恢复。

### 14.3 Native first

尽可能建立在 Obsidian 原生 Wiki Link、Heading Link 和 Block Link 上。

### 14.4 Progressive enhancement

没有插件时，普通链接仍然应该可用。

### 14.5 Markdown ownership

用户的 Markdown 不应被私有格式锁死。

### 14.6 Minimal friction

主流程目标是：

```text
快捷键
→ 搜索目标
→ 选择粒度
→ 必要时划选
→ Enter
→ 可选 Alias
→ 完成
```

而不是让用户手工管理 block ID 或 reference ID。

---

## 15. Suggested Technical Stack

- TypeScript
- Obsidian Community Plugin API
- Obsidian Modal / SuggestModal 类能力
- Vault API
- Workspace / Editor API
- CodeMirror 6 Extension / Decoration
- Plugin data storage for reference metadata
- UUID or等价稳定 ID 生成

具体工程结构在正式编码前确定。

---

## 16. Definition of Product Success

一个核心验收场景：

1. 用户在 `Knowledge.md` 中写下：

   ```text
   关注实验中的异常现象
   ```

2. 用户调用插件；
3. 搜索并选择 `Capture.md`；
4. 选择“精确文字”；
5. 目标笔记打开；
6. 用户划选：

   ```text
   对异常现象保持敏感
   ```

7. Enter；
8. 用户将显示文字设置为：

   ```text
   关注实验中的异常现象
   ```

9. 插件返回 `Knowledge.md`；
10. 当前内容成为可点击链接；
11. 点击该链接；
12. `Capture.md` 打开；
13. 页面自动滚动到对应段落；
14. `对异常现象保持敏感` 被临时高亮；
15. 卸载插件后，该链接至少仍能通过标准 Obsidian Link 跳到对应 block。

完成上述场景，才算项目核心闭环真正成立。
