# 浏览器验证说明

当前执行环境的 Chromium 管理策略会阻止直接导航到本地 HTTP 或 `file://` 地址。因此验证没有使用会被策略拦截的 `page.goto()`。

本轮采用等价的真实 Chromium 执行方式：

1. 将 `dist/S7_FAST_ENTRY.html` 写入 Chromium 当前内存文档；
2. 为 `http://s7.local/assets/**` 建立 Playwright 路由；
3. 路由直接返回发布目录中的真实图片和音频字节；
4. 执行游戏自带的逻辑、种植、动画和渲染自检；
5. 真实加载气球、雪橇、矿工优化图并读取 `naturalWidth/naturalHeight`。

该方式运行的是 Chromium 的 DOM、Canvas、Image 解码、事件和 JavaScript 引擎，不是 Node 静态模拟。验证结果见 `dist/browser-runtime-verification.json`。

直接 URL 导航这一项仍受容器策略限制；在实际机器上仍建议按 `docs/RELEASE_CHECKLIST.md` 做一次普通模式、V 模式和多宫格人工操作回归。
