# MeWork · Claude Code 终端集成设计（CC Console）

> 版本：v0.1 草案（2026-08-15，分支 `v1.1-cc-console`）
> 定位：与 V1.1 既有排期（多文件格式 / MD 内嵌 HTML）**无关**的独立功能设计；落地前须升 PRD 版本并登记架构变更。
> 配套：《需求规格文档.md》（PRD V1.0）·《docs/当前实现-架构设计.md》

---

## 1. 背景与目标

在终端里操作 Claude Code 修改文件后，需要切回 MeWork 查看文件本身，来回切换不便。目标：**把 Claude Code 终端集成进 MeWork 主内容区**，实现「终端改文件 → MeWork 内直接看到并跳转」的闭环。

### 1.1 需求定案（2026-08-15 用户确认）

| # | 决策 | 内容 |
|---|---|---|
| D1 | 入口开关 | 设置页 **AI 分组**新增开关「右键打开 Claude Code 终端」，默认关闭 |
| D2 | 打开入口 | 开启后：目录树**顶层与任意分层文件夹**右键菜单新增「在此打开 Claude Code 终端」 |
| D3 | 终端形态 | 终端为本地真实终端（启动 `claude` CLI，cwd = 所右键文件夹）；以 **Tab 形式**与文件 Tab 并存 |
| D4 | 占满主内容区 | 终端 Tab 激活时**占满主内容区**，三态切换按钮（分屏/仅编辑/仅预览）**隐藏**；专注模式等其余交互保持原样 |
| D5 | Tab 区分与跳转 | 终端 Tab 与文件 Tab **视觉可区分**（终端图标 + 样式），点击即切换；交互逻辑（激活/关闭/右键批量关闭）与文件 Tab 一致 |
| D6 | 重启恢复 | 终端 Tab **恢复占位提示**：「会话已随上次退出关闭」，可一键在原目录重开 |
| D7 | 关闭行为 | 关闭终端 Tab **直接结束会话**（杀 pty 进程），无二次确认 |
| D8 | 联动标识 | **实时监听**（fs.watch）已打开文件，被外部（含 Claude Code）修改即打标识，可跳转到文件 Tab；目录树同步标识 |
| D9 | 依赖方案 | 接受 **node-pty**（原生模块，安装包略增，打包需处理编译） |

### 1.2 非目标

- 不做终端多路复用 / 分屏（一个 Tab 一个 pty 会话）
- 不做远程终端、不做 claude 之外的 CLI 管理界面（但架构不写死，见 §8）
- 不做终端内容滚存 / 会话恢复（进程无法恢复，占位即可）

---

## 2. 总体架构

```
┌─ 渲染进程（React）──────────────────────────────┐
│ TabBar（file | terminal 两类 Tab 统一渲染）        │
│ EditorPane ──┬─ activeTab.type === 'file'     → 现有编辑|预览三态区（不变）
│              └─ activeTab.type === 'terminal' → TerminalPane（xterm.js，占满）
│ editorStore：tabs[] 增加 type 字段，key 泛化        │
│ FileWatchBridge：监听变更事件 → Tab/目录树 badge   │
└────────────────────┬───────────────────────────┘
                     │ contextBridge（window.mework.term.*）
┌─ preload ──────────┴───────────────────────────┐
│ term:create / write / resize / kill / check_cli │
│ 事件：term:data / term:exit；fs:watch_changed     │
└────────────────────┬───────────────────────────┘
┌─ 主进程 ────────────┴───────────────────────────┐
│ terminal/terminal-manager.mjs（工厂 + 依赖注入）   │
│  └─ node-pty spawn('claude', { cwd: 沙箱解析 })   │
│ terminal/cli-detect.mjs：claude CLI 探测          │
│ storage/file-watcher.mjs：fs.watch 已打开文件集合  │
└────────────────────────────────────────────────┘
```

原则对齐 PRD §3.5：terminal-manager 以工厂函数 + 依赖注入组织（可单测、可替换 pty 实现）；CLI 探测独立模块（未来可扩展为「外部工具探测」通用层）。

