import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import { registerFsHandlers } from './ipc/fs-handlers.mjs'
import { registerWorkspaceHandlers } from './ipc/workspace-handlers.mjs'
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
}
