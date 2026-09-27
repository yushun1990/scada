# ADR 提案：受控 SVG 图层函数（Layer Methods）执行

状态：**PROPOSED — 未接受，未实现**。本文件只是提案，不构成架构授权。
提出背景：issue #209 第 3 条（行为看板中管理 SVG 函数，可编辑、可运行预览）。

## 背景

issue #209 要求恢复 PR #198 时代的图层函数能力：行为看板列出为 SVG
定义的函数，每个函数可 `<>` 编辑、`▶` 运行预览，智能重构可生成函数。

PR #198 分支（`codex/component-authoring-followup`，未合并）的参考实现：

- 函数体存储在 `definition.actions[name].implementation`（作者 JavaScript 源码）；
- 运行通过 `new Function('$self', 'layers', '$emit', ...)` 直接执行，`$self`
  代理提供 `setTheme / showLayer / hideLayer / emit` 等实时变更能力。

## 冲突

该实现与两条已接受的权威正面冲突：

1. `AGENTS.md` 不可协商规则：authored definitions 不得执行 unrestricted
   JavaScript（禁止 `eval` / `new Function`）。`new Function` 在页面 realm
   执行，具备完整全局能力。
2. R0 修正（PR #200，`d591f34`）已从模型中移除 portable Action source
   execution；`ComponentActionDefinition` 已无 `implementation` 字段，
   图层检查器声明 `data-portable-action-execution="disabled"`。

按仓库契约，需求与规则冲突时应提 ADR 并等待接受，不得默默绕过。

## 现状盘点（与本提案相关、已存在的资产）

- `src/runtime/controlled-script-engine.ts`：`ControlledScriptEngine` 契约
  （`load(source, bridge, limits)` → `invoke({init|propertyChanged|action})`），
  带默认限额（50ms / 16 MiB / 512 KiB 栈），CI 有契约检查。
- `src/runtime/controlled-script-protocol.ts`：结构化宿主桥协议
  （property.get/set、event.emit、action.invoke、visual.set/clear/contribute、
  diagnostic.log），值域受控、深度/节点数有界。
- `package.json` 已含 `quickjs-emscripten-core` 与
  `@jitl/quickjs-wasmfile-release-sync`，但 `src/` 中尚无具体引擎适配
  （未接线、未打包进任何产物）。
- 声明式替代已上线：`ComponentSvgLayerBehaviorEditor` 提供主题状态函数列表
  （每行 `▶` 运行预览，纯数据变换，不执行脚本）与一键 Property/规则绑定。

## 提案（待决策的推荐项）

**受控图层函数**：允许作者为 SVG 图层编写函数，但执行必须走受控引擎：

1. **引擎**：新建懒加载的 QuickJS-WASM 适配器实现
   `ControlledScriptEngine`（动态 `import()`，独立 chunk，附 before/after
   bundle 报告——满足“重依赖需已接受的设计决策 + 懒加载证明”）。
2. **能力面**：函数内只能通过宿主桥发起结构化调用。图层函数桥接
   `svg.theme.set(state)`、`layer.visibility.set(id, bool)`、
   `property.set/get`、`diagnostic.log`；不提供 DOM/React/Konva/Three 访问。
3. **持久化**：函数源码作为组件私有视觉实现存储（Visual 层，非公开
   Action/Event 契约），包导入时按 fail-closed 校验（大小上限、禁止实体、
   语法白名单解析）。
4. **运行域**：编辑器 `▶` 预览与运行时求值都只经过同一引擎与限额；
   超限/超时 fail-closed 并给出诊断。
5. **回滚**：不迁移历史数据；本提案不接受则维持现状（声明式主题行为）。

## 备选

- **B1 维持现状**：行为看板保持声明式（本仓库已按此交付 issue #209 的
  合规部分）。
- **B2 DSL 化**：不引入 JS 引擎，把函数表达能力做成受限 DSL/规则组合。
  表达力弱但零执行面。

## 需要的决策

接受本提案（或 B1/B2），并确认：QuickJS 懒加载适配器是否授权实现；
图层函数是否随组件包持久化导出。
