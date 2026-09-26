# Obsidian 插件开发关键踩坑与工程经验

本文总结 Smart Reference V1 中可复用的工程经验，重点面向需要同时处理
Live Preview、Reading View、CodeMirror 6、DOM postprocessing、Backlinks、精确文本
定位以及生成式 Markdown 元数据的 Obsidian 插件。它不是开发流水账，而是一份用于
设计、排错和评审类似插件的参考。

## 1. 核心设计原则

最重要的架构决定是：**Markdown 必须始终是 source of truth。** Smart Reference
写入笔记的基础形式仍然是有意义的原生 Wiki Link，并在相邻位置绑定精确引用身份：

```markdown
[[Target#^sr-id|Alias]]<!--smart-ref:uuid-->
```

`[[Target#^sr-id|Alias]]` 在插件停用时仍是 Obsidian 能理解的 block link；
`<!--smart-ref:uuid-->` 让插件能够恢复更精确的定位信息。Reading View、Live Preview
和 Backlinks 可以在显示层隐藏这些实现细节，但 Source mode 必须保留完整原文。

这种方案比以下做法更安全：

- 自定义 protocol 会让链接在插件缺失时失去意义，并削弱 Obsidian 原生链接能力。
- 永久重写可见文本会把呈现策略混入用户数据，容易破坏 alias、上下文和编辑体验。
- 把全部引用身份只存在插件数据中，会使 Markdown 与插件状态脱节，迁移、备份和
  故障恢复都更脆弱。
- 完全依赖 DOM 状态无法跨视图、重新渲染、应用重启或 Obsidian 版本变化稳定工作。

这里可以归纳为一句原则：**存储层保持真实和可降级，显示层负责美化。** 显示层的
隐藏、替换和高亮都应是可撤销的 presentation effect，不能成为数据正确性的前提。

## 2. Reading View 与 Live Preview 是两个完全不同的系统

Reading View 和 Live Preview 看起来都在“显示 Markdown”，但不能把它们当成同一个
renderer。

Reading View 的核心是 Markdown renderer 生成的 DOM。插件可使用
`registerMarkdownPostProcessor` 建立关联，读取渲染后的 Text nodes，并用 DOM Range
包裹精确匹配的文本。Smart Reference 的 Reading View 高亮先从当前 Markdown 找到
block，再把完整 block 渲染到 detached container，用其可见文本匹配实际 paragraph
或 list item，最后把选中文本映射回目标 DOM Text nodes。

Live Preview 则由 CodeMirror 6 驱动。稳定的坐标是 editor document position，适合用
`StateField`、`Decoration.mark()` 和 `Decoration.replace()` 表示临时高亮或语法隐藏。
`.cm-hmd-internal-link`、`.cm-underline` 等 DOM class 对点击识别有用，但它们不是可靠的
文档语义来源；CodeMirror 会拆分、合并或重建这些 token DOM。

因此，一个在 Reading View 中正确的 postprocessor 或 DOM Range 方案，并不意味着它
能在 Live Preview 中工作。反过来，CM6 decoration 也不应被硬套到 Reading View。
两个视图应共享 parser、reference identity 和 locator，保留各自独立的呈现与高亮策略。

## 3. 不要假设 Obsidian 的 DOM，必须看真实 Vault DOM

Backlinks 调试最初很容易假设搜索结果包含普通 `<a>`，然后围绕 anchor 的 `href`、
click handler 或 sibling 设计清理逻辑。真实 Vault 的关键结构却是：

```text
.backlink-pane
  -> .search-result-file-match.tappable
       -> .search-result-file-matched-text
       -> sibling spans containing metadata
```

结果行本身拥有 Obsidian 的原生点击行为，内部可能完全没有 anchor。Smart Reference 的
raw Wiki Link 位于 `.search-result-file-matched-text`，而 `<!--smart-ref:uuid-->` 可能被
渲染到 sibling span。这解释了为什么只扫描 anchor 或单个 matched span 会漏掉内容。

真实 `outerHTML`、child class、Text node owner 和 “anchor count = 0” 比反复推测 renderer
行为更有价值。对未公开的 Obsidian UI 写 selector、事件拦截或 DOM mutation 之前，应在
**确切失败状态**下抓取实际 DOM，而不是根据 Reading View、浏览器惯例或测试 fixture
猜测结构。Fixture 应由真实 DOM 反向校准。

## 4. 最难查的问题：Live Preview 中 Backlinks 被 `.cm-editor` 误杀

这个问题体现了“看起来合理的安全边界”如何变成隐蔽的 early return。

