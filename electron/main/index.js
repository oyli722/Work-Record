import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'

// MeWork 主进程入口
// 安全基线（PRD §3.2.1）：contextIsolation:true、nodeIntegration:false、sandbox:true
// 所有 fs 操作将统一经 electron/main/storage/fs-ops.js（阶段 2），本阶段仅空壳骨架。

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

  // 外链用系统浏览器打开（PRD §4.4.3），不在应用内新开窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 开发模式加载 dev server；生产加载打包产物
  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
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
