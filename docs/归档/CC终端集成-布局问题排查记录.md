# CC 终端集成 · 布局问题排查记录（点击终端「占满」软件）

> 记录 2026-08-15 CC-1 阶段排查的「点击终端后终端占满整个软件窗口」问题。根因与修复是 CC-4 TerminalPane 落地时必须遵守的布局约束，防止回归。

---

## 1. 现象

- 进入终端后，**点击终端任意位置** → 终端占满整个软件窗口（顶栏、侧栏被盖住）
- 再次点击 → 回退到主内容区；反复点击可来回切换
- 窗口本身未全屏/最大化（`File / Edit` 等 Electron 原生菜单栏仍在）
- 终端内容区未填满主内容区（色块不一致），但背景铺满全窗（无间距）

## 2. 排查过程（简略）

先后怀疑了以下方向，均被排除：

| 怀疑方向 | 排除依据 |
|---|---|
| 专注模式（focus）被误触发 | 专注模式 keydown 日志显示 `focus` 恒为 `false`；`setFocus` 仅在 F11 / 专注按钮触发 |
| 窗口全屏 / 最大化 | 主进程监听 `enter-full-screen` / `maximize` / `resize` 均未触发 |
| 环境残留（旧窗口 / 旧代码） | 彻底杀光 electron + vite 进程后单实例验证，问题仍复现 |
| Electron 菜单栏（File/Edit） | 为系统原生菜单，与 React 无关，始终存在 |

**最终定位**：用 `getBoundingClientRect()` 打印各区域实际尺寸，一次拿到铁证：

```
.terminal:         x=240  w=1338   ← 父容器位置正确（主内容区）
.terminal .xterm:  x=0    w=1578   ← xterm 元素跑到窗口最左边，宽度=整个窗口！
.terminal .xterm-screen: x=0 w=1322 y=0 h=654   ← 终端内容区尺寸固定，不跟随容器
```

## 3. 根因

**xterm.js 的 `.xterm` 元素没有被约束在 `.terminal` 容器内**：

- `.terminal`（我们定义的容器）位置正确（x=240，主内容区 1338 宽）
- 但内部 `.xterm` 的定位上下文跑到了**整个窗口层**（x=0、宽 1578 = 全窗宽），把侧边栏盖住
- 表现为「占满软件 / 顶栏侧栏消失 / 宽度超出滑动框」
- 附带问题：`.xterm-screen`（实际渲染终端内容的区域）尺寸由 `fit()` 在初始化时固定，**窗口缩放后不跟随**，导致终端内容不满主内容区（色块不一致）

## 4. 修复

```css
.terminal {
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;   /* 裁剪内部 xterm 溢出 */
  position: relative; /* 建立包含块，约束 .xterm 定位 */
}
.terminal .xterm {
  position: absolute; /* 强制填满 .terminal，杜绝溢出到侧边栏/窗口 */
  inset: 0;
  width: 100%;
  height: 100%;
}
```

配套：`TerminalPane` 挂载时用 `ResizeObserver` 监听 `.terminal` 尺寸变化并重新 `fit()`，使 `.xterm-screen` 跟随容器（窗口缩放自适应）。

## 5. 教训 / CC-4 落地要点

1. **xterm.js 挂载必须显式约束**：`.xterm` 元素不能依赖默认 block 布局，必须 `position: absolute; inset: 0` 约束在容器内（或等价手段）。这是本问题唯一可靠的修复。
2. **`fit()` 后必须监听容器尺寸**：窗口 / 侧边栏宽度变化时重新 `fit()`，否则 `.xterm-screen` 停留初始尺寸。
3. **不要加 `.xterm` 的 padding**：会在深色终端背景四周露出主区浅色背景，造成「色块不一致」。
4. 排查长链（专注模式 → 环境 → 布局）值得记：**先用 `getBoundingClientRect()` 拿到几何数据**，比反复猜测状态快得多。
