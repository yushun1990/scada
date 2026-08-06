# SCADA Editor Lab

一个用于验证 SCADA 前端编辑和运行交互的实验项目。项目只关注浏览器中的场景编辑、组件表现和模拟状态，不包含物联网接入层或后端规则引擎。

## 当前状态：M2.2 核心组合切片

编辑器已经由版本化 `SceneDocument` 驱动，并具备以下基础能力：

- 编辑模式和预览模式共用一个 `SceneRenderer`；
- 支持添加、复制、删除和重命名水泵节点；
- 支持单选、Shift/Ctrl 增减选择和空白区域框选；
- 支持拖动任一选中节点整体移动多选集合；
- 支持可配置网格吸附和组件轴吸附；
- 支持独立显示或隐藏格线，隐藏格线不会自动关闭网格吸附；
- 拖动时显示网格参考线和对象参考线；
- 支持六种对齐命令以及水平、垂直等距分布；
- 支持将多个同级节点组合为持久化 `core.group`；
- 组合节点支持整体移动、等比例缩放和旋转；
- 支持拆分组合，拆分后保持子节点当前世界位置、尺寸和角度；
- 支持组合嵌套、组合复制和包含子节点的整体删除；
- 右侧检查器已经划分为 `基础 | 属性 | 动作 | 事件`；
- 支持保存到浏览器、恢复、导入和导出场景 JSON；
- 场景版本升级为 v2，导入 v1 场景时自动迁移。

吸附、对齐、分布和父子坐标转换均由 `src/scene/geometry.ts` 中的纯函数计算。组合、拆分、复制子树和删除子树由 `src/scene/hierarchy.ts` 负责。Konva 只承担输入适配和渲染，不拥有场景几何状态。

## 操作方式

```text
点击组件                 单选
Shift/Ctrl + 点击        增加或移除选择
空白处拖动               框选
拖动任一选中节点         整体移动当前选择
组合                     将两个以上同级节点转为一个 core.group
拆分                     恢复当前组合的直接子节点
四角控制点               单节点或组合等比例缩放
顶部控制点               单节点或组合旋转
显示格线                 只控制视觉网格
网格吸附                 独立控制几何吸附
```

粉色参考线表示组件之间的轴吸附，蓝色虚线表示网格吸附。

## 场景结构

当前场景版本为 2：

```ts
interface SceneDocument {
  version: 2
  id: string
  name: string
  width: number
  height: number
  background: string
  nodes: SceneNode[]
}

interface SceneNode {
  id: string
  type: string
  name: string
  parentId: string | null
  visible: boolean
  locked: boolean
  transform: NodeTransform
}
```

组合节点使用：

```text
core.group
```

子节点的 `transform` 相对于父组合保存。组合与拆分通过世界坐标和局部坐标转换保证画面不跳动。

## 当前 M2.2 边界

本轮完成的是持久化组合的核心交互，还未实现：

- 图层树；
- 双击进入组合并单独选择子节点；
- 拖动调整节点层级顺序；
- 组合裁剪和蒙版；
- 跨不同父节点直接组合。

## 后续基础里程碑

```text
M2.2 后续：图层树、层级顺序和组内编辑
M2.3 组件端口、直线/正交连线和端点自动跟随
M3   组件定义与 Property / Action / Event 抽象
M4   模拟数据、属性绑定和 Event -> Action 行为连接
M5   Component Lab 与组件扩展
```

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
