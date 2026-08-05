# SCADA Editor Lab

一个用于验证 SCADA 前端编辑和运行交互的实验项目。项目只关注浏览器中的场景编辑、组件表现和模拟状态，不包含物联网接入层或后端规则引擎。

## 当前状态

M2 已将编辑器从“单个临时水泵实例”推进为由版本化场景文档驱动的编辑器：

- `SceneDocument` 是场景持久化的唯一真相；
- 编辑模式和预览模式共用同一个 `SceneRenderer`；
- 节点位置、尺寸、旋转和状态实时写回场景文档；
- 支持添加、复制、删除和重命名水泵节点；
- 支持保存到浏览器、从浏览器恢复；
- 支持导入和导出场景 JSON；
- 导入时校验场景版本、节点类型、变换参数和水泵状态；
- 运行时归一化不同尺寸和透明边界的水泵 PNG；
- Transformer 只允许四角等比例缩放，不允许拉伸或翻转。

## 接下来的基础里程碑

在扩展组件库前，先完成编辑器基础能力：

```text
M2.1 多选、框选、吸附、参考线、对齐和均匀分布
M2.2 持久化分组、层级、锁定、可见性和图层顺序
M2.3 组件端口、直线/正交连线和端点自动跟随
M3   组件定义与 Property / Action / Event 抽象
M4   模拟数据、属性绑定和 Event -> Action 行为连接
M5   Component Lab 与组件扩展
```

详细计划见 [`PLAN.md`](PLAN.md)，编辑器核心模型见 [`docs/architecture/editor-foundation.md`](docs/architecture/editor-foundation.md)。

## 场景结构

当前实现仍为场景版本 1：

```ts
interface SceneDocument {
  version: 1
  id: string
  name: string
  width: number
  height: number
  background: string
  nodes: SceneNode[]
}
```

后续场景版本会区分：

- `nodes`：组件与分组；
- `connections`：可见管线、导线和连线；
- `behaviors`：属性、事件和动作之间的运行时关系。

可见连线与行为连接不会混用同一种边模型。

## 组件能力模型

项目借鉴 WoT 的三分法，但只作为本地前端组件契约：

- `Property`：可读取、可选可写、可绑定的组件值；
- `Action`：需要显式调用的组件操作；
- `Event`：组件发出的瞬时事件。

这里不引入 Thing Description、协议绑定或网络通信语义。

右侧检查器最终分为：

```text
基础 | 属性 | 动作 | 事件
```

其中基础页负责名称、位置、尺寸、旋转、可见、锁定、分组和图层顺序；其他页由组件定义自动生成。

## 水泵状态资源

运行时加载：

```text
public/components/pump/
├── pump-gray.png
├── pump-green.png
├── pump-blue.png
├── pump-orange.png
└── pump-red.png
```

原图允许具有不同画布尺寸和透明边距。加载后会扫描透明通道，将实际水泵内容按统一高度等比例缩放，并水平居中到 `512 × 720` 的规范化画布中。原始 PNG 不会被修改。

## 技术栈

- React 19
- TypeScript
- Vite
- Konva
- react-konva

## 本地开发

要求 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev
```

## 常用命令

```bash
npm run dev
npm run build
npm run lint
npm run preview
```

## 当前非目标

- 任意 JavaScript 表达式；
- 完整 Figma 式矢量编辑；
- 通用工作流引擎；
- 网络侧 WoT Thing Description；
- MQTT、WebSocket 或后端持久化；
- 多人协作；
- 内部叶轮动画。
