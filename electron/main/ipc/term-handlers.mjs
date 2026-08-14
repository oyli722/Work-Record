import { ipcMain } from 'electron'
import { getActiveFs } from '../storage/fs-context.mjs'
import { createTerminalManager } from '../terminal/terminal-manager.mjs'

// MeWork 终端 IPC（CC Console，设计文档 §4，新前缀 term:）
// 通道：term:create / write / resize / kill（invoke）；term:data / term:exit（event 推渲染）。
// 安全（设计文档 §4）：term:create 的 cwd 必经 pathGuard 沙箱解析（resolveAbsolute，同 win:reveal）；
// 其余通道以 termId 寻址，termId 由主进程生成，渲染进程不可伪造路径。

const manager = createTerminalManager()

export function registerTermHandlers() {
  // 创建终端：cwdRelPath 为工作区相对路径（'.' 即根），沙箱解析后 spawn 默认 shell
  ipcMain.handle('term:create', async (e, cwdRelPath) => {
    try {
      const cwd = await getActiveFs().resolveAbsolute(cwdRelPath || '.')
      const termId = manager.create({
        cwd,
        onData: (id, chunk) => e.sender.send('term:data', id, chunk),
        onExit: (id, code) => e.sender.send('term:exit', id, code)
      })
      return { ok: true, termId }
    } catch (err) {
      return { ok: false, reason: String(err?.message ?? err) }
    }
  })

  // 键盘输入写入 pty（CC-1 不校验 termId 归属，单人单窗口；CC-2 起按需加固）
  ipcMain.handle('term:write', (_e, termId, data) => {
    manager.write(termId, data)
    return { ok: true }
  })

  // 终端尺寸同步（渲染层 xterm fit 后回传 cols/rows）
  ipcMain.handle('term:resize', (_e, termId, cols, rows) => {
    manager.resize(termId, cols, rows)
    return { ok: true }
  })

  // 关闭终端：杀 pty 进程
  ipcMain.handle('term:kill', (_e, termId) => {
    manager.kill(termId)
    return { ok: true }
  })
}
