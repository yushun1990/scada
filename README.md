# SCADA Editor Lab

一个用于验证 SCADA 前端编辑和运行交互的实验项目。项目只关注浏览器中的场景编辑、组件表现和模拟状态，不包含物联网接入层或后端规则引擎。

## 当前里程碑：M2

M2 将编辑器从“单个临时水泵实例”推进为由版本化场景文档驱动的编辑器：

- `SceneDocument` 是场景持久化的唯一真相；
- 编辑模式和预览模式共用同一个 `SceneRenderer`；
- 节点位置、尺寸、旋转和状态实时写回场景文档；
- 支持添加、复制、删除和重命名水泵节点；
- 支持保存到浏览器、从浏览器恢复；
- 支持导入和导出场景 JSON；
- 导入时校验场景版本、节点类型、变换参数和水泵状态；
- 运行时归一化不同尺寸和透明边界的水泵 PNG；
- Transformer 只允许四角等比例缩放，不允许拉伸或翻转。

## 场景结构

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

当前只支持一种节点：

```text
pump.submersible
```

节点结构已经为后续组件注册表、数据绑定和行为规则保留边界，但 M2 不实现这些运行时能力。

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

## 当前范围边界

暂不实现：

- 通用组件注册表；
- 数据绑定；
- 行为规则；
- 撤销与重做；
- 多选和框选；
- 内部叶轮动画；
- 服务端保存和多人协作。

下一阶段是 M3：组件定义、组件注册表和独立的 Component Lab。