---

## 3. 详细设计

### 3.1 Tab 模型扩展（`editorStore.js`，改动核心）

现状：`tabs[]` 以 `relPath` 为唯一标识，`activeRelPath` 驱动全部 UI。

设计：**key 泛化 + type 判别**，最小侵入：

```js
// file tab（现状字段全保留）
{ type: 'file', key: relPath, relPath, content, saveState, ... }

// terminal tab（新增）
{ type: 'terminal', key: `terminal:${termId}`, termId,
  cwdRelPath,           // 打开时右键的文件夹相对路径（占位重开用）
  title,                // 文件夹名（Tab 显示）
  exited: false }       // CLI 启动失败 / 进程退出标记
```

- `activeRelPath` → 泛化为 `activeKey`（file tab 的 key === relPath，现有调用点语义不变）
- Tab 持久化 `OPEN_TABS_KEY`：由 `string[]`（relPath）改为 `object[]`：
  `{ type:'file', relPath } | { type:'terminal', cwdRelPath, title }`——**需做旧格式迁移**（读时 string 视为 file）
- 终端 Tab 不参与：自动保存、记版、外部改动 stat 检测、`Ctrl+S`（EditorPane 按 type 分流）

### 3.2 TabBar：区分与跳转（D5）

- 终端 Tab 渲染终端图标（`icons.jsx` 新增 `TerminalIcon`）+ 文件夹名，样式与文件 Tab 区分（左侧色条或图标底色，遵循现有 token）
- 点击激活、✕ 关闭、右键批量关闭（关闭其他/左侧/右侧/全部）——菜单逻辑复用，key 统一处理
- **跳转**：点击任意 Tab 即切换内容区，天然满足「终端 ↔ 文件互跳」；不需要额外跳转按钮

### 3.3 TerminalPane（新组件）

- `xterm.js` + `@xterm/addon-fit`（自适应容器尺寸）；容器 resize → `term:resize`（cols/rows 同步 pty）
- 数据流：`term:data` 事件 → `terminal.write(chunk)`；`terminal.onData` → `term:write`（键盘输入直达 pty）
- **卸载策略**：Tab 切走时 xterm 实例保留（终端持续运行，输出写入环形缓冲，切回时重放末尾 N 行）；Tab 关闭时才 `term:kill`
- 渲染主题跟随 MeWork 明暗主题（xterm theme 从 CSS token 取色，主题切换即时生效）

### 3.4 三态按钮与专注模式（D4）

- `TopBar`：`activeTab.type === 'terminal'` 时隐藏 分屏/仅编辑/仅预览 按钮组（保留保存状态区不渲染——终端无保存语义）
- 专注模式：现有 FocusOverlay 逻辑不变，终端 Tab 同样放大占满（终端本就占满，仅侧边栏/顶栏隐藏行为一致）

### 3.5 终端生命周期（主进程 `terminal-manager.mjs`）

| 操作 | 行为 |
|---|---|
| 创建 | `pathGuard.resolveAbsolute(cwdRelPath)` 解析目录 → node-pty spawn（Windows 下 `claude` 通常为 `.cmd`，经 shell 解析）→ 返回 `termId` |
| 输出 | pty `onData` → `webContents.send('term:data', termId, chunk)` |
| 退出 | pty `onExit` → 通知渲染层，Tab 标记 `exited`，显示「会话已结束 + 重开按钮」 |
| 关闭 | Tab ✕ → `term:kill` → 杀进程树（Windows 需杀子进程树，claude 可能派生 node 子进程） |
| 应用退出 | `before-quit` 统一 kill 全部 pty |
| 工作区切换 | 复用 `close()`：关闭全部终端 Tab（进程一并结束） |
| 文件夹删除 | cwd 受影响的终端 Tab 一并关闭（进程 cwd 无法迁移） |
| 文件夹重命名 | 受影响终端 Tab 关闭（同上；保持简单，不做 cwd 跟随） |

