# SCADA Editor Lab

一个用于验证 SCADA 前端编辑和运行交互的实验项目。项目只关注浏览器中的场景编辑、组件表现和模拟状态，不包含物联网接入层或后端规则引擎。

## 当前里程碑：M1

M1 使用 React、TypeScript、Konva 和 react-konva 验证一个多图片状态组件：

- 五个水泵状态图归属于同一个 Konva Group；
- 灰、绿、蓝、橙、红分别表示停止、运行、手动、警告和报警；
- 状态切换不改变组件的位置、尺寸和旋转角度；
- 编辑模式支持整体选择、拖动、等比缩放和旋转；
- 预览模式关闭编辑行为；
- 图片通过共享缓存加载，不为每次渲染重复创建资源；
- Transformer 结束后会把临时 scale 归一化为组件 width/height。

## 水泵状态资源

运行时优先加载以下 PNG：

```text
public/components/pump/
├── pump-gray.png
├── pump-green.png
├── pump-blue.png
├── pump-orange.png
└── pump-red.png
```

用户提供的原始色彩图在图片尺寸和透明边界上存在少量差异，因此需要先归一化到统一设计画布。若上述 PNG 尚未放入仓库，当前实现会自动回退到同源 SVG 生成的状态图片，保证编辑器仍可运行且状态切换不抖动。

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

## M1 范围边界

本里程碑暂不实现：

- 完整 SceneDocument；
- 组件注册表；
- 多组件场景；
- 数据绑定；
- 行为规则；
- 撤销与重做；
- 内部叶轮动画。

内部动画需要独立的叶轮、流体或指示层素材，将在后续组件生产实验中继续验证。
