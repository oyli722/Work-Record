// 编辑器数据层（渲染进程，PRD §4.2 / §4.7）
// 阶段 7 多标签：tabs[] 每标签独立 内容/脏标记/保存状态/磁盘快照/自动保存计时/externalChange。
// 活动标签为 UI 当前展示；打开文件 = 新开标签或激活已有标签（§4.7.1）。
// 保存体系（3.3/5.2）：自动保存（防抖，每标签计时）、手动保存、无变化不写盘、保存记版。
// 外部改动检测（4.5）：每标签磁盘快照比对，磁盘被外部修改时保存被阻止并提示（§4.3.6）。

import { useCallback, useRef, useState } from 'react'

// 自动保存防抖间隔默认 30s（由 useEditorSettings 传入，3.9）
const DEFAULT_DELAY = 30000

function createTab(relPath, content) {
  return {
    relPath,
    content,
    savedContent: content,
    diskSnapshot: content,
    saveState: 'saved', // saved | saving | dirty
    error: null,
    loading: false,
    externalChange: false
  }
}

export default function useEditor({ autosaveEnabled = true, autosaveDelayMs = DEFAULT_DELAY } = {}) {
  const [tabs, setTabs] = useState([])
  const [activeRelPath, setActiveRelPath] = useState(null)
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs // render 时同步最新值（供回调在稳定闭包下读取）
  const activeRef = useRef(activeRelPath)
  activeRef.current = activeRelPath
  const autosaveTimersRef = useRef(new Map()) // relPath -> timerId（每标签独立计时）

  /** 不可变更新指定标签 */
  const updateTab = (relPath, updater) => {
    setTabs((ts) => ts.map((t) => (t.relPath === relPath ? updater(t) : t)))
  }

  /** 实际落盘（指定标签）。无变化不写盘 → 不记版。force 跳过外部改动检测（覆盖确认后）。 */
  const doSave = useCallback(async (relPath, force = false, editedBy = 'save') => {
    const tab = tabsRef.current.find((t) => t.relPath === relPath)
    if (!tab) return { ok: false, error: '标签不存在' }
    if (tab.content === tab.savedContent) return { ok: true } // 无变化不写盘（PRD §4.5.2）
    if (!force) {
      try {
        const disk = await window.mework.fs.readFile(relPath)
        if (disk !== tab.diskSnapshot) {
          updateTab(relPath, (t) => ({ ...t, externalChange: true }))
          return { ok: false, externalChange: true } // 磁盘被外部修改（4.5）
        }
      } catch {
        /* 读磁盘失败（外部删除等）：继续保存 */
      }
    }
    updateTab(relPath, (t) => ({ ...t, saveState: 'saving' }))
    try {
      await window.mework.fs.writeFile(relPath, tab.content)
      updateTab(relPath, (t) => ({
        ...t,
        savedContent: t.content,
        diskSnapshot: t.content,
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

  /** 取消指定标签的待触发自动保存 */
  const clearAutosave = useCallback((relPath) => {
    const old = autosaveTimersRef.current.get(relPath)
    if (old) clearTimeout(old)
    autosaveTimersRef.current.delete(relPath)
  }, [])

  /** 启动/重置指定标签的自动保存计时（开关关闭则不启动，3.9） */
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

  /** 打开文件：已打开则激活；未打开则新开标签并加载（§4.7.1） */
  const openFile = useCallback(async (relPath) => {
    if (tabsRef.current.some((t) => t.relPath === relPath)) {
      activeRef.current = relPath
      setActiveRelPath(relPath)
      return { ok: true }
    }
    setTabs((ts) => [...ts, { ...createTab(relPath, ''), loading: true }])
    activeRef.current = relPath
    setActiveRelPath(relPath)
    try {
      const text = await window.mework.fs.readFile(relPath)
      setTabs((ts) =>
        ts.map((t) =>
          t.relPath === relPath
            ? { ...t, content: text, savedContent: text, diskSnapshot: text, loading: false }
            : t
        )
      )
      return { ok: true }
    } catch (err) {
      const msg = String(err?.message ?? err)
      setTabs((ts) => ts.map((t) => (t.relPath === relPath ? { ...t, loading: false, error: msg } : t)))
      return { ok: false, error: msg }
    }
  }, [])

  /** 激活标签（同步 activeRef，供同一事件循环内 save 等读取） */
  const activateTab = useCallback((relPath) => {
    if (tabsRef.current.some((t) => t.relPath === relPath)) {
      activeRef.current = relPath
      setActiveRelPath(relPath)
    }
  }, [])

  /** 关闭前检查：未保存则需确认（7.3 三选弹窗） */
  const closeTab = useCallback((relPath) => {
    const tab = tabsRef.current.find((t) => t.relPath === relPath)
    return { needsConfirm: !!tab && tab.content !== tab.savedContent }
  }, [])

  /** 实际关闭标签（放弃未保存内容）；活动标签关闭则激活相邻标签 */
  const confirmCloseTab = useCallback(
    (relPath) => {
      clearAutosave(relPath)
      setTabs((ts) => {
        const idx = ts.findIndex((t) => t.relPath === relPath)
        const next = ts.filter((t) => t.relPath !== relPath)
        if (activeRef.current === relPath) {
          const fallback = next[Math.min(idx, next.length - 1)]
          activeRef.current = fallback?.relPath ?? null
          setActiveRelPath(fallback?.relPath ?? null)
        }
        return next
      })
    },
    [clearAutosave]
  )

  /** 编辑活动标签内容：更新内容与脏标记；有未保存内容时启动/重置自动保存计时 */
  const setContent = useCallback(
    (text) => {
      const relPath = activeRef.current
      if (!relPath) return
      updateTab(relPath, (t) => {
        const dirty = text !== t.savedContent
        if (dirty) scheduleAutosave(relPath)
        else clearAutosave(relPath)
        return { ...t, content: text, saveState: dirty ? 'dirty' : 'saved' }
      })
    },
    [scheduleAutosave, clearAutosave]
  )

  /** 手动保存活动标签（按钮 / Ctrl+S）；force 跳过外部改动检测（4.5） */
  const save = useCallback(
    async (force = false, editedBy = 'save') => {
      const relPath = activeRef.current
      if (!relPath) return { ok: false, error: '尚未打开文件' }
      const r = await doSave(relPath, force, editedBy)
      if (!r.ok && !r.externalChange) {
        const tab = tabsRef.current.find((t) => t.relPath === relPath)
        if (tab) updateTab(relPath, (t) => ({ ...t, error: r.error }))
      }
      return r
    },
    [doSave]
  )

  /** 回滚活动标签到指定版本（5.5，独立流程强制落盘 + 记 rollback 版） */
  const rollbackTo = useCallback(async (versionId) => {
    const relPath = activeRef.current
    if (!relPath) return { ok: false, error: '尚未打开文件' }
    try {
      const { content } = await window.mework.fs.versionRead(relPath, versionId)
      updateTab(relPath, (t) => ({ ...t, content }))
      await window.mework.fs.writeFile(relPath, content)
      updateTab(relPath, (t) => ({
        ...t,
        savedContent: content,
        diskSnapshot: content,
        externalChange: false,
        saveState: 'saved'
      }))
      await window.mework.fs.versionRecord(relPath, content, 'rollback')
      return { ok: true }
    } catch (err) {
      const msg = String(err?.message ?? err)
      updateTab(relPath, (t) => ({ ...t, saveState: 'dirty', error: msg }))
      return { ok: false, error: msg }
    }
  }, [])

  /** 重命名后同步标签路径（4.3） */
  const renameCurrentFile = useCallback((oldRelPath, newRelPath) => {
    setTabs((ts) => ts.map((t) => (t.relPath === oldRelPath ? { ...t, relPath: newRelPath } : t)))
    if (activeRef.current === oldRelPath) {
      activeRef.current = newRelPath
      setActiveRelPath(newRelPath)
    }
  }, [])

  /** 删除后若打开标签受影响则关闭（4.4） */
  const closeIfPathDeleted = useCallback((deletedRelPath) => {
    setTabs((ts) => {
      const next = ts.filter(
        (t) => !(t.relPath === deletedRelPath || t.relPath.startsWith(`${deletedRelPath}/`))
      )
      if (next.length !== ts.length) {
        if (next.length === 0) {
          activeRef.current = null
          setActiveRelPath(null)
        } else if (!next.some((t) => t.relPath === activeRef.current)) {
          activeRef.current = next[0].relPath
          setActiveRelPath(next[0].relPath)
        }
        return next
      }
      return ts
    })
  }, [])

  /** 关闭全部标签（切换工作区后调用） */
  const close = useCallback(() => {
    autosaveTimersRef.current.forEach((timer) => clearTimeout(timer))
    autosaveTimersRef.current.clear()
    setTabs([])
    activeRef.current = null
    setActiveRelPath(null)
  }, [])

  // 活动标签派生状态（UI 直接消费）
  const activeTab = tabs.find((t) => t.relPath === activeRelPath) ?? null

  return {
    tabs,
    activeRelPath,
    currentFile: activeTab?.relPath ?? null,
    content: activeTab?.content ?? '',
    saveState: activeTab?.saveState ?? 'saved',
    dirty: activeTab?.saveState === 'dirty',
    error: activeTab?.error ?? null,
    loading: activeTab?.loading ?? false,
    externalChange: activeTab?.externalChange ?? false,
    openFile,
    activateTab,
    closeTab,
    confirmCloseTab,
    setContent,
    save,
    close,
    renameCurrentFile,
    closeIfPathDeleted,
    rollbackTo
  }
}