**CLI 探测**（`cli-detect.mjs`）：启动终端前探测 `claude`（`where` / `which`），未安装 → 右键菜单项置灰 + tooltip「未检测到 Claude Code CLI」；探测结果缓存，设置页开关处也展示检测状态。

### 3.6 重启占位恢复（D6）

- 持久化 terminal Tab 元数据（`cwdRelPath` + `title`，不持久化进程语义）
- 重启恢复时渲染占位态：「终端会话已随上次退出关闭」+「在此目录重新打开」按钮 → 走全新创建流程

### 3.7 文件联动标识（D8，实时监听）

**范围**：仅监听**已打开的文件 Tab** 对应的 relPath 集合（风险与开销可控）。

```
渲染：tabs 变化 → fs:watch_sync(relPaths[])    （file tab 的 key 集合）
主进程：file-watcher 维护 watch 集合（增删）→ fs.watch 触发
      → webContents.send('fs:watch_changed', relPath)
渲染：Tab 该文件打 badge（●/角标）+ 目录树同名节点打 badge
      点击 badge → activateTab(relPath) 跳到文件 Tab
```

**与现有外部改动检测的关系**：现有「保存前 stat 快照比对」机制**保留不变**（防保存覆盖）；watch 标识是**通知层**，二者互补。注意去抖（编辑器自身保存也会触发 watch 事件——过滤：事件来源为自身写盘时忽略，可在 `doSave` 后短窗内忽略该 relPath 的 watch 事件）。

**跳转后的内容处理**（推荐，待用户确认）：点击 badge 跳到文件 Tab 时——文件未脏（content === savedContent）→ 自动从磁盘重载；已脏 → 显示现有 externalChange 提示，由用户选择覆盖或放弃。

### 3.8 设置页 AI 分组（D1）

- AI 分组从「纯灰不可用」变为**首个真实功能落点**：开关「右键打开 Claude Code 终端」（默认关）+ CLI 检测状态展示
- 其余 AI 能力仍标注「未来版本」（分组文案调整：「AI 工具集成」）
- ⚠ PRD §4.8.6（AI 组灰色不可用）语义变更，落地时登记

---

## 4. IPC 设计（新前缀 `term:`）

| 通道 | 方向 | 说明 |
|---|---|---|
| `term:check_cli` | invoke | 探测 claude CLI：`{ installed, path, version? }` |
| `term:create` | invoke | `(cwdRelPath)` → `{ termId }`；沙箱解析 cwd，CLI 缺失返回 `{ ok:false, reason:'cli-missing' }` |
| `term:write` | invoke | `(termId, data)` 键盘输入 |
| `term:resize` | invoke | `(termId, cols, rows)` |
| `term:kill` | invoke | `(termId)` 杀进程树 |
| `term:data` | event → | `(termId, chunk)` pty 输出 |
| `term:exit` | event → | `(termId, code)` 进程退出 |
| `fs:watch_sync` | invoke | `(relPaths[])` 同步监听集合（归 `fs:` 前缀） |
| `fs:watch_changed` | event → | `(relPath)` 文件被外部修改 |

安全：`term:create` 的 cwd 必经 pathGuard 沙箱解析（与 `win:reveal` 同模式）；其余 term 通道以 termId 寻址，termId 由主进程生成（不自渲染进程路径）。

> **架构决策**：新增 `term:` 前缀超出 PRD §3.1.2 / §7.4 既定预留（`agent:` / `llm:`）——按 CLAUDE.md 约定，落地时升 PRD 版本登记。

---

## 5. 安全考量

| 项 | 说明 |
|---|---|
| 能力边界 | 终端 = **任意命令执行**，是显式开放的能力（本产品单人本地自用，PRD §1.3.1）；与 pathGuard 不冲突——pathGuard 约束的是 **MeWork 自身的文件 API**，终端进程天然全能力，开关默认关闭即为此边界控制 |
| 攻击面 | 渲染进程仅能向**已存在的 pty** 写输入 / 收输出（contextBridge 白名单方法）；node-pty 全部在主进程，`sandbox:true` 渲染层无 Node 能力，基线不变 |
| cwd 约束 | 终端启动目录限定工作区内（pathGuard 解析）；启动后 cd 出去是终端本性，不做限制 |
| 输出注入 | 终端输出经 xterm 转义序列渲染（非 innerHTML），无 XSS 面；不把终端输出引入 DOMPurify/预览链路 |

