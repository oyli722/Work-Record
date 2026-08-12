import { dialog, ipcMain } from 'electron'
import { getActiveFs } from '../storage/fs-context.mjs'
import { writeLog } from '../storage/logger.mjs'

/**
 * IPC fs 受控 API（PRD §3.1.2 前缀规范：fs:）
 *
 * 所有 handler 只做「取当前 fs-ops → 转发调用 → 返回结果」三层薄转发，
 * 不直接触碰 fs（PRD §7.1：统一经 fs-ops）。通道名与 fs-ops 方法一一对应，
 * 未来新增 fs 能力在此平行扩展。
 *
 * 未激活工作区时，getActiveFs() 抛错，IPC 调用方收到明确失败信息。
 */

/** 注册全部 fs: 通道（应用启动时调用一次） */
export function registerFsHandlers() {
  ipcMain.handle('fs:read_file', (_e, relPath) => getActiveFs().readFile(relPath))
  ipcMain.handle('fs:write_file', (_e, relPath, content) =>
    getActiveFs().writeFile(relPath, content)
  )
  ipcMain.handle('fs:write_file_binary', (_e, relPath, data) =>
    getActiveFs().writeFileBinary(relPath, data)
  ) // 9.3.3 图片粘贴：Uint8Array 原样写入（structured clone 透传）
  ipcMain.handle('fs:list_directory', (_e, relPath) => getActiveFs().listDirectory(relPath))
  ipcMain.handle('fs:list_detail', (_e, relPath) => getActiveFs().listDetail(relPath)) // 4.1：目录树聚合
  ipcMain.handle('fs:mkdir', (_e, relPath) => getActiveFs().mkdir(relPath))
  ipcMain.handle('fs:rename', (_e, relFrom, relTo) => getActiveFs().rename(relFrom, relTo))
  ipcMain.handle('fs:rename_with_versions', (_e, relFrom, relTo) =>
    getActiveFs().renameWithVersions(relFrom, relTo)
  ) // 4.3：重命名 + 版本库迁移
  ipcMain.handle('fs:delete', (_e, relPath) => getActiveFs().delete(relPath))
  ipcMain.handle('fs:delete_with_versions', (_e, relPath) =>
    getActiveFs().deleteWithVersions(relPath)
  ) // 4.4：删除 + 版本库清空
  ipcMain.handle('fs:stat', (_e, relPath) => getActiveFs().stat(relPath))

  // 8.2 渲染层错误上报：仅记录错误级别（用户定案：主进程关键操作不需要日志）
  ipcMain.handle('fs:log', (_e, level, message) => {
    if (level === 'error') writeLog('error', String(message ?? ''))
    return { ok: true }
  })

  // 目录选择：供工作区引导 / 更换使用。返回绝对路径（不作为读写路径，仅授权意图）。
  ipcMain.handle('fs:choose_directory', async (e) => {
    const win = e.sender.getOwnerBrowserWindow() ?? undefined
    const result = await dialog.showOpenDialog(win, {
      title: '选择工作区文件夹',
      properties: ['openDirectory', 'createDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
