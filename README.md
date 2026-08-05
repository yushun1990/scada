# SCADA Editor Lab

一个用于验证 SCADA 前端编辑和运行交互的实验项目。项目只关注浏览器中的场景编辑、组件表现和模拟状态，不包含物联网接入层或后端规则引擎。

## 当前状态：M2.1

编辑器已经由版本化 `SceneDocument` 驱动，并完成第一批基础几何编辑能力：

- 编辑模式和预览模式共用一个 `SceneRenderer`；
- 支持添加、复制、删除和重命名水泵节点；
- 支持单选、Shift/Ctrl 增减选择和空白区域框选；
- 支持拖动任一选中节点整体移动多选集合；
- 支持可配置网格吸附；
- 支持节点左、中心、右、顶、中、底轴吸附；
- 拖动时显示网格参考线和对象参考线；
- 支持六种对齐命令；
- 支持水平和垂直等距分布；
- 单节点继续支持等比例缩放和旋转；
- 右侧检查器已经划分为 `基础 | 属性 | 动作 | 事件`；
- 基础页可编辑名称、坐标、尺寸、旋转、可见性和锁定；
- 属性页暂时编辑水泵 `state`，后续由组件定义自动生成；
- 支持保存到浏览器、恢复、导入和导出场景 JSON；
- 导入旧版 M2 场景时会自动补全 `visible` 和 `locked`。

吸附、对齐和分布均由 `src/scene/geometry.ts` 中的纯函数计算。Konva 只承担输入适配和渲染，不拥有场景几何状态。

## 操作方式

```text
点击组件                 单选
Shift/Ctrl + 点击        增加或移除选择
空白处拖动               框选
拖动任一选中组件         整体移动当前多选集合
四角控制点               单组件等比例缩放
顶部控制点               单组件旋转
```

粉色参考线表示组件之间的轴吸附，蓝色虚线表示网格吸附。

## 后续基础里程碑

```text
M2.2 持久化分组、父子层级、图层树和层级顺序
M2.3 组件端口、直线/正交连线和端点自动跟随
M3   组件定义与 Property / Action / Event 抽象
M4   模拟数据、属性绑定和 Event -> Action 行为连接
M5   Component Lab 与组件扩展
```

详细计划见 [`PLAN.md`](PLAN.md)，编辑器核心模型见 [`docs/architecture/editor-foundation.md`](docs/architecture/editor-foundation.md)。

## 场景结构

当前场景版本仍为 1：

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

节点已经包含：

```ts
interface SceneNode {
  id: string
  type: string
  name: string
  visible: boolean
  locked: boolean
  transform: NodeTransform
  props: Record<string, unknown>
}
```

下一场景版本会继续区分：

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
