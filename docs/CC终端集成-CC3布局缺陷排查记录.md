# CC 终端集成 · CC-3 布局缺陷排查记录（未解决）

> 记录 2026-08-15 CC-3 落地后实测发现的两个未解决布局缺陷。当前**只记录、不再改动代码**，待取得真实几何数据后再定位修复。
> 状态：⛔ 未解决 · 待诊断
> 配套：《进度看板.md》待办区已登记；CC-1 布局问题已闭环（见《CC终端集成-布局问题排查记录.md》）。

---

## 缺陷一：非专注模式终端未占满主内容区

### 现象
- 正常布局（顶栏 + 侧边栏 + 主区）下打开终端 Tab，终端面板**未填满主内容区**（存在留白区域）。
- 切换专注模式（F11）后终端**正常占满**。

### 复现
`npm run dev` → 打开终端 Tab → 观察终端内容区与主内容区边界的留白。

### 关键特征
- 专注/非专注行为不一致。专注时 `.app--focus` 布局归一行一列；非专注时存在顶栏高度（`.app` grid `--topbar-height 1fr`）与侧边栏列（`.app__body` grid `--sidebar-width 1fr`）。
- 差异点集中在**主区高度链**（`.app__body` → `.app__main` → `.editor` → `.editor__content` → cell → `.terminal`）。

### 已尝试修复（均未生效，供追溯）
| 提交 | 内容 | 假设 |
|---|---|---|
| `62b5eab` | 终端面板常驻挂载（display:none 隐藏非激活） | 切回缓冲保留 |
| `1db179b` | 切回多重 setTimeout refit（0/60/250ms） | 切回 fit 时序 |
| `5454694` | `.app__body` 显式 `grid-template-rows:1fr`、`.app__main` 加 `min-height:0` | 非专注高度链依赖隐式行 auto 塌缩 |
| `5454694` | 内容区改 grid 层叠（`.editor__content`，visibility 恒常尺寸） | 容器尺寸不确定导致 fit 错 |

> 注：以上修复基于**代码结构推断**，未用 `getBoundingClientRect()` 实测验证，未命中真正根因。

---

## 缺陷二：终端输出/输入长内容时整体左移 + 右侧空白

### 现象
- 终端内输出或输入**超长内容**（超出一行可容纳宽度）时，终端内容整体向左偏移，右侧流出空白区域。
- 触发**不稳定**（"有时候"）。

### 复现
打开终端 → 输入一段很长的内容（或让 claude 输出长行）。

### 关键特征
- 触发与「容器/内容宽度」强相关且不稳定 → 指向 xterm 的**列数（cols）计算与实际容器宽度不匹配**，但具体在**哪一层、何时算错**尚未确认。

### 已尝试修复（均未生效）
| 提交 | 内容 | 假设 |
|---|---|---|
| `1db179b` | 切回多重 setTimeout refit + fit 前校验容器尺寸 | 切回时 fit 在过渡态算错 cols |
| `5454694` | grid 层叠恒常尺寸（visibility 隐藏） | 容器尺寸恒常则 fit 稳定 |

---

## 诊断缺口（继续排查前需要）

1. **真实几何数据**：`getBoundingClientRect()` 打印 `.editor__content` / `.terminal` / `.xterm` / `.xterm-screen` 的尺寸，与 xterm 的 `cols/rows` —— 定位是「容器塌缩」还是「xterm 内部尺寸」。
2. 复现时的 **dev 控制台日志**（需在组件临时加诊断日志）。
3. 环境是否已清理残留 dev 进程（5173/5174 端口占用会影响验证）。

## 约束
- 用户定案：**修复前先取得几何数据，不再凭推断反复改动**（2026-08-15）。
- 相关文件：`src/renderer/src/components/EditorPane.jsx`、`TerminalPane.jsx`、`src/renderer/src/styles/index.css`（`.app__body` / `.app__main` / `.editor__content` / `.terminal`）。
