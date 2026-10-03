# ADR：受控 private Layer Operation 编辑器执行

状态：`accepted`（2026-09-27 issue #209 的受控编辑器执行决策）；本文的语义与
范围修正随 [Component input/output ADR](adr-component-input-output-composition.md)
审阅（`active`，2026-10-03）。接受该修正后，以下正文取代旧提案的能力面和运行域
描述；原有隔离、限额、私有数据与便携执行边界保持。

文件名、`methods` 字段及 `LayerMethod` API 名保留兼容性，不代表对象方法模型。
公共 Component **Action（操作）** 与 private **Layer Operation（图层操作）**
是不同边界；内部 Message 不替代公共 Action/Event vocabulary。

## 原决策背景与保留范围

issue #209 要求在图层看板列出、编写、编辑与 `▶` 试运行 SVG 函数。
PR #198 未合并参考实现曾将作者源码放入公开
`definition.actions[name].implementation`，通过页面 realm 的 `new Function`
执行。该路径违反仓库不可协商的执行规则；M10-R0/PR #200 已移除公开 Action
源码执行。恢复它不是本决策的目标。

接受的替代是 **编辑器内显式调用的私有视觉操作**：

- `src/runtime/controlled-layer-method-engine.ts` 独立实现懒加载 QuickJS-WASM
  执行；它不是通用 `ControlledScriptEngine.load/invoke` 的已接线适配器。
- 内存、栈、时间有界；沙箱不获得宿主 DOM/React/Konva/Three、网络和计时器。
- 作者只能产生结构化的 allowlisted 宿主请求，宿主验证并应用结果。
- `SvgVisualLayer.methods`（现已在 `VisualLayerBase` 支持普通视觉图层）是私有
  实现数据，持久化/包转移不使它成为公开 Action/Event 或便携执行入口。
- 便携用户 runtime 仍只执行已接受的声明式视觉规则/动画；公开 Actions/Events
  的 ready/export/activation 限制、`implementationDraft` inert 与资源闭包不变。

后续非 SVG 支持的历史实现记录见
[issue #209 progress](../progress/issue-209-svg-interaction-optimization.md)。
普通 SVG/Image/Vector/Text/Group 不因此获得完整 Component contract。

## 能力面：以当前实现为准的审计

当前 `runLayerMethod` 接受视觉图层快照，返回 `ops`。宿主桥只支持：

| 请求 | 当前消费方式与边界 |
| --- | --- |
| `setTheme` | 校验主题状态；检查器对选中的 managed SVG 使用纯文档变换。非 SVG 当前不应用，需后续补齐 kind rejection。 |
| `setLayerVisible` | 校验目标在传入快照的 ID 集合内；检查器写回私有 authored visual。快照成员资格不是任意 sibling 的 ownership 授权。 |
| `emit` | 收集事件名及 payload 到运行结果；检查器不转交 `PreviewRuntime.emitEvent`，不校验公开 Event schema。只是 inert 编辑器结果数据。 |
| `log` | 收集有长度上限的日志到运行结果；不是设备或网络 effect。 |

旧能力清单中的 `property.set/get` **撤销**：当前图层引擎没有该桥，图层操作
不得获得 semantic Property 写权限。通用 controlled-script protocol 中的
Property setter 是未接入此路径的实验接口，不构成可复用的公共状态 authority。

`$self`、`setVisible`、`$self.layers[i].show = ...` 是沙箱内记录请求的兼容 facade，
没有宿主图层/renderer 对象引用。它们的对象式外观不能成为未来 API 设计依据。
新操作设计以稳定目标、类型化输入、显式 scope 和宿主校验为中心；组件内跨图层
编排如有需要应由明确的组件私有 owner 授权，不能从快照自动推导权限。

## 校验与失败语义

当前数据校验覆盖名称、重复项、元数据/源码长度、数量与参数结构；源码语法错误
在 QuickJS 试运行时诊断。旧提案“源码语法白名单解析”的描述不成立：
`assertSvgLayerMethods` 不解析或证明源码安全。执行隔离和宿主请求校验才是当前
运行边界；静态 SVG 禁止可执行内容的安全规则仍独立存在。

宿主仅在 `result.ok` 时应用当前运行结果。未来修正须先验证完整请求集合的 scope、
target kind 和值域，再一次性应用；失败、失效目标或过时的异步结果不得部分提交。
这些提交与 ownership 缺口记录在 [CIO 审计](../progress/component-input-output-audit.md)，
本次文档 PR 没有修正 UI/runtime，也不声称现有沙箱测试证明了完整的提交原子性。

## 编辑器试运行与运行时的区分

当前 `▶` 会通过 `onUpdateLayer` / `onUpdateVisual` 改写 authored visual，
并非仅 transient runtime preview。后续纠偏应使测试预览不持久化；用户明确应用
视觉结果时，由宿主以 **一个原子、可撤销命令** 提交。失败与取消保留原文档。
运行时私有视觉 overlay 不得写包、Attribute、semantic Property 或编辑器历史。

旧“编辑器与 runtime 都经过同一引擎”建议 **不再有效**。共享引擎不能代表已经
接受了 runtime 执行：当前只授权编辑器测试，不在 Preview composite registration
或 standalone 接线，也不自动执行导入包里的源码。

要开放便携 authored public Action/Event 或运行时私有操作，必须另有 accepted ADR、
能力/隔离与生命周期模型、版本化解析/迁移/失败恢复、Preview/standalone parity
和所需浏览器证据。仅改名或使用同一 QuickJS 引擎不能越过这个门。

## 兼容与非目标

- 保留现有私有 `methods` 源码数据、旧 facade 与 pure theme/rule/animation 实现；
  不为术语批量改写历史源码或升级 schema。
- 不将 private operation 自动加入 `ComponentDefinition.actions`；`$emit` 不接到
  public Event，不发明所有视觉类型的假 Component contract。
- 不实现 nested Component Layer、父子 Event forwarding、Scene Trigger/Effect
  authoring、通用方法注册、任意 Property mutation、设备协议或 unrestricted JS。
- 原决策的替代方案（保持声明式、以后评估受限 DSL）仍可用于后续需求评审，
  不重新打开已接受的 M6–M10 gate。迁移顺序以 CIO ADR/PLAN 为准。
