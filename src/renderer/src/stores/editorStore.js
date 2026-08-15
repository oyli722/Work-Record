// 编辑器数据层（渲染进程，PRD §4.2 / §4.7；CC-3 Tab 模型扩展，设计文档 §3.1）
// 阶段 7 多标签：tabs[] 每标签独立 内容/脏标记/保存状态/磁盘快照/自动保存计时/externalChange。
// CC-3 泛化：tabs[] 支持两类标签——
//   file tab（现状字段全保留）：{ type:'file', key: relPath, relPath, content, ... }
//   terminal tab（CC Console）：{ type:'terminal', key:`terminal:${termId}`, termId, cwdRelPath, title, exited }
// activeRelPath → activeKey（file tab 的 key === relPath，现有 file 语义调用点不变）；
// currentFile 派生为「活动标签为 file 时返回 relPath，否则 null」（UI 的 file 语义消费点）。
// 终端 Tab 不参与：自动保存、记版、外部改动 stat 检测、Ctrl+S（EditorPane 按 type 分流）。
// 保存体系（3.3/5.2）：自动保存（防抖，每标签计时）、手动保存、无变化不写盘、保存记版。
// 外部改动检测（4.5）：每标签磁盘快照比对，磁盘被外部修改时保存被阻止并提示（§4.3.6）。

import { useCallback, useRef, useState } from 'react'
import { addOpenTab, clearOpenTabs, removeOpenTabs, updateOpenTabs } from './openTabsStorage'
import { deriveFileState } from '../utils/tab-state'

// 自动保存防抖间隔默认 30s（由 useEditorSettings 传入，3.9）
const DEFAULT_DELAY = 30000

/** 占位终端 tab 的 key 自增（termId 为 null 时无真实 termId，需保证 key 唯一） */
let restoreSeq = 0

/** file tab 工厂：key === relPath，现有字段全保留 */
function createTab(relPath, content) {
  return {
    type: 'file',
    key: relPath,
    relPath,
    content,
    savedContent: content,
    diskStat: null, // { mtimeMs, size } 外部改动检测快照（8.4，替代全量内容比对）
    saveState: 'saved', // saved | saving | dirty
    error: null,
    loading: false,
    externalChange: false
  }
}

/** terminal tab 工厂（设计 §3.1）：termId 为 null 表示占位（重启恢复，进程已随上次退出关闭）；
    exited 标记进程已退出（CC-4 退出占位态），exitCode 为退出码（可 null） */
function createTerminalTab({ termId, cwdRelPath, title, exited = false, exitCode = null }) {
  const key = termId ? `terminal:${termId}` : `terminal:restore:${++restoreSeq}`
  return { type: 'terminal', key, termId: termId ?? null, cwdRelPath, title, exited, exitCode }
}

