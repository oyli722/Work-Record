import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { isExternalLink } from '../../src/shared/link-policy'
import { registerFsHandlers } from './ipc/fs-handlers.mjs'
import { registerWorkspaceHandlers } from './ipc/workspace-handlers.mjs'
import { registerVersionHandlers } from './ipc/version-handlers.mjs'
import {
  registerMeworkFileScheme,
  registerMeworkFileHandler
} from './protocol/mework-file.mjs'

// MeWork 主进程入口
// 安全基线（PRD §3.2.1）：contextIsolation:true、nodeIntegration:false、sandbox:true
// 所有 fs 操作统一经 electron/main/storage/fs-ops.mjs（内部经 pathGuard 沙箱，PRD §7.1）。
// 自定义协议特权须在 app ready 前声明（3.5：mework-file:// 预览图片）
registerMeworkFileScheme()

const isDev = !app.isPackaged

/** 创建主窗口（安全基线 + 渲染进程加载） */
function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 720,
    minHeight: 480,
    show: false,
    title: 'MeWork',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, // 隔离渲染进程与 Node 环境
      nodeIntegration: false, // 渲染进程不启用 Node
      sandbox: true, // 启用沙箱（preload 下仅 contextBridge 可用）
      webSecurity: true
    }
  })

  // 待窗口 ready-to-show 再显示，避免白屏闪烁
  win.once('ready-to-show', () => win.show())

  // 外链用系统浏览器打开（PRD §4.4.3），不在应用内新开窗口；
  // 仅放行 http/https，杜绝 file:// 等协议被带出用系统程序打开（S2 评审加固）
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  // 纵深防御（3.6）：阻止渲染进程任何应用内导航。预览文本链接点击已由渲染层拦截并
  // 经 win:open_external 交给系统（4.4.3），此处兜底；仅放行 dev server 的初始加载。
  // 评审 S1：origin 精确比较（前缀匹配可被 localhost:5173.evil.com 之类绕过），畸形 URL 一律拦。
  win.webContents.on('will-navigate', (event, url) => {
    const devUrl = process.env.ELECTRON_RENDERER_URL
    if (devUrl) {
      try {
        if (new URL(url).origin === new URL(devUrl).origin) return
      } catch {
        /* url 解析失败视为非预期导航，走 preventDefault */
      }
    }
    event.preventDefault()
  })

  // dev 模式透传渲染进程 console 到终端，便于调试（生产构建下不启用）
  // 注：Electron 41 起 console-message 使用结构化事件对象，level 为字符串（S1 评审修订）
  if (isDev) {
    win.webContents.on('console-message', (event) => {
      const { level, message } = event
      const tag = `[renderer:${level}]`
      if (level === 'error') console.error(tag, message)
      else if (level === 'warning') console.warn(tag, message)
      else console.log(tag, message)
    })
  }

  // 开发模式加载 dev server；生产加载打包产物
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  registerIpcHandlers()
  registerMeworkFileHandler() // mework-file:// 协议（3.5 预览图片）
  createWindow()

  // macOS 惯例：点击 Dock 图标无窗口时重建（本产品为 Windows 优先，保留惯例）
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 全平台：关闭所有窗口即退出（Windows / Linux 行为）
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

/** 注册 IPC handler（PRD §3.1.2：通道前缀规范 fs: / win: / editor:） */
function registerIpcHandlers() {
  // 阶段 1 连通性自检：渲染进程 ping 主进程，验证 contextBridge 链路（PRD §阶段1 交付物）
  ipcMain.handle('fs:ping', () => ({
    ok: true,
    pong: 'pong',
    ts: Date.now()
  }))

  // 阶段 2 受控 fs API（PRD §7.1：统一经 fs-ops + pathGuard）
  registerFsHandlers()
  // 阶段 2 工作区激活 / 切换 / 查询（PRD §4.1）
  registerWorkspaceHandlers()
  // 阶段 5 版本历史（PRD §4.5：快照 / 列表 / 读取）
  registerVersionHandlers()

  // 阶段 3.6 外链（PRD §4.4.3）：渲染进程请求用系统浏览器/默认程序打开链接。
  // 协议白名单经 src/shared/link-policy.js（用户定案 http/https/mailto/tel，评审 S3 单一来源）；
  // 渲染层 DOMPurify 已限 URI 协议，此处是主进程纵深防御（评审 P1 加固思路）。
  // 图片不受影响，仍在应用内显示（3.5）。评审 S2：await 真实结果，打开失败返回 {ok:false}。
  ipcMain.handle('win:open_external', async (_e, url) => {
    if (!isExternalLink(url)) {
      return { ok: false, reason: 'unsupported-protocol' }
    }
    try {
      await shell.openExternal(url)
      return { ok: true }
    } catch (err) {
      console.error('[main] openExternal 失败:', err)
      return { ok: false, reason: 'open-failed' }
    }
  })
}
