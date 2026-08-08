import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdtemp, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'

const ROOT = 'C:/Users/Hundred/Desktop/work/RefatorMyRecord'
const OUT = join(ROOT, 'out')

// 复用真实主进程 handler：注册工作区/fs 通道
// 直接加载主进程产物不可行（会再开窗口），改为动态导入真实模块注册
const ws = await import(pathToFileURL(join(ROOT, 'electron/main/ipc/workspace-handlers.mjs')).href)
const fsmod = await import(pathToFileURL(join(ROOT, 'electron/main/ipc/fs-handlers.mjs')).href)

app.whenReady().then(async () => {
  // 先注册 handle（真实模块）
  ws.registerWorkspaceHandlers()
  fsmod.registerFsHandlers()

  // 建临时工作区
  const tmp = await mkdtemp(join(tmpdir(), 'mework-ui-'))
  const wsDir = join(tmp, 'ws')
  await mkdir(wsDir, { recursive: true })

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: join(OUT, 'preload/index.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  })
  await win.loadFile(join(OUT, 'renderer/index.html'))
  await new Promise(r => setTimeout(r, 1200))

  const results = []
  const report = (n,p,d) => { results.push(p); console.log(`${p?'PASS':'FAIL'}  ${n}  ${d||''}`) }

  // 1. 无工作区 → 显示 Onboarding 卡片
  let onb = await win.webContents.executeJavaScript(`!!document.querySelector('.onboarding__card')`)
  report('无工作区显示引导卡片', onb)

  // 2. 激活工作区 → 切到主壳（顶栏出现）
  await win.webContents.executeJavaScript(`window.mework.workspace.activate(${JSON.stringify(wsDir)})`)
  await new Promise(r => setTimeout(r, 600))
  let topbar = await win.webContents.executeJavaScript(`!!document.querySelector('.topbar')`)
  let pathShown = await win.webContents.executeJavaScript(`document.querySelector('.topbar__workspace')?.textContent`)
  report('激活后显示主壳顶栏', topbar && pathShown.includes('ws'), pathShown)

  // 3. 顶栏下拉菜单可打开（含工作区切换入口）
  await win.webContents.executeJavaScript(`document.querySelector('.topbar__menu-btn').click()`)
  await new Promise(r => setTimeout(r, 200))
  let menu = await win.webContents.executeJavaScript(`!!document.querySelector('.topbar__menu-pop')`)
  report('顶栏工作区菜单可打开', menu)

  // 4. localStorage 已记录激活路径（重启恢复基础）
  let stored = await win.webContents.executeJavaScript(`localStorage.getItem('mework.activeWorkspace')`)
  report('激活路径已持久化', stored === wsDir, stored)

  await win.destroy()
  await rm(tmp, { recursive: true, force: true })
  const failed = results.filter(p=>!p).length
  console.log(`\n=== ${failed===0?'全部通过':failed+' 项失败'} (共 ${results.length} 项) ===`)
  app.exit(failed===0?0:1)
})