---

## 6. 依赖与打包

| 依赖 | 用途 | 备注 |
|---|---|---|
| `node-pty` | 主进程 pty | 原生模块：需 `electron-rebuild`；electron-builder `asarUnpack` 处理；Windows 依赖 VS Build Tools（开发机需具备） |
| `@xterm/xterm` + `@xterm/addon-fit` | 渲染终端 | 纯前端包，无原生依赖 |

> node-pty 是 VS Code 同款方案；打包体积预估 +2–4 MB，符合 D9 决策。**首个子阶段先做「依赖引入 + 打包链路验证」**，风险前置。

---

## 7. 风险与缓解

| 风险 | 缓解 |
|---|---|
| node-pty 在 Windows 打包后加载失败（ABI 不匹配） | 子阶段 1 前置验证 dev + 打包产物双链路；失败则降级评估 `conpty` 直连方案 |
| claude CLI 形态多样（npm 全局 / 独立安装器 / cmd / exe） | cli-detect 多路径探测（PATH、`where`、常见安装位置）；探测失败仅置灰入口，不阻塞其他功能 |
| `claude` 为 `.cmd` 需 shell 解析 | spawn 经 `shell: true` 或显式解析 `.cmd`；探测阶段拿到真实路径 |
| watch 事件被自身保存触发 | doSave 后短窗忽略（§3.7）； watch 监听范围限已打开文件 |
| 终端 Tab 切走后输出丢失 | xterm 实例常驻 + 环形缓冲重放（§3.3） |
| 旧持久化格式（relPath[]）| 读取兼容：string 元素视为 file tab（§3.1） |

---

## 8. 未来扩展（不实现，仅预留）

- 终端入口通用化：cli-detect 演进为「外部工具注册表」（git bash / powershell / 任意 CLI），右键菜单变为子菜单选择
- 与 PRD §7 AI 架构合流：`agent:` / `llm:` 通道就绪后，终端可演进为 Agent 的 HITL 观察面
- 终端 Tab 与文件 Tab 的更多联动（如 claude 正在编辑的文件自动滚动跟随）

---

## 9. 落地子阶段建议（登记《进度看板》时细化）

1. **CC-1 依赖与打包验证**：node-pty + xterm 引入，dev / 打包双链路跑通「echo 终端」
2. **CC-2 主进程终端层**：terminal-manager + cli-detect + `term:` IPC + preload 暴露 + 单测（mock pty）
3. **CC-3 Tab 模型扩展**：type/key 泛化 + 持久化迁移 + TabBar 区分渲染 + 三态按钮隐藏 + 专注模式适配
4. **CC-4 TerminalPane**：xterm 集成、resize、切换缓冲、退出/占位态、重启占位重开
5. **CC-5 入口落地**：设置 AI 组开关 + 目录树右键菜单（含 CLI 未装置灰）
6. **CC-6 联动标识**：file-watcher + watch_sync/changed + Tab/目录树 badge + 跳转与重载策略
7. **CC-7 边界与自测**：工作区切换 / 删除 / 重命名关闭终端、应用退出清理、回归现有 md/txt 行为

## 10. 待确认事项

- [ ] badge 跳转后的重载策略（§3.7 推荐：未脏自动重载、已脏走 externalChange 提示）是否认可
- [ ] 终端视觉：字号/字体是否入设置页「编辑器组」（当前设计：xterm 跟随主题 token，字号暂用编辑器字号）
- [ ] 终端并发数是否设上限（当前设计：不设限）
- [ ] 重命名文件夹时受影响终端「直接关闭」是否可接受（替代：保留进程 + Tab 提示目录已变更）
