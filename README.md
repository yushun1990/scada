# SCADA Editor Lab

一个用于验证 SCADA 前端编辑和运行交互的实验项目。项目只关注浏览器中的场景编辑、组件表现和模拟状态，不包含物联网接入层或后端规则引擎。

## 当前状态：M2.3 正交连接切片

编辑器由版本化 `SceneDocument` 驱动，目前具备：

- 编辑模式和预览模式共用一个 `SceneRenderer`；
- 支持添加、复制、删除和重命名水泵节点；
- 支持单选、Shift/Ctrl 多选和空白区域框选；
- 支持多选整体移动、六种对齐和水平/垂直等距分布；
- 支持网格吸附以及始终开启的组件边缘/中心轴吸附；
- 支持独立显示或隐藏格线；
- 支持单节点和组合的等比例缩放与旋转；
- 支持持久化 `core.group`、嵌套组合、拆分和子树复制；
- 组合节点可以递归设置组内兼容组件的公共属性；
- 水泵定义归一化进水口、出水口和端口向外方向；
- 支持端口拖拽建立连接；
- 支持直线和正交自动路由，新建连接默认使用正交路由；
- 正交路由包含端口短引线和水平/垂直折线，并自动移除重复折点；
- 支持端口悬停放大、光标反馈和端口名称/方向提示；
- 支持连线选择、删除、名称、颜色、线宽和实线/虚线设置；
- 移动、旋转、缩放、组合或拆分后，连线和端口实时跟随；
- 删除组件时自动删除失效连线；
- 复制组合时复制组合内部连线；
- 支持保存到浏览器、恢复、导入和导出场景 JSON；
- 场景版本为 v3，导入 v1/v2 场景时自动迁移。

吸附、对齐、分布和父子坐标转换由 `src/scene/geometry.ts` 中的纯函数计算。组合、拆分、复制子树和递归删除由 `src/scene/hierarchy.ts` 负责。组件端口定义位于 `src/components/ports.ts`，直线与正交路由位于 `src/scene/connection-routing.ts`。Konva 只承担输入适配和渲染，不拥有场景状态。

## 操作方式

```text
点击组件                 单选
Shift/Ctrl + 点击        增加或移除选择
空白处拖动               框选
拖动任一选中节点         整体移动当前选择
组合                     将两个以上同级节点转为 core.group
拆分                     恢复组合的直接子节点
四角控制点               单节点或组合等比例缩放
顶部控制点               单节点或组合旋转
显示格线                 只控制视觉网格
网格吸附                 控制是否额外吸附到网格
进入连线模式             显示组件端口
悬停端口                 显示端口名称和输入/输出方向
端口拖到兼容端口         建立正交连接
点击连线                 选择并在右侧编辑样式
```

端口颜色：

```text
橙色：输入端口
绿色：输出端口
```

粉色参考线表示组件之间的轴吸附，青色虚线表示网格吸附。格线本身只使用中性灰色，蓝色保留给组件选中框、连接端点标记和变换控制点。

## 场景结构

当前场景版本为 3：

```ts
interface SceneDocument {
  version: 3
  id: string
  name: string
  width: number
  height: number
  background: string
  nodes: SceneNode[]
  connections: SceneConnection[]
}

interface SceneConnection {
  id: string
  name: string
  source: { nodeId: string; portId: string }
  target: { nodeId: string; portId: string }
  routing: 'straight' | 'orthogonal'
  style: {
    stroke: string
    strokeWidth: number
    dash: 'solid' | 'dashed'
  }
}
```

连接端点只保存 `{ nodeId, portId }`，不保存绝对坐标。端口位置和向外方向由组件定义与当前世界变换动态计算，因此组件层级与几何变化不会破坏连接关系。

正交路由不会持久化自动生成的折点。每次渲染时根据端口位置、端口方向和固定安全距离重新计算，因此移动、旋转或组合后无需修改连接数据。

## 性能边界

动态内容集中在一个 Konva Layer 中，背景和格线位于独立静态 Layer。组件拖动和连线预览通过 `requestAnimationFrame` 合并，每个动画帧最多更新一次；拖动时只重算受影响组件的端口与关联连线。

每个水泵只渲染当前状态的一张规范化图片，Canvas 像素比固定为 1，避免高 DPI 桌面将全画布重绘成本按设备像素比平方放大。

## 可视连接与行为连接

这两种关系严格分离：

```text
SceneConnection
管道、导线、流程线等画面上的可见几何关系

BehaviorLink
Event -> Action、Event -> Property、Property -> Property 等运行时关系
```

当前 M2.3 只实现 `SceneConnection`。Property、Action、Event 的行为连接在 M4 实现。

## 当前 M2.3 边界

本轮完成的是正交自动路由和端口反馈，尚未实现：

- 拖动连线端点重新连接；
- 手动折点与折点删除；
- 避障路由；
- 管道箭头、流向动画和复杂装饰；
- 键盘连线操作。

下一切片先完成端点重连和编辑器命令边界，再决定是否加入手动折点。随后进入 M3 组件定义与 Property / Action / Event 抽象。

详细计划见 [`PLAN.md`](PLAN.md)，编辑器核心模型见 [`docs/architecture/editor-foundation.md`](docs/architecture/editor-foundation.md)。

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
