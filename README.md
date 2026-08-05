# SCADA

基于 React、TypeScript 和 Vite 构建的 SCADA 前端项目。

## 技术栈

- React 19
- TypeScript 6
- Vite 8
- Oxlint

## 本地开发

要求 Node.js 20.19+ 或 22.12+。

```bash
npm install
npm run dev
```

默认开发地址由 Vite 输出，通常为 `http://localhost:5173`。

## 常用命令

```bash
npm run dev      # 启动开发服务器
npm run build    # 类型检查并构建生产版本
npm run lint     # 执行静态检查
npm run preview  # 预览生产构建
```

## 目录结构

```text
src/
├── App.tsx       # 应用入口页面
├── main.tsx      # React 挂载入口
├── styles.css    # 全局样式
└── vite-env.d.ts # Vite 类型声明
```

当前首页提供一个无后端依赖的 SCADA 工作台骨架，后续可逐步拆分设备树、组态画布、告警中心和实时数据模块。