- commit `54aa199` 初次加入 Backlinks 清理时，为避免碰到 editor 内容，使用了宽泛的
  `.cm-editor` 排除。
- commit `a9edbd9` 根据真实结构把 row 限定为 `.search-result-file-match`，并把 Wiki Link
  处理限定到 `.search-result-file-matched-text`，但旧排除仍然存在。
- 真实 Obsidian 会把 genuine Backlinks pane 放在 Live Preview 的 `.cm-editor` 内。
- 因而合法 row 在 parser、mutation 甚至 matched-text diagnostic log 运行之前就返回。
- Reading View 不位于同一祖先结构，所以表现正常，问题因此长期看起来像 mode switch、
  render timing 或 observer lifecycle 故障。
- commit `5350d0a` 删除了这个遗留排除，并补上“Backlinks 嵌在 `.cm-editor` 内”的回归测试。

有问题的思路可简化为：

```ts
row.closest(".cm-editor")
```

它在逻辑上很有吸引力：插件确实不应修改普通编辑器正文。但这里把“祖先是 editor”误当
成“节点是 editor content”。最终安全边界改为正向结构约束：row 必须是
`.search-result-file-match`，必须位于 `.backlink-pane`，而 Wiki Link syntax conversion
只允许发生在 `.search-result-file-matched-text`。这样，即使 Backlinks pane 被嵌在
`.cm-editor` 内也能处理；`.backlink-pane` 外的普通 CodeMirror 内容仍完全不触碰。

通用结论是：**优先使用 positive structural scoping，不要用宽泛的 negative ancestry
exclusion 代替真实边界。**

## 5. 不要过早把渲染问题归因于“生命周期”

Backlinks 调试期间尝试和加强过多种生命周期信号：

- `MutationObserver` timing
- `file-open`
- `active-leaf-change`
- `layout-change`
- Reading View / Live Preview mode changes
- 多轮 `requestAnimationFrame`
- hover / focus 后的 rerender

其中一部分确实有用。Obsidian 会重建 pane、复用 row，也会在 hover、focus 或同 leaf
文件切换后重新写入内容，observer 和延迟重试必须覆盖这些行为。但最关键的 Live Preview
失败并不是时序问题，而是目标 row 被 eligibility guard 主动跳过。增加再多 timer 也无法
让一个永远不进入处理路径的节点被清理。

这里最有价值的证据是：bug 出现时，连函数内部预期的 diagnostic log 都没有；切换到
Reading View 后日志立刻恢复。缺失日志本身说明 early return 发生在 logging 之前。

当 retries 或 timers 不改变结果时，应按以下链路逐层核实：

```text
input DOM
  -> eligibility guard
  -> parser result
  -> DOM mutation / CM6 dispatch
  -> visible result
```

只有确认目标确实通过前几层后，才值得继续增加 lifecycle handling。生命周期机制可以
解决真实 rerender，但不能替代 root-cause analysis。

## 6. Live Preview 中隐藏语法：CSS 不等于文档级隐藏

生成的 Smart Reference link 内含内部 destination fragment：

```text
#^sr-xxxxxxxx
```

早期方案尝试给 CodeMirror token 或 mark decoration 加 CSS。它在普通内容上可能有效，
但嵌入 Obsidian 自己的 Wiki Link decorations 后不可靠：DOM token 层级、display 规则和
editor 的重建过程都可能改变实际效果。

更稳健的方案是直接从 CM6 document text 解析 Smart Reference，得到明确的 `[from, to)`
范围，再对 link fragment 和独立生成的 block ID 使用：

```ts
Decoration.replace({ inclusive: false }).range(from, to)
```

完整 HTML/legacy marker 也由 document range 派生并用 decoration 隐藏。`StateField`
根据 `docChanged` 和 Live Preview mode 变化重建 decoration；Source mode 返回
`Decoration.none`，所以 raw Markdown 会重新可见。

`Decoration.mark()` 适合“给现有文本增加样式”，`Decoration.replace()` 则表达“在当前
视图中用空呈现替代这个已知文档范围”。对于 semantic concealment，后者比猜测
`.cm-blockid` 或其他 transient token class 更可靠。通用原则是：**CM6 的语义应来自
document ranges，而不是渲染后 DOM class。**

## 7. 只隐藏插件生成的 block ID，绝不能误伤用户 block ID

插件生成的 anchor 使用明确 namespace：

```text
^sr-...
```

用户自己创建的 ID，例如：

```text
^my-custom-id
```

必须保持可见且不受影响。隐藏逻辑只匹配 `^sr-[a-z0-9]+`，并进一步约束它在 Wiki Link
destination 或合法 line-ending block ID 位置出现。相同区分也用于 Reading View 和
Backlinks。

