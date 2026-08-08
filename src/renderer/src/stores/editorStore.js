// 编辑器数据层（渲染进程，PRD §4.2）
// 管理当前打开文件、内容、脏标记与保存状态；读写统一经 window.mework.fs
// （主进程 pathGuard 沙箱，真实落盘 PRD §2.4）。
// 阶段 3 MVP 为单文档模型；多标签页随阶段 7 引入，本层接口保持可扩展。
//
// 状态机：
//   saveState: saved（已保存，内容=上次落盘） → dirty（未保存） → saving（保存中） → saved
//   error: 加载 / 保存失败的明确文案（PRD §4.2.5 / §5.4）

import { useState, useCallback, useRef } from 'react'

export default function useEditor() {
  const [currentFile, setCurrentFile] = useState(null) // 当前打开文件（相对工作区根）
  const [content, setContentState] = useState('')
  const [saveState, setSaveState] = useState('saved') // saved | saving | dirty
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  // ref 镜像最新值：供回调在稳定闭包下读写（避免 useCallback 依赖链抖动）
  const currentFileRef = useRef(null)
  const contentRef = useRef('')
  const savedContentRef = useRef('')

  /** 实际落盘逻辑（供 openFile 切换前 / 手动保存共用） */
  const doSave = useCallback(async () => {
    const file = currentFileRef.current
    const text = contentRef.current
    if (!file) return { ok: false, error: '尚未打开文件' }
    setSaveState('saving')
    try {
      await window.mework.fs.writeFile(file, text)
      savedContentRef.current = text
      // 保存期间若有新编辑，保持 dirty，避免「已保存」状态失真丢编辑（评审 P1）
      setSaveState(contentRef.current === text ? 'saved' : 'dirty')
      return { ok: true }
    } catch (err) {
      setSaveState('dirty')
      return { ok: false, error: String(err?.message ?? err) }
    }
  }, [])

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
    [doSave]
  )

  /** 编辑内容：更新内容与脏标记（与已保存内容比对）。 */
  const setContent = useCallback((text) => {
    contentRef.current = text
    setContentState(text)
    setSaveState(text === savedContentRef.current ? 'saved' : 'dirty')
  }, [])

  /** 手动保存当前内容到磁盘（自动保存体系随 3.3 接入） */
  const save = useCallback(async () => {
    const r = await doSave()
    if (!r.ok) setError(r.error)
    return r
  }, [doSave])

  /** 关闭当前文件（切换工作区后调用，清空编辑器状态） */
  const close = useCallback(() => {
    currentFileRef.current = null
    contentRef.current = ''
    savedContentRef.current = ''
    setCurrentFile(null)
    setContentState('')
    setSaveState('saved')
    setError(null)
  }, [])

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
    close
  }
}