export default function useEditor({ autosaveEnabled = true, autosaveDelayMs = DEFAULT_DELAY } = {}) {
  const [tabs, setTabs] = useState([])
  const [activeKey, setActiveKey] = useState(null)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs // render 时同步最新值（供回调在稳定闭包下读取）
  const activeRef = useRef(activeKey)
  activeRef.current = activeKey
  const autosaveTimersRef = useRef(new Map()) // relPath -> timerId（每标签独立计时，仅 file tab）

  /** 不可变更新指定标签（按 key；file tab 的 key === relPath） */
  const updateTab = (key, updater) => {
    setTabs((ts) => ts.map((t) => (t.key === key ? updater(t) : t)))
  }

  /** 实际落盘（指定 file 标签）。无变化不写盘 → 不记版。force 跳过外部改动检测（覆盖确认后）。 */
  const doSave = useCallback(async (relPath, force = false, editedBy = 'save') => {
    const tab = tabsRef.current.find((t) => t.type === 'file' && t.relPath === relPath)
    if (!tab) return { ok: false, error: '标签不存在' }
    if (tab.content === tab.savedContent) return { ok: true } // 无变化不写盘（PRD §4.5.2）
    if (!force) {
      try {
        // 8.4：stat mtime/size 快照比对（评审 S2：替代全量 readFile，大文件显著降 IO）
        const s = await window.mework.fs.stat(relPath)
        const snap = tab.diskStat
        if (snap && (s.mtimeMs !== snap.mtimeMs || s.size !== snap.size)) {
          updateTab(relPath, (t) => ({ ...t, externalChange: true }))
          return { ok: false, externalChange: true } // 磁盘被外部修改（4.5）
        }
      } catch {
        /* stat 失败（外部删除等）：继续保存。P2-5 用户定案（2026-08-16）：
           文件被外部删除后保存即静默重建（内容 = 当前编辑内容），不加 UI 提示——有意行为，勿改 */
      }
    }
    updateTab(relPath, (t) => ({ ...t, saveState: 'saving' }))
    try {
      await window.mework.fs.writeFile(relPath, tab.content)
      // 8.4：写盘后更新磁盘 stat 快照
      let statInfo = null
      try {
        const s = await window.mework.fs.stat(relPath)
        statInfo = { mtimeMs: s.mtimeMs, size: s.size }
      } catch {
        /* stat 失败：diskStat 保持 null */
      }
      updateTab(relPath, (t) => ({
        ...t,
        savedContent: t.content,
        diskStat: statInfo,
        externalChange: false,
        saveState: t.content === tab.content ? 'saved' : 'dirty'
      }))
      try {
        await window.mework.fs.versionRecord(relPath, tab.content, editedBy) // 记版失败静默（评审 S3）
      } catch {
        /* 记版失败静默降级，下次保存重试 */
      }
      return { ok: true }
    } catch (err) {
      const msg = String(err?.message ?? err)
      updateTab(relPath, (t) => ({ ...t, saveState: 'dirty', error: msg }))
      return { ok: false, error: msg }
    }
  }, [])

  /** 取消指定 file 标签的待触发自动保存 */
  const clearAutosave = useCallback((relPath) => {
    const old = autosaveTimersRef.current.get(relPath)
    if (old) clearTimeout(old)
    autosaveTimersRef.current.delete(relPath)
  }, [])

  /** 启动/重置指定 file 标签的自动保存计时（开关关闭则不启动，3.9） */
  const scheduleAutosave = useCallback(
    (relPath) => {
      clearAutosave(relPath)
      if (!autosaveEnabled) return
      autosaveTimersRef.current.set(
        relPath,
        setTimeout(() => {
          autosaveTimersRef.current.delete(relPath)
          doSave(relPath, false, 'auto') // 自动保存记 auto 版（5.2）
        }, autosaveDelayMs)
      )
    },
    [autosaveEnabled, autosaveDelayMs, clearAutosave, doSave]
  )

  /** 打开文件：已打开则激活；未打开则新开标签并加载（§4.7.1，file 专用） */
  const openFile = useCallback(async (relPath) => {
    if (tabsRef.current.some((t) => t.type === 'file' && t.relPath === relPath)) {
      activeRef.current = relPath
      setActiveKey(relPath)
      return { ok: true }
    }
    setTabs((ts) => [...ts, { ...createTab(relPath, ''), loading: true }])
    activeRef.current = relPath
    setActiveKey(relPath)
    try {
      const text = await window.mework.fs.readFile(relPath)
      // 8.4：记录磁盘 stat 快照（外部改动检测，免全量读）
      let statInfo = null
      try {
        const s = await window.mework.fs.stat(relPath)
        statInfo = { mtimeMs: s.mtimeMs, size: s.size }
      } catch {
        /* stat 失败：diskStat 保持 null，检测时保守跳过 */
      }
      setTabs((ts) =>
        ts.map((t) =>
          t.type === 'file' && t.relPath === relPath
            ? { ...t, content: text, savedContent: text, diskStat: statInfo, loading: false }
            : t
        )
      )
      // P2-3：加载期间标签可能已被用户关闭——已关闭则不再写回持久化列表（否则重启后该文件会「复活」）
      if (!tabsRef.current.some((t) => t.type === 'file' && t.relPath === relPath)) {
        return { ok: true }
      }
      // 7.4 持久化打开列表（新标签；addOpenTab 内部按 relPath 去重）
      addOpenTab({ type: 'file', relPath })
      return { ok: true }
    } catch (err) {
      const msg = String(err?.message ?? err)
      setTabs((ts) => ts.map((t) => (t.type === 'file' && t.relPath === relPath ? { ...t, loading: false, error: msg } : t)))
      return { ok: false, error: msg }
    }
  }, [])

  /** 打开终端 Tab（CC-3，设计 §3.1/§3.5）：调 term:create 拿 termId → 建活跃 terminal tab + 持久化。
      CLI 缺失 / 启动失败返回 { ok:false, reason }（CC-5 右键菜单将依 check_cli 置灰，此处防御）。 */
  const openTerminalTab = useCallback(async ({ cwdRelPath = '.', title }) => {
    const r = await window.mework.term.create(cwdRelPath)
    if (!r.ok) return { ok: false, reason: r.reason }
    const tab = createTerminalTab({ termId: r.termId, cwdRelPath, title })
    setTabs((ts) => [...ts, tab])
    activeRef.current = tab.key
    setActiveKey(tab.key)
    // 7.4 持久化打开列表（addOpenTab 内部按 cwd+title 去重，P2-4）
    addOpenTab({ type: 'terminal', cwdRelPath, title })
    return { ok: true, termId: r.termId, key: tab.key }
  }, [])

  /** 重启恢复 terminal 占位 Tab（设计 §3.6）：进程已随上次退出关闭，占位待 CC-4 渲染重开按钮 */
  const restoreTerminalTab = useCallback(({ cwdRelPath, title }) => {
    setTabs((ts) => [...ts, createTerminalTab({ termId: null, cwdRelPath, title, exited: true })])
    return { ok: true }
  }, [])

  /** 标记 terminal tab 进程已退出（CC-4 退出占位态；由 TerminalPane 的 term:exit 事件回调触发） */
  const markTerminalExited = useCallback((key, exitCode) => {
    updateTab(key, (t) => (t.type === 'terminal' ? { ...t, exited: true, exitCode: exitCode ?? null } : t))
  }, [])

  /** 重开占位/退出 terminal tab（CC-4，设计 §3.6）：在原目录吊起全新 claude 会话（替换当前 tab，
      不恢复旧会话；旧占位 tab 原地复活为新 termId 的 tab，持久化条目不变）。 */
  const reopenTerminalTab = useCallback(async (key) => {
    const tab = tabsRef.current.find((t) => t.key === key)
    if (!tab || tab.type !== 'terminal') return { ok: false, reason: 'not-found' }
    const r = await window.mework.term.create(tab.cwdRelPath)
    if (!r.ok) return { ok: false, reason: r.reason }
    const newTab = createTerminalTab({ termId: r.termId, cwdRelPath: tab.cwdRelPath, title: tab.title })
    setTabs((ts) => ts.map((t) => (t.key === key ? newTab : t)))
    activeRef.current = newTab.key
    setActiveKey(newTab.key)
    return { ok: true, termId: r.termId, key: newTab.key }
  }, [])

  /** 激活标签（同步 activeRef，供同一事件循环内 save 等读取；按 key） */
  const activateTab = useCallback((key) => {
    if (tabsRef.current.some((t) => t.key === key)) {
      activeRef.current = key
      setActiveKey(key)
    }
  }, [])

  /** 关闭前检查：file 未保存则需确认（7.3 三选弹窗）；terminal 直接关（D7 无二次确认） */
  const closeTab = useCallback((key) => {
    const tab = tabsRef.current.find((t) => t.key === key)
    if (!tab || tab.type === 'terminal') return { needsConfirm: false }
    return { needsConfirm: tab.content !== tab.savedContent }
  }, [])

  /** 实际关闭标签（放弃未保存内容）；terminal 关 tab 即结束会话（杀 pty，D7）；活动标签关闭则激活相邻标签 */
  const confirmCloseTab = useCallback(
    (key) => {
      const closing = tabsRef.current.find((t) => t.key === key)
      // terminal：关闭 Tab 直接结束会话（D7，无二次确认）
      if (closing?.type === 'terminal' && closing.termId) {
        window.mework.term.kill(closing.termId).catch(() => {})
      }
      clearAutosave(closing?.relPath) // file 才可能计时；terminal 无计时，无害
      // 7.4 持久化移除关闭的标签（file 按 relPath、terminal 按 cwd+title 匹配）
      removeOpenTabs((it) =>
        closing?.type === 'terminal'
          ? it.type === 'terminal' && it.cwdRelPath === closing.cwdRelPath && it.title === closing.title
          : it.type === 'file' && it.relPath === closing?.relPath
      )
      setTabs((ts) => {
        const idx = ts.findIndex((t) => t.key === key)
        const next = ts.filter((t) => t.key !== key)
        if (activeRef.current === key) {
          const fallback = next[Math.min(idx, next.length - 1)]
          activeRef.current = fallback?.key ?? null
          setActiveKey(fallback?.key ?? null)
        }
        return next
      })
    },
    [clearAutosave]
  )

  /** 编辑活动 file 标签内容：更新内容与脏标记；有未保存内容时启动/重置自动保存计时。
      P2-1：计时器调度在 setState updater 之外（updater 必须纯函数；StrictMode 下 updater
      双调用不再重复调度计时器）；脏标记以 updater 内最新 savedContent 判定。 */
  const setContent = useCallback(
    (text) => {
      const key = activeRef.current
      const tab = tabsRef.current.find((t) => t.key === key)
      if (!tab || tab.type !== 'file') return
      const relPath = tab.relPath
      const dirty = text !== tab.savedContent // 快照判定（调度依据；与 updater 内判定仅差极小异步窗口）
      if (dirty) scheduleAutosave(relPath)
      else clearAutosave(relPath)
      updateTab(key, (t) => ({
        ...t,
        content: text,
        saveState: text !== t.savedContent ? 'dirty' : 'saved'
      }))
    },
    [scheduleAutosave, clearAutosave]
  )

  /** 手动保存活动 file 标签（按钮 / Ctrl+S）；force 跳过外部改动检测（4.5） */
  const save = useCallback(
    async (force = false, editedBy = 'save') => {
      const tab = tabsRef.current.find((t) => t.key === activeRef.current)
      if (!tab || tab.type !== 'file') return { ok: false, error: '尚未打开文件' }
      const r = await doSave(tab.relPath, force, editedBy)
      if (!r.ok && !r.externalChange) {
        const current = tabsRef.current.find((t) => t.key === tab.key)
        if (current) updateTab(tab.key, (t) => ({ ...t, error: r.error }))
      }
      return r
    },
    [doSave]
  )

  /** 保存全部未保存 file 标签（8.1 切换工作区前调用）。
      遇外部改动（未 force）返回 externalChange，由调用方确认覆盖或中止（评审 P1）；遇保存失败立即中止并返回错误，不静默吞错（P1 加固）。 */
  const saveAll = useCallback(
    async (force = false) => {
      for (const tab of tabsRef.current) {
        if (tab.type === 'file' && tab.content !== tab.savedContent) {
          const r = await doSave(tab.relPath, force, 'save')
          if (!force && r.externalChange) return { ok: false, externalChange: true }
          if (!r.ok) return r
        }
      }
      return { ok: true }
    },
    [doSave]
  )

  /** 回滚活动 file 标签到指定版本（5.5，独立流程强制落盘 + 记 rollback 版） */
  const rollbackTo = useCallback(async (versionId) => {
    const tab = tabsRef.current.find((t) => t.key === activeRef.current)
    if (!tab || tab.type !== 'file') return { ok: false, error: '尚未打开文件' }
    const relPath = tab.relPath
    try {
      const { content } = await window.mework.fs.versionRead(relPath, versionId)
      updateTab(tab.key, (t) => ({ ...t, content }))
      await window.mework.fs.writeFile(relPath, content)
      // 8.4：回滚后更新磁盘 stat 快照
      let statInfo = null
      try {
        const s = await window.mework.fs.stat(relPath)
        statInfo = { mtimeMs: s.mtimeMs, size: s.size }
      } catch {
        /* stat 失败 */
      }
      updateTab(tab.key, (t) => ({
        ...t,
        savedContent: content,
        diskStat: statInfo,
        externalChange: false,
        saveState: 'saved'
      }))
      await window.mework.fs.versionRecord(relPath, content, 'rollback')
      return { ok: true }
    } catch (err) {
      const msg = String(err?.message ?? err)
      updateTab(tab.key, (t) => ({ ...t, saveState: 'dirty', error: msg }))
      return { ok: false, error: msg }
    }
  }, [])

  /** 重命名后同步 file 标签路径（4.3）+ 持久化列表（7.4 评审 O2：旧路径 → 新路径） */
  const renameCurrentFile = useCallback((oldRelPath, newRelPath) => {
    // P2-2：自动保存计时器以 relPath 为 key——随重命名迁移，避免旧路径的 pending 计时
    // 到点触发 doSave(旧路径) 找不到标签而静默失效（重命名前刚编辑过即有 pending 计时）
    const pendingTimer = autosaveTimersRef.current.get(oldRelPath)
    if (pendingTimer) {
      autosaveTimersRef.current.delete(oldRelPath)
      autosaveTimersRef.current.set(newRelPath, pendingTimer)
    }
    setTabs((ts) =>
      ts.map((t) => (t.type === 'file' && t.relPath === oldRelPath ? { ...t, relPath: newRelPath, key: newRelPath } : t))
    )
    if (activeRef.current === oldRelPath) {
      activeRef.current = newRelPath
      setActiveKey(newRelPath)
    }
    // 7.4 持久化同步重命名（评审 O2：旧路径 → 新路径）
    updateOpenTabs((it) => it.type === 'file' && it.relPath === oldRelPath, (it) => ({ ...it, relPath: newRelPath }))
  }, [])

  /** 删除路径后关闭受影响标签（4.4，CC-7 扩展）：
      file：删除该文件或该目录下文件 → 关闭；terminal：cwd 在被删目录内（或其下）→ 关闭并 kill 进程（§3.5） */
  const closeIfPathDeleted = useCallback((deletedRelPath) => {
    const isInside = (relPath) =>
      relPath === deletedRelPath || relPath.startsWith(`${deletedRelPath}/`)
    // 先 kill 受影响终端进程（进程生命周期 = Tab 生命周期，D7）
    for (const t of tabsRef.current) {
      if (t.type === 'terminal' && t.termId && isInside(t.cwdRelPath)) {
        window.mework.term.kill(t.termId).catch(() => {})
      }
    }
    setTabs((ts) => {
      const next = ts.filter(
        (t) =>
          !(t.type === 'file' && isInside(t.relPath)) &&
          !(t.type === 'terminal' && isInside(t.cwdRelPath))
      )
      if (next.length !== ts.length) {
        if (next.length === 0) {
          activeRef.current = null
          setActiveKey(null)
        } else if (!next.some((t) => t.key === activeRef.current)) {
          activeRef.current = next[0].key
          setActiveKey(next[0].key)
        }
        return next
      }
      return ts
    })
  }, [])

  /** 关闭全部标签（切换工作区后调用）；terminal 进程一并清理（D11）；清空持久化打开列表（7.4） */
  const close = useCallback(() => {
    autosaveTimersRef.current.forEach((timer) => clearTimeout(timer))
    autosaveTimersRef.current.clear()
    // CC-3：terminal tab 进程随工作区切换静默结束（D11；before-quit 由 CC-7 接入）
    for (const t of tabsRef.current) {
      if (t.type === 'terminal' && t.termId) window.mework.term.kill(t.termId).catch(() => {})
    }
    clearOpenTabs() // 7.4 清空持久化打开列表
    setTabs([])
    activeRef.current = null
    setActiveKey(null)
  }, [])

  // 活动标签派生状态（UI 直接消费；file 语义空值由 deriveFileState 统一，terminal 下恒为空）
  const activeTab = tabs.find((t) => t.key === activeKey) ?? null
  const fileState = deriveFileState(activeTab)

  return {
    tabs,
    activeKey,
    activeTab,
    ...fileState,
    openFile,
    openTerminalTab,
    restoreTerminalTab,
    markTerminalExited,
    reopenTerminalTab,
    activateTab,
    closeTab,
    confirmCloseTab,
    setContent,
    save,
    close,
    renameCurrentFile,
    closeIfPathDeleted,
    rollbackTo,
    saveAll
  }
}
