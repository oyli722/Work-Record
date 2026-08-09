// 主区编辑器（阶段 3.2/3.7：三态布局 + CodeMirror 编辑区 + 分屏同步滚动）
// 工具栏：文件名 + 三态切换（分屏/仅编辑/仅预览）+ 保存状态 + 保存按钮。
// 内容区：split 分屏（CodeMirror 编辑 | 预览占位），拖拽分隔条调比例（PRD §4.2.1）。
// 自动保存 / Ctrl+S 体系随 3.3；预览 markdown 渲染随 3.4。
// 3.7 分屏同步滚动（PRD §4.2.6）：split 模式下编辑/预览滚动双向联动（见下方编排）。
import { useCallback, useEffect, useRef, useState } from 'react'
import CodeMirrorEditor from './CodeMirrorEditor'
import PreviewPane from './PreviewPane'
import ConfirmDialog from './ConfirmDialog'

const MIN_RATIO = 15
const MAX_RATIO = 85

/** 相对路径的目录部分（工作区内，'/' 分隔） */
function dirOf(relPath) {
  const i = relPath.lastIndexOf('/')
  return i === -1 ? '' : relPath.slice(0, i)
}

export default function EditorPane({ editor, theme, onToggleFocus }) {
  const { currentFile, content, saveState, dirty, error, loading, setContent, save, externalChange } = editor
  const isMarkdown = /\.md$/i.test(currentFile ?? '') // TXT 预览退化为纯文本
  // 相对图片基准目录：当前文件所在目录（工作区内，PRD §4.4.2）
  const baseDir = dirOf(currentFile ?? '')
  const [mode, setMode] = useState('split') // split | edit | preview
  const [ratio, setRatio] = useState(50) // 分屏比例（编辑区宽度 %）
  const bodyRef = useRef(null)
  const dragRef = useRef(null) // { startX, startRatio }

  // 4.5 外部改动覆盖确认：保存检测到磁盘被外部修改时弹确认（PRD §4.3.6）
  const [externalConfirm, setExternalConfirm] = useState(false)
  const handleSave = useCallback(async () => {
    const r = await save()
    if (r?.externalChange) setExternalConfirm(true)
  }, [save])

  // 3.7 分屏同步滚动（PRD §4.2.6）双向联动编排。
  // 子组件经 forwardRef 暴露 scrollToLine；drivingRef 记录当前驱动方向，回波忽略；
  // 驱动后延时清除以恢复用户滚动；子组件内部另有 programmatic 抑制，双保险防回环。
  const editorScrollRef = useRef(null)
  const previewScrollRef = useRef(null)
  const drivingRef = useRef(null) // 'editor' | 'preview' | null
  const driveTimerRef = useRef(0)

  // 编辑区滚动 → 驱动预览区。守卫语义（评审 S1）：对方（预览）驱动中，
  // 编辑区的 programmatic 回波应忽略；自己驱动期间置 drivingRef 并在延时后清除。
  const handleEditorTopLine = useCallback((line) => {
    if (drivingRef.current === 'preview') return
    drivingRef.current = 'editor'
    clearTimeout(driveTimerRef.current)
    driveTimerRef.current = setTimeout(() => {
      drivingRef.current = null
    }, 80)
    previewScrollRef.current?.scrollToLine(line)
  }, [])

  // 预览区滚动 → 驱动编辑区。守卫语义对称：编辑驱动中忽略预览区回波。
  const handlePreviewTopLine = useCallback((line) => {
    if (drivingRef.current === 'editor') return
    drivingRef.current = 'preview'
    clearTimeout(driveTimerRef.current)
    driveTimerRef.current = setTimeout(() => {
      drivingRef.current = null
    }, 80)
    editorScrollRef.current?.scrollToLine(line)
  }, [])

  // 卸载清理联动定时器
  useEffect(() => () => clearTimeout(driveTimerRef.current), [])

  // Ctrl+S 手动保存（PRD §4.2.3；无文件时不注册，避免误触发「尚未打开文件」错误）
  useEffect(() => {
    if (!currentFile) return
    function onKeydown(e) {
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 's' || e.key === 'S')) {
        e.preventDefault()
        handleSave() // 4.5：检测到外部改动时转确认弹窗
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [currentFile, save, handleSave])

  /** 开始拖拽分隔条 */
  function onDividerDown(e) {
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startRatio: ratio }
    window.addEventListener('mousemove', onDividerMove)
    window.addEventListener('mouseup', onDividerUp)
  }

  function onDividerMove(e) {
    const drag = dragRef.current
    const container = bodyRef.current
    if (!drag || !container) return
    const rect = container.getBoundingClientRect()
    if (rect.width === 0) return
    const deltaPct = ((e.clientX - drag.startX) / rect.width) * 100
    setRatio(Math.min(MAX_RATIO, Math.max(MIN_RATIO, drag.startRatio + deltaPct)))
  }

  function onDividerUp() {
    dragRef.current = null
    window.removeEventListener('mousemove', onDividerMove)
    window.removeEventListener('mouseup', onDividerUp)
  }

  const modeBtn = (m, label) => (
    <button
      type="button"
      className={`editor__mode${mode === m ? ' editor__mode--active' : ''}`}
      onClick={() => setMode(m)}
      title={`${label}模式`}
    >
      {label}
    </button>
  )

  return (
    <div className="editor">
      {currentFile ? (
        <>
          <div className="editor__bar">
            <span className="editor__file" title={currentFile}>
              {currentFile}
            </span>
            <div className="editor__modes" role="group" aria-label="编辑器模式">
              {modeBtn('split', '分屏')}
              {modeBtn('edit', '编辑')}
              {modeBtn('preview', '预览')}
            </div>
            {/* 3.8 专注模式入口：分屏切换旁（focus 时 editor__bar 整体隐藏） */}
            <button
              type="button"
              className="editor__focus"
              onClick={onToggleFocus}
              title="专注模式 (F11)"
              aria-label="专注模式"
            >
              ⛶
            </button>
            <span
              className={`editor__status${dirty ? ' editor__status--dirty' : ''}${
                externalChange ? ' editor__status--conflict' : ''
              }`}
              title={
                externalChange
                  ? '磁盘文件已被外部修改，保存被阻止；Ctrl+S 或保存按钮可确认覆盖'
                  : undefined
              }
            >
              {saveState === 'saving'
                ? '保存中…'
                : externalChange
                  ? '磁盘已变更·保存被阻止'
                  : dirty
                    ? '未保存'
                    : '已保存'}
            </span>
            <button
              type="button"
              className="editor__save"
              onClick={handleSave}
              disabled={saveState === 'saving' || !dirty}
            >
              保存
            </button>
          </div>

          <div className="editor__body" ref={bodyRef}>
            {mode === 'preview' ? (
              <div className="editor__pane editor__pane--preview editor__pane--full">
                <PreviewPane content={content} isMarkdown={isMarkdown} baseDir={baseDir} />
              </div>
            ) : (
              <div
                className="editor__pane editor__pane--edit"
                style={mode === 'edit' ? { flex: '1 1 100%' } : { flex: `0 0 ${ratio}%` }}
              >
                <CodeMirrorEditor
                  ref={editorScrollRef}
                  value={content}
                  onChange={setContent}
                  theme={theme}
                  onTopLineChange={mode === 'split' ? handleEditorTopLine : undefined}
                />
              </div>
            )}
            {mode === 'split' && (
              <>
                <div
                  className="editor__divider"
                  onMouseDown={onDividerDown}
                  role="separator"
                  aria-orientation="vertical"
                  title="拖拽调整分屏比例"
                />
                <div className="editor__pane editor__pane--preview">
                  <PreviewPane
                    ref={previewScrollRef}
                    content={content}
                    isMarkdown={isMarkdown}
                    baseDir={baseDir}
                    onTopLineChange={handlePreviewTopLine}
                  />
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <div className="editor__empty">
          {loading ? (
            <p className="editor__empty-hint">加载中…</p>
          ) : (
            <p className="editor__empty-hint">点击侧边栏图标展开文件列表，选择一个文件打开</p>
          )}
        </div>
      )}
      {error && <p className="editor__error">{error}</p>}

      {/* 4.5 外部改动覆盖确认（PRD §4.3.6） */}
      {externalConfirm && (
        <ConfirmDialog
          title="保存覆盖提示"
          message="磁盘中的文件已被外部修改。"
          warning="保存将覆盖外部改动，是否继续？"
          confirmLabel="覆盖保存"
          onConfirm={async () => {
            setExternalConfirm(false)
            await save(true) // 用户已确认：强制覆盖（跳过检测）
          }}
          onCancel={() => setExternalConfirm(false)}
        />
      )}
    </div>
  )
}