`sr-` 前缀不仅是命名风格，更是安全边界。任何会写入用户 Markdown 的插件产物，都应
采用不易与用户内容冲突、可精确识别、可单独迁移的 namespace。显示清理、迁移脚本和
卸载降级都依赖这条边界。

## 8. 不要用 `innerHTML` / `textContent` 重建可点击结果行

Backlinks row 是 Obsidian 管理的原生 UI，row 本身持有 click behavior、内部状态和
navigation ownership。直接重写 `row.innerHTML` 或 `row.textContent` 可能销毁：

- 已绑定的 event listeners
- renderer 内部节点引用和状态
- native navigation 行为
- 后续增量渲染所依赖的 DOM identity

最终实现只在受影响的 child Text nodes 上按字符 range 拆分文本，并把需要隐藏的部分
包进最小 span；row、matched span 和未命中节点保持原 identity。卸载时 wrapper 会被
展开，原始文本恢复。

调试时观察到一个很有用的区别：

- `innerText` 可以只显示 alias，因为隐藏 wrapper 不参与可见文本。
- `textContent` 仍可包含原始 `[[Target#^sr-id|alias]]`，因为原 Text nodes 仍在 DOM 中。

这不是清理失败，而是 presentation-only concealment 正常工作的证据。修改第三方 UI
DOM 时，应做最小 mutation，并尽可能保留 host application 的 node identity。

## 9. 精确文本跳转必须有分层恢复策略

一个 Precise Reference 保存多组互补锚点：

- target file
- block ID
- selected text
- start/end offsets
- prefix
- suffix

恢复流程在概念上是：

```text
target file
  -> block ID
  -> validate stored offsets
  -> exact selected-text search in current block
  -> prefix/suffix disambiguation
  -> block-level fallback
```

offset 很快，但前文插入字符后会过期；selected text 能抵抗位置移动，但重复文本会产生
歧义；prefix/suffix 可以消歧，但上下文也可能被改写；block ID 提供稳定粗粒度范围，却
不能独自恢复段内精确选择。因此不能信任单一坐标系。

Reading View 在 current Markdown 中恢复 block，再把 rendered DOM Text nodes 映射为
DOM Range。Live Preview/editor 则将恢复后的 offsets 经 `editor.offsetToPos()` 验证，
转换成 CodeMirror document range，并应用 `Decoration.mark()`。两条呈现路径不同，但
共享同一分层 locator 和 block fallback。

通用结论是：**保存冗余但互补的 anchors，而不是押注一个脆弱位置。**

## 10. 原生 Markdown fallback 是非常重要的保险

即使精确 metadata 缺失、插件未加载、关联存在歧义或高亮暂时不可用：

```markdown
[[Target#^block-id|Alias]]
```

仍是可读、可编辑、可由 Obsidian 原生跳转的链接。metadata 的作用是增强段内精度，
而不是把基础导航变成插件私有能力。click interception 也应只在 reference、target 和
关联验证成功后取消 native click；无法安全关联时保留原生行为。

凡是会向用户笔记写入内容的插件，都应考虑停用、卸载、数据文件丢失和版本不兼容时的
表现。良好的插件应该 graceful degradation，而不是让用户内容被插件锁定。

## 11. `MutationObserver` 必须考虑自触发循环

DOM cleanup 自身会产生 mutation：

```text
plugin wraps Text node
  -> observer sees mutation
  -> cleanup runs again
  -> plugin writes DOM again
```

如果每次扫描都无条件 reveal/rewrite，就可能形成循环或持续 layout work。最终实现结合：

- row 与 matched-text 的 content-state tracking
- hidden wrapper 是否仍完整的 verification
- 稳定状态下避免不必要 DOM writes
- `observer.takeRecords()` 消化插件自身产生的已知记录
- unload 时取消 pending frame、断开 observer 并移除 wrapper

但 cache 也不能只记 Element identity 后永久跳过。Obsidian 可能复用同一个 DOM node，
并把它的内部文字恢复为完全相同的 raw syntax；此时 Element 没变，内容却需要再次隐藏。
所以 cache 必须结合当前 content state 和 wrapper presence 判断。

MutationObserver 代码需要同时满足两件事：防止自触发循环，也能识别 host renderer 对
既有节点的重新写入。

## 12. same-leaf navigation 与 Obsidian 生命周期事件

