# SCADA Editor Lab

一个基于 React、TypeScript 和 Vite 的 SCADA 编辑器功能实验项目。

当前实验只验证一件事：在编辑器画布中加载带标签的 SVG，并通过界面按钮动态修改指定标签的颜色。

## 当前功能

- 在编辑器画布中展示水泵 SVG
- 使用选框表示当前选中的 SVG 组件
- 提供灰、绿、蓝、橙、红五组颜色按钮
- 点击按钮同时修改：
  - `pump-color1`：浅颜色区域
  - `pump-color2`：深颜色区域
- 不包含设备通信、运行状态、告警或实时数据模拟

## 实现方式

React 状态保存当前颜色方案，并通过 CSS 变量覆盖 SVG 中对应 ID 的 `fill`：

```css
.pump-svg #pump-color1 {
  fill: var(--pump-color1) !important;
}

.pump-svg #pump-color2 {
  fill: var(--pump-color2) !important;
}
```

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
