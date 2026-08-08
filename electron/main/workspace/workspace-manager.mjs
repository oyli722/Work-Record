import { mkdir, access } from 'node:fs/promises'
import { constants } from 'node:fs'
import { createPathGuard } from '../storage/path-guard.mjs'
import { createFsOps } from '../storage/fs-ops.mjs'
import { setActiveFs, clearActiveFs, hasActiveFs } from '../storage/fs-context.mjs'

/**
 * workspace-manager：工作区激活管理（主进程）
 *
 * 职责：
 *   - 激活工作区：校验路径有效性（存在且可访问，PRD §4.1.4），据此构建
 *     pathGuard + fs-ops，写入 fs-context（PRD §8.2.9：pathGuard 以激活工作区为界）
 *   - 保持工作区目录整洁：激活时初始化衍生数据目录 `.wr/`（PRD §3.3/§4.3.7，见 2.6）
 *   - 提供当前状态查询（active / root）
 *
 * 最近工作区列表是 UI 偏好，由渲染进程 localStorage 管理（PRD §2.8），
 * 主进程只掌握「当前激活」这一个边界。
 */

/** 当前激活工作区根目录（仅主进程侧记录，供 UI 展示路径） */
let activeRoot = null

/** 校验路径是否为有效目录（存在且可访问） */
async function isValidWorkspace(absPath) {
  try {
    await access(absPath, constants.R_OK)
    return true
  } catch {
    return false
  }
}

/**
 * 激活工作区。
 * @param {string} absPath 工作区根目录绝对路径
 * @returns {Promise<{ok:true, root:string}>} 成功；失败抛错含明确原因
 */
export async function activateWorkspace(absPath) {
  if (!absPath || typeof absPath !== 'string') {
    throw new Error('workspace: 工作区路径无效')
  }
  if (!(await isValidWorkspace(absPath))) {
    throw new Error(`workspace: 工作区路径不存在或不可访问「${absPath}」`)
  }

  // 以绝对路径构建新边界；guard.root 为归一化根目录
  const guard = createPathGuard(absPath)
  const ops = createFsOps(guard)

  // 初始化衍生数据目录（集中存放，保持工作区整洁，PRD §4.3.7）
  await mkdir(guard.resolvePath('.wr'), { recursive: true })

  activeRoot = guard.root
  setActiveFs(ops)
  return { ok: true, root: guard.root }
}

/** 清除当前激活工作区（切换前 / 退出时） */
export function deactivateWorkspace() {
  activeRoot = null
  clearActiveFs()
}

/** 当前激活状态 */
export function getWorkspaceStatus() {
  return hasActiveFs() && activeRoot
    ? { active: true, root: activeRoot }
    : { active: false }
}
