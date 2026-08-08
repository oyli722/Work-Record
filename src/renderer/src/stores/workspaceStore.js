// 工作区状态管理（渲染进程，PRD §4.1 / §2.8）
// 最近工作区列表与「当前激活路径」是 UI 偏好，存 localStorage（PRD §4.1.2 / §2.8）；
// 真正的 fs 边界由主进程 workspace-manager 维护，本层只负责「持久化列表 + 发起激活」。

import { useState, useCallback } from 'react'

const STORAGE_KEY = 'mework.workspaces' // 最近工作区列表
const ACTIVE_KEY = 'mework.activeWorkspace' // 当前激活工作区路径

/** 读取最近工作区列表（不可用时降级空数组） */
function readRecent() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function writeRecent(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
  } catch {
    /* localStorage 不可用：仅本次会话生效 */
  }
}

function readActive() {
  try {
    return localStorage.getItem(ACTIVE_KEY)
  } catch {
    return null
  }
}

function writeActive(path) {
  try {
    if (path) localStorage.setItem(ACTIVE_KEY, path)
    else localStorage.removeItem(ACTIVE_KEY)
  } catch {
    /* ignore */
  }
}

export default function useWorkspace() {
  const [recent, setRecent] = useState(readRecent)
  const [activePath, setActivePath] = useState(readActive)
  // 初始 state 按是否记忆激活路径判定：有 → 恢复中（避免首帧闪烁「选择工作区」，评审 S4）
  const [state, setState] = useState(() => (readActive() ? 'activating' : 'idle')) // idle | activating | active
  const [error, setError] = useState(null)

  /** 激活一个工作区（用户在引导 / 切换时调用） */
  const activate = useCallback(
    async (absPath) => {
      setState('activating')
      setError(null)
      try {
        const res = await window.mework.workspace.activate(absPath)
        writeActive(res.root)
        writeRecent([res.root, ...recent.filter((p) => p !== res.root)].slice(0, 8))
        setActivePath(res.root)
        setRecent(readRecent())
        setState('active')
        return { ok: true }
      } catch (err) {
        // 激活失败：清空记忆路径（失效即引导重新选择，PRD §4.1.4）、回引导态，
        // error 留存在 store 供空状态展示（评审 P1 / G1）
        writeActive(null)
        setError(String(err?.message ?? err))
        setActivePath(null)
        setState('idle')
        return { ok: false, error: String(err?.message ?? err) }
      }
    },
    [recent]
  )

  /** 取消激活当前工作区（切换前） */
  const deactivate = useCallback(async () => {
    try {
      await window.mework.workspace.deactivate()
    } catch {
      /* 主进程未激活时忽略 */
    }
    writeActive(null)
    setActivePath(null)
    setState('idle')
    setError(null) // 回干净的空状态，不残留上一次操作错误
  }, [])

  /** 启动时恢复：若已记忆激活路径，尝试重新激活（PRD §4.1.4 有效性校验） */
  const restore = useCallback(async () => {
    const path = readActive()
    if (!path) {
      setState('idle')
      return { ok: false, restored: false }
    }
    const res = await activate(path)
    return { ok: res.ok, restored: res.ok }
  }, [activate])

  /** 从最近列表移除工作区（仅删记录，不碰磁盘任何文件）。
      若移除的是当前激活的工作区，同步取消激活（回引导态），
      避免「列表已清空但侧边栏顶部仍残留一个工作区」。 */
  const removeFromRecent = useCallback(
    (absPath) => {
      const next = recent.filter((p) => p !== absPath)
      writeRecent(next)
      setRecent(next)
      if (absPath === activePath) {
        deactivate()
      }
    },
    [recent, activePath, deactivate]
  )

  return {
    recent,
    activePath,
    state,
    error,
    activate,
    deactivate,
    restore,
    removeFromRecent
  }
}
