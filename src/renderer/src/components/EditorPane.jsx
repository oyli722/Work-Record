// 主区编辑器（阶段 3.2：三态布局 + CodeMirror 编辑区）
// 工具栏：文件名 + 三态切换（分屏/仅编辑/仅预览）+ 保存状态 + 保存按钮。
// 内容区：split 分屏（CodeMirror 编辑 | 预览占位），拖拽分隔条调比例（PRD §4.2.1）。
// 自动保存 / Ctrl+S 体系随 3.3；预览 markdown 渲染随 3.4。
import { useRef, useState } from 'react'
import CodeMirrorEditor from './CodeMirrorEditor'
import PreviewPane from './PreviewPane'

const MIN_RATIO = 15
const MAX_RATIO = 85

export default function EditorPane({ editor, theme }) {
  const { currentFile, content, saveState, dirty, error, loading, setContent, save } = editor
  const [mode, setMode] = useState('split') // split | edit | preview
  const [ratio, setRatio] = useState(50) // 分屏比例（编辑区宽度 %）
  const bodyRef = useRef(null)
  const dragRef = useRef(null) // { startX, startRatio }

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
            <span className={`editor__status${dirty ? ' editor__status--dirty' : ''}`}>
              {saveState === 'saving' ? '保存中…' : dirty ? '未保存' : '已保存'}
            </span>
            <button
              type="button"
              className="editor__save"
              onClick={save}
              disabled={saveState === 'saving' || !dirty}
            >
              保存
            </button>
          </div>

          <div className="editor__body" ref={bodyRef}>
            {mode === 'preview' ? (
              <div className="editor__pane editor__pane--preview editor__pane--full">
                <PreviewPane content={content} />
              </div>
            ) : (
              <div
                className="editor__pane editor__pane--edit"
                style={mode === 'edit' ? { flex: '1 1 100%' } : { flex: `0 0 ${ratio}%` }}
              >
                <CodeMirrorEditor value={content} onChange={setContent} theme={theme} />
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
                  <PreviewPane content={content} />
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
    </div>
  )
}
