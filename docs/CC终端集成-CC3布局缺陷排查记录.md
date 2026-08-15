# CC 终端集成 · CC-3 布局缺陷排查记录（已解决）

> 记录 2026-08-15 CC-3 落地后实测发现的两个布局缺陷的**完整排查与修复**。
> 状态：✅ 已解决（2026-08-15，修复经用户实测验证）
> 配套：《进度看板.md》待办区已更新；CC-1 布局问题已闭环（见《CC终端集成-布局问题排查记录.md》）。

---

## 缺陷一：非专注模式终端未占满主内容区（内容只占 60-70% 宽度）

### 现象
- 终端容器本身占满主内容区（宽度 100%），但 **pty 内的 claude 内容只占容器 60-70% 宽度**，右侧留白。
- 专注模式（F11）下正常。

### 根因（经几何数据 + 源码确认，2026-08-15）
1. 主进程 `term:create` spawn pty 时使用默认 **cols=80, rows=24**。
2. 渲染层 `TerminalPane` 挂载时：xterm 初始 80 列 → `fit.fit()` 重算为实际列数（如 130）→ **触发 `onResize` 事件**。
3. **但 `term.onResize` 订阅注册在 `fit.fit()` 之后**（原代码顺序）→ 初次 fit 的 resize 事件**丢失** → pty 永远停留在 80×24。
4. claude 按 pty 的 80 列渲染 TUI → 内容只占容器 60-70% 宽度（80/130 ≈ 62%）。
5. 专注模式「正常」的假象：F11 切换使容器尺寸变化 → ResizeObserver → 重新 fit → 此刻 onResize 已注册 → pty resize → claude 重排变满。

### 修复（`TerminalPane.jsx`）
1. **`onResize` 订阅提前到首次 `fit()` 之前** —— 初次 fit 的 resize 事件不再丢失。
2. **`doFit()` 每次 fit 后兜底主动 `term:resize(termId, cols, rows)`** —— onResize 未触发（cols 未变）时也保证 pty 尺寸一致。
3. **`document.fonts.ready` 后重新 fit + 同步** —— 防「字体未加载时打开终端 → 字符测量异常（cell.width=0）→ fit 静默失败 → 卡 80 列」的时序竞争。
4. **`EditorPane` 补传 `active` prop** —— 切回终端 Tab 时 refit + 同步真正生效（原未传，active 恒为 true）。

### 验证数据（修复后）
- 挂载即 `cols:130`，`screen` 929/946 ≈ 98%（余量为 fit 预留 scrollbar 宽度）。
- 非专注/专注均满宽，用户实测确认。

---

## 缺陷二：组合输入长文字时终端整体左移 + 右侧留白 + IME 卡顿

### 现象
- 光标靠右（行尾附近）时，用输入法输入**长组合文字**（未上屏拼音/候选）→ 终端内容**整体向左平移**，右侧露出留白。
- 留白宽度**随未上屏文字长度变化**（输入法候选越长，留白越宽）；约 10-20 字符后偏移固定，且**继续输入时输入法无响应**。
- 纯英文输入（无组合输入）不偏移；专注/非专注均复现。

### 根因（经几何数据确认，2026-08-15）
1. xterm 组合输入时（`CompositionHelper.updateCompositionElements` 每帧执行），把**聚焦的透明 textarea** 定位到光标处，**宽度 = 组合文字渲染宽度**（`textarea.style.width = compositionViewBounds.width`）。
2. 光标靠右 + 组合文字长 → **textarea 右缘超出视口右缘**（诊断实测：textarea 右缘 1200px > 视口右缘 1186px）。
3. 浏览器对**聚焦元素**的「保持可见」滚动处理介入（viewport 因 `overflow-y: scroll` 使 `overflow-x` 计算为 auto，可横向滚动）→ **终端内容平移（左移）+ 右侧露出背景（留白）**；偏移量随 textarea 超出量（= 组合文字长度）变化。长组合文字还会搅乱 Windows TSF 组合状态 → 「输入法无响应」。
4. 纯英文输入走 keydown 直通（非组合），textarea 不参与，故无偏移。

### 修复（`TerminalPane.jsx` + `index.css`）
1. **组合期间每帧钳制 textarea 宽度 ≤ 视口右缘 − 左缘**（rAF 循环，compositionstart 启动 / compositionend 停止）：
   - 主手段：**钳制 `.composition-view` 宽度** —— xterm 每帧以它的 `getBoundingClientRect` 宽度设置 textarea 宽度，钳制它后 textarea 宽度天然一致（无对抗抖动）；组合文字超出部分仍溢出显示（nowrap + overflow visible），视觉完整。
   - 兜底：直接钳制 textarea 宽度。
   - 效果：textarea 永不超出视口 → 浏览器滚动处理不触发 → 无平移、无留白、IME 组合正常。
2. **CSS 兜底**：`.terminal .xterm-viewport { overflow-x: hidden }` —— 禁止视口横向滚动（xterm 无横向滚动需求）。

### 验证数据（修复后，组合输入 textLen 3→37）
- `viewport.x` 恒等于容器 x（**零平移**）；`viewportScroll.left` 恒 0。
- `textarea.w` 恒 20px（= maxW：视口右缘 1186 − 左缘 1165 − 1），**宽度不再随组合文字增长**。
- 用户实测：无左移、无留白、输入法持续正常响应。

---

## 诊断方法论（本次采用的，供后续缺陷排查参考）

- **先取真实几何数据再改代码**（用户定案）：`getBoundingClientRect()` 打印容器/xterm/screen/textarea/composition-view 的尺寸与位置 + xterm cols/rows + fit 提议尺寸 + viewport scrollLeft，按挂载/切回/resize/组合事件时序打点。
- 诊断数据经 `window.mework.log('error', ...)` 借道落盘 `<工作区>/.wr/logs/app.log`，无需用户复制控制台。
- 关键对比：修复前（textarea 宽度随 textLen 涨到 264px、viewport.x 240→200）vs 修复后（textarea 宽恒 20px、viewport.x 恒定）。
- 相关文件：`src/renderer/src/components/TerminalPane.jsx`、`EditorPane.jsx`、`src/renderer/src/styles/index.css`（`.terminal .xterm-viewport`）。