在同一个 Markdown leaf 内打开另一个文件，不一定触发 `active-leaf-change`。如果只依赖
active leaf 变化，Live Preview 中的 Backlinks pane 可能已经刷新，而 cleanup 没收到
对应信号。`file-open` 因而是独立且有价值的 signal；它允许在 pane 刷新后进入已有的
immediate/frame/settled cleanup pipeline。

`layout-change`、pane discovery observer、mode detection、pointer/focus rerender handling
也各自覆盖真实出现过的行为。不过，根因确认后应定期复审这些机制是否重叠、是否还能
简化。当前它们不是已知 bug，但属于值得后续评估的 technical debt：调试阶段积累的
lifecycle layers 会增加性能、维护和兼容性成本。

## 13. Debug 日志必须可运行时开启，而不是永久污染控制台

最终保留的诊断开关可在 Obsidian developer console 中运行时启用：

```js
localStorage.setItem("SMART_REFERENCE_DEBUG", "true")
```

关闭方式：

```js
localStorage.removeItem("SMART_REFERENCE_DEBUG")
```

`debugLog` 每次调用都在运行时读取 `localStorage`，而不是依赖会被 bundler constant-fold
的 compile-time constant；payload 使用 lazy callback，关闭日志时不会收集 note text、
序列化 DOM 或触发布局读取。这样 production console 保持安静，真实 Vault 出现问题时
又无需重新 build 就能开启诊断。

定位阶段临时加入的 unconditional `console.log`、完整 `outerHTML` dump 和大段 Text node
快照，应在根因确认后删除。长期日志只保留能回答“走了哪条路径、处理多少节点、为何
fallback”的小型、受开关控制的诊断。

## 14. 不要只相信单元测试，也不要只相信人工测试

这轮开发的有效验证组合是：

```bash
npm test
npm run typecheck
npm run build
git diff --check
```

再加完整 real Obsidian Vault regression。

自动测试和 DOM fixtures 擅长验证 parser、range mapping、歧义处理、ordinary Wiki Link
隔离、observer loop protection、node identity、mode switch 以及 deterministic fallback。
它们速度快，适合每次提交都运行。

只有真实 Obsidian 才暴露了以下问题：

- private Backlinks DOM 的真实 hierarchy 和无 anchor 结构
- Backlinks pane 被嵌入 `.cm-editor`
- Obsidian 自身 Wiki Link decoration 与自定义 CSS mark 的相互作用
- hover、focus、same-leaf navigation 等 renderer timing
- 原生 click ownership 位于 tappable row，而不是内部 link

反过来，人工测试很难穷举重复文本、普通链接不受影响、缓存重处理和 observer 不循环等
边界。对依赖未公开 application internals 的插件，real-application regression 本身就是
test suite 的一部分，两类验证缺一不可。

## 15. Git / Codex / ChatGPT 协作经验

有效的协作流程是：

1. 每个问题在独立 feature branch 上实现。
2. Codex 修改代码、补 regression test、运行 tests/typecheck/build/diff check。
3. 每个有意义的 checkpoint 都 commit 并 push，保证状态可复查、可回退。
4. Review 时检查实际 Git commit、diff 和当前 source，而不是只读对话总结。
5. ChatGPT/Codex review 负责发现实现、历史和文档中的不一致。
6. 用户在 real Vault 中验证只有真实 Obsidian 才能暴露的行为。
7. 自动检查、代码 review、文档和 real-Vault regression 全部通过后才合入 `main`。

这轮最关键的协作教训是：**不要只根据 agent summary 诊断持续存在的 bug。** 最终找到
`.cm-editor` 遗留排除，依赖直接阅读 `src/backlinks-cleanup.ts` 并比较 `54aa199`、
`a9edbd9` 和后续历史。摘要可以帮助建立上下文，但 Git 才是实现事实的权威来源。

## 16. 如果重新开发一次，建议的排错顺序

1. 建立稳定、最小的复现步骤，并记录成功与失败视图。
2. 先区分 Reading View、Live Preview 和 Source mode。
3. 抓取实际 DOM，或读取 CM6 document/state 和明确的 source ranges。
4. 确认目标是否通过 eligibility guard，是否真的进入处理路径。
5. 单独验证 parser/association 的输入与输出。
6. 确认 DOM mutation 或 CM6 decoration dispatch 确实执行，并检查实际结果。
7. 前六步成立后，再调查 lifecycle、rerender 和 timing。
8. 加最小、可运行时开启的 gated diagnostics。
9. 修复最窄的 root cause，避免顺手重构相邻系统。
10. 为根因加入 regression test，并覆盖普通内容不受影响。
11. 在 real Vault 中按原复现步骤和关键回归项验证。
12. 删除临时 unconditional diagnostics，保留少量长期可用日志。

