import { ipcMain } from 'electron'
import {
  activateWorkspace,
  deactivateWorkspace,
  getWorkspaceStatus
} from '../workspace/workspace-manager.mjs'

/**
 * 工作区 IPC（PRD §3.1.2 前缀规范：fs:）
 * 渲染进程发起工作区激活 / 切换 / 查询；主进程负责校验有效性并更新 fs 边界。
 * 最近工作区列表由渲染进程 localStorage 管理（PRD §2.8）。
 */

export function registerWorkspaceHandlers() {
  // 激活工作区：返回 { ok, root } 或抛错（路径无效 / 不可访问）
  ipcMain.handle('fs:activate_workspace', (_e, absPath) =>
    activateWorkspace(absPath)
  )

  // 取消激活（渲染进程切换工作区前调用）
  ipcMain.handle('fs:deactivate_workspace', () => {
    deactivateWorkspace()
    return { ok: true }
  })

  // 查询当前激活状态
  ipcMain.handle('fs:workspace_status', () => getWorkspaceStatus())
}
