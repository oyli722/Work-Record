import { ipcMain } from 'electron'
import { getActiveFs } from '../storage/fs-context.mjs'
import { createVersionManager } from '../versions/version-manager.mjs'

/**
 * 版本历史 IPC（阶段 5，PRD §3.1.2 前缀规范：fs:）
 * 版本库读写经 version-manager（依赖注入 fs-ops / pathGuard，PRD §7.1）。
 * 未激活工作区时 getActiveFs() 抛错，调用方收到明确失败。
 */

export function registerVersionHandlers() {
  // 每次调用创建轻量工厂实例（无状态，读 meta / 写快照）
  const vm = () => createVersionManager(getActiveFs())

  ipcMain.handle('fs:version_record', (_e, relPath, content, editedBy) =>
    vm().recordVersion(relPath, content, editedBy)
  )
  ipcMain.handle('fs:version_list', (_e, relPath) => vm().listVersions(relPath))
  ipcMain.handle('fs:version_read', (_e, relPath, versionId) => vm().readVersion(relPath, versionId))
}