## 17. 本轮最值得保留的工程结论

- Source of truth 与 presentation layer 必须分离。
- Positive structural scoping 比宽泛排除更安全。
- Real DOM 比基于经验的假设更可信。
- 缺失的 diagnostic log 可以定位 logging 之前的 early return。
- Native Markdown fallback 显著提高可恢复性和可迁移性。
- 修改 host application UI 时，应保留 DOM identity 和原生事件归属。
- CM6 语义应从 document ranges 获取，而不是依赖 transient DOM tokens。
- Lifecycle complexity 不能代替 root-cause analysis。
- 每个 production bug 都应留下能复现根因的 regression test。
- Review 应检查真实 source、diff 和 commit history，而不是只信 agent summary。

## Appendix A — Important selectors / APIs

### Obsidian private DOM selectors

```text
.backlink-pane
.search-result-file-match
.search-result-file-matched-text
.cm-editor
.cm-hmd-internal-link
.cm-underline
```

这些 selector 来自当前 real-Vault DOM，其中尤其是 Backlinks 和 CodeMirror DOM class
都不是稳定 public API。Obsidian 升级后应重新检查实际结构，并把它们视为 compatibility
risk，而不是长期契约。

### CodeMirror 6

- `StateField`：保存和随 transaction 更新 decoration state。
- `Decoration.replace()`：按 document range 在当前视图替换/隐藏内部 syntax。
- `Decoration.mark()`：为精确文本 range 添加非破坏式临时高亮或样式。
- `EditorView.atomicRanges`：让被替换的实现细节在编辑交互中作为整体范围处理。

### Obsidian

- `MarkdownView`：访问当前文件、editor、view data 和 view mode。
- `MarkdownView.getMode()`：区分 `preview` 与 `source`；source 内还需用 Live Preview
  field 区分 Live Preview 和 raw Source mode。
- `registerMarkdownPostProcessor`：处理 Reading View 渲染结果。
- `file-open`：覆盖同 leaf 内文件变化。
- `active-leaf-change`：覆盖 active workspace leaf 变化，但不能替代 `file-open`。
- `layout-change`：在 workspace/layout 重建后重新发现 private panes。

## Appendix B — Important commits from this debugging cycle

以下说明依据 Git 中的实际 subject 和 diff，而不是对话记忆：

- `54aa199` — `fix: conceal Smart Reference metadata in Backlinks UI`：首次加入
  `src/backlinks-cleanup.ts`、observer 和 Backlinks metadata concealment；同时引入后来
  被证明过宽的 `.cm-editor` exclusion。
- `a9edbd9` — `fix: clean Backlinks matched-text references`：根据真实 Backlinks 结构把
  Smart Reference Wiki Link alias conversion 限定到
  `.search-result-file-matched-text`，并允许 sibling metadata 单独清理；旧 editor guard
  仍然保留。
- `04fce12` — `fix: intercept Live Preview internal link span clicks`：让点击处理识别
  `.cm-hmd-internal-link` 及其 nested span，并从当前 editor context 解析 reference 后复用
  统一 navigation pipeline。
- `5a4de38` — `fix: hide generated block IDs in rendered views`：在 Reading View 与
  Live Preview 隐藏插件生成的 `^sr-...`，同时保留普通用户 block IDs。
- `23f813e` — `fix: restore Smart Reference aliases in Reading View`：修复 Reading View
  把生成目标显示成 target fragment 的问题，恢复 source alias 而不改写普通链接。
- `2b4afd3` — `fix: reprocess restored Backlinks syntax`：把永久 element-level skip 改为
  content-state 与 wrapper-state 判断，使 Obsidian 在相同节点恢复 raw syntax 后仍会再次
  清理。
- `5350d0a` — `fix: clean Live Preview embedded Backlinks`：删除遗留的 `.cm-editor`
  exclusion，并加入 Backlinks pane 嵌在 Live Preview editor 内、普通 editor Markdown
  不受影响、row click 保持有效的 regression test。
- `4730303` — `chore: finalize Backlinks integration cleanup`：移除调试期临时诊断代码，
  保留受 `SMART_REFERENCE_DEBUG` 控制的有效日志，并记录最终根因和 real-Vault 结果。
- `ff1cc4e` — `docs: record final V1 Vault validation`：把完整 V1 real-Vault regression
  结果写入权威状态文档，清除已经过期的“待验证”状态。
- `8121c57` — `docs: mark V1 integration complete`：在 fast-forward 合入后把 README、
  `CURRENT_STATUS` 和 `TASKS` 更新为 `main` 已集成 V1、最终 review 完成。
