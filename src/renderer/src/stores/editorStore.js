// 编辑器数据层（渲染进程，PRD §4.2）
// 管理当前打开文件、内容、脏标记与保存状态；读写统一经 window.mework.fs
// （主进程 pathGuard 沙箱，真实落盘 PRD §2.4）。
// 阶段 3 MVP 为单文档模型；多标签页随阶段 7 引入，本层接口保持可扩展。
//
// 保存体系（3.3 / 3.9）：
//   - 自动保存：编辑后停止输入约 autosaveDelayMs 触发落盘（防抖，持续输入不触发）
//   - 自动保存开关关闭时完全禁用定时落盘，仅手动保存（3.9 用户定案）
//   - 手动保存：按钮 / Ctrl+S 立即落盘，并取消待触发的自动保存
//   - 内容无变化不写盘（与上次落盘一致则跳过）
//   - saveState: saved（已保存） → dirty（未保存） → saving（保存中） → saved
//   - error: 加载 / 保存失败的明确文案（PRD §4.2.5 / §5.4）
// 3.9 编辑器设置数据层：自动保存开关/防抖间隔来自 useEditorSettings（PRD §4.8.4），
// 默认开启 + 30s（v1.3 定案），经 App 传入；参数缺省时回退默认。

import { useState, useCallback, useRef, useEffect } from 'react'

export default function useEditor({
  autosaveEnabled = true,
  autosaveDelayMs = 30000
} = {}) {
  const [currentFile, setCurrentFile] = useState(null) // 当前打开文件（相对工作区根）
  const [content, setContentState] = useState('')
  const [saveState, setSaveState] = useState('saved') // saved | saving | dirty
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // ref 镜像最新值：供回调在稳定闭包下读写（避免 useCallback 依赖链抖动）
  const currentFileRef = useRef(null)
  const contentRef = useRef('')
  const savedContentRef = useRef('')
  const autosaveTimerRef = useRef(null)

  /** 实际落盘逻辑（自动 / 手动 / 切换前共用）。内容无变化不写盘。 */
  const doSave = useCallback(async () => {
    const file = currentFileRef.current
    const text = contentRef.current
    if (!file) return { ok: false, error: '尚未打开文件' }
    if (text === savedContentRef.current) return { ok: true } // 无变化不写盘（PRD §4.5.2 同源）
    setSaveState('saving')
    try {
      await window.mework.fs.writeFile(file, text)
      savedContentRef.current = text
      // 保存期间若有新编辑，保持 dirty，避免「已保存」状态失真丢编辑（评审 P1）
      setSaveState(contentRef.current === text ? 'saved' : 'dirty')
      return { ok: true }
    } catch (err) {
      setSaveState('dirty')
      const msg = String(err?.message ?? err)
      setError(msg) // 保存失败统一提示（评审 S-3.3-1：自动保存失败也应有原因）
      return { ok: false, error: msg }
    }
  }, [])

  /** 取消待触发的自动保存 */
  const clearAutosave = useCallback(() => {
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = null
    }
  }, [])

  /** 启动 / 重置自动保存计时（持续编辑时不断推迟）；开关关闭则不启动（3.9） */
  const scheduleAutosave = useCallback(() => {
    clearAutosave()
    if (!autosaveEnabled) return // 自动保存关闭：完全禁用定时落盘，仅手动保存
    autosaveTimerRef.current = setTimeout(() => {
      doSave() // 定时到期自动保存；无变化时 doSave 内跳过
    }, autosaveDelayMs)
  }, [clearAutosave, doSave, autosaveEnabled, autosaveDelayMs])

  /** 打开文件：先保存未落盘内容（防丢失），再读取新文件。
      加载失败（被删 / 无权限）给出明确错误（PRD §4.2.5）。 */
  const openFile = useCallback(
    async (relPath) => {
      // 切换前若有未保存内容，先落盘；保存失败则中止打开并提示
      if (currentFileRef.current && contentRef.current !== savedContentRef.current) {
        const prev = await doSave()
        if (!prev.ok) {
          setError(prev.error)
          return { ok: false, error: prev.error }
        }
      }
      clearAutosave() // 切换文件，取消旧文件待保存计时
      setLoading(true)
      setError(null)
      try {
        const text = await window.mework.fs.readFile(relPath)
        currentFileRef.current = relPath
        contentRef.current = text
        savedContentRef.current = text
        setCurrentFile(relPath)
        setContentState(text)
        setSaveState('saved')
        return { ok: true }
      } catch (err) {
        const msg = String(err?.message ?? err)
        setError(msg)
        return { ok: false, error: msg }
      } finally {
        setLoading(false)
      }
    },
    [doSave, clearAutosave]
  )

  /** 编辑内容：更新内容与脏标记；有未保存内容时启动/重置自动保存计时（3.3） */
  const setContent = useCallback(
    (text) => {
      contentRef.current = text
      setContentState(text)
      const dirty = text !== savedContentRef.current
      setSaveState(dirty ? 'dirty' : 'saved')
      if (dirty) scheduleAutosave()
      else clearAutosave()
    },
    [scheduleAutosave, clearAutosave]
  )

  /** 手动保存（按钮 / Ctrl+S）：取消待保存计时并立即落盘 */
  const save = useCallback(async () => {
    clearAutosave()
    const r = await doSave()
    if (!r.ok) setError(r.error)
    return r
  }, [doSave, clearAutosave])

  /** 关闭当前文件（切换工作区后调用，清空编辑器状态） */
  const close = useCallback(() => {
    clearAutosave()
    currentFileRef.current = null
    contentRef.current = ''
    savedContentRef.current = ''
    setCurrentFile(null)
    setContentState('')
    setSaveState('saved')
    setError(null)
  }, [clearAutosave])

  /** 重命名后同步当前文件路径（4.3）：若打开的就是被重命名文件，更新引用避免保存到旧路径 */
  const renameCurrentFile = useCallback((oldRelPath, newRelPath) => {
    if (currentFileRef.current === oldRelPath) {
      currentFileRef.current = newRelPath
      setCurrentFile(newRelPath)
    }
  }, [])

  // 卸载时清理自动保存定时器（未触发的保存不泄漏）
  useEffect(() => clearAutosave, [clearAutosave])

  return {
    currentFile,
    content,
    saveState,
    dirty: saveState === 'dirty',
    error,
    loading,
    openFile,
    setContent,
    save,
    close,
    renameCurrentFile
  }
}
