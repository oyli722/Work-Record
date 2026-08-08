/**
 * fs-context：当前激活工作区的 fs-ops 实例持有者（模块级单例）
 *
 * 设计背景：IPC fs 通道需要一个「当前生效的 fs-ops」实例，而工作区的激活由
 * workspace 模块管理（PRD §8.2.9：pathGuard 以当前激活工作区为界）。
 * 此模块将「激活状态」与「fs 能力获取」解耦：
 *   - workspace 层在工作区激活/切换时调用 setActiveFs() / clearActiveFs()
 *   - IPC fs handler 统一经 getActiveFs() 取实例，未激活时明确报错
 * 保证任何时刻仅存在一个受控 fs 边界，渲染进程无法跨工作区读写。
 */

let activeFs = null

/** 设置当前激活工作区的 fs-ops（工作区激活时调用） */
export function setActiveFs(ops) {
  activeFs = ops
}

/** 清除当前激活工作区（切换 / 退出时调用），此后 fs 操作一律拒绝 */
export function clearActiveFs() {
  activeFs = null
}

/** 获取当前激活的 fs-ops；未激活时抛明确错误 */
export function getActiveFs() {
  if (!activeFs) {
    throw new Error('fs-context: 未激活工作区，无法执行文件操作')
  }
  return activeFs
}

/** 是否已有激活工作区 */
export function hasActiveFs() {
  return activeFs !== null
}
