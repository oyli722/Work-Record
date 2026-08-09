import { app, dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { basename, join } from 'node:path'
import { getActiveFs } from '../storage/fs-context.mjs'
import { createVersionManager } from '../versions/version-manager.mjs'

/**
 * 版本历史 IPC（阶段 5，PRD §3.1.2 前缀规范：fs:）
 * 版本库读写经 version-manager（依赖注入 fs-ops / pathGuard，PRD §7.1）。
 * 未激活工作区时 getActiveFs() 抛错，调用方收到明确失败。
 * 导出走系统「另存为」（工作区外，用户显式选择路径，不适用 pathGuard 沙箱）。
 */

export function registerVersionHandlers() {
  // 每次调用创建轻量工厂实例（无状态，读 meta / 写快照）
  const vm = () => createVersionManager(getActiveFs())

  ipcMain.handle('fs:version_record', (_e, relPath, content, editedBy) =>
    vm().recordVersion(relPath, content, editedBy)
  )
  ipcMain.handle('fs:version_list', (_e, relPath) => vm().listVersions(relPath))
  ipcMain.handle('fs:version_read', (_e, relPath, versionId) => vm().readVersion(relPath, versionId))

  // 5.6 导出（PRD §4.5.7）：读版本内容 + 系统另存为，默认落点 Documents（工作区外，评审 S4）。
  // 写盘目标为用户显式选择的导出路径（工作区外），不属于 pathGuard 沙箱范围——这是有意豁免，
  // 勿改为经 fs-ops（评审 S1）。写盘失败（磁盘满/权限/占用）返回 {ok:false, error}，不静默（评审 P1）。
  ipcMain.handle('fs:version_export', async (e, relPath, versionId) => {
    try {
      const { content } = await vm().readVersion(relPath, versionId)
      const win = e.sender.getOwnerBrowserWindow() ?? undefined
      const defaultPath = join(app.getPath('documents'), basename(relPath))
      const result = await dialog.showSaveDialog(win, {
        title: '导出版本',
        defaultPath,
        filters: [
          { name: 'Markdown', extensions: ['md'] },
          { name: '文本', extensions: ['txt'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })
      if (result.canceled || !result.filePath) return { ok: false, canceled: true }
      await writeFile(result.filePath, content, 'utf-8')
      return { ok: true, path: result.filePath }
    } catch (err) {
      return { ok: false, error: String(err?.message ?? err) }
    }
  })
}
