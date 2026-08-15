// 主区编辑器（阶段 3.2/3.7：三态布局 + CodeMirror 编辑区 + 分屏同步滚动）
// 工具栏：文件名 + 三态切换（分屏/仅编辑/仅预览）+ 保存状态 + 保存按钮。
// 内容区：split 分屏（CodeMirror 编辑 | 预览占位），拖拽分隔条调比例（PRD §4.2.1）。
// 自动保存 / Ctrl+S 体系随 3.3；预览 markdown 渲染随 3.4。
// 3.7 分屏同步滚动（PRD §4.2.6）：split 模式下编辑/预览滚动双向联动（见下方编排）。
import { useCallback, useEffect, useRef, useState } from 'react'
import CodeMirrorEditor from './CodeMirrorEditor'
import PreviewPane from './PreviewPane'
import ConfirmDialog from './ConfirmDialog'
import DiffView from './DiffView'
import TabBar from './TabBar'
import TerminalPane from './TerminalPane'
import { ExpandIcon } from './icons'
import { dirOf, fileNameOf } from '../utils/path'
import { isMarkdownFile } from '../../../shared/format-registry'

const MIN_RATIO = 15
const MAX_RATIO = 85

export default function EditorPane({ editor, theme, onToggleFocus, compare, shortcutActionsRef, fontSize }) {
  const {
    activeTab,
    activeKey,
    tabs,
    currentFile,
    content,
    saveState,
    dirty,
    error,
    loading,
    setContent,
    save,
    externalChange
  } = editor
  // CC-3：终端 Tab 占满主内容区（D4），file 语义状态（content/saveState 等）终端下为空
  const isTerminal = activeTab?.type === 'terminal'
  // D12 常驻终端面板：全部 terminal tab 挂载不卸载（缓冲保留），仅激活者显示，切回 refit
  const terminalTabs = tabs.filter((t) => t.type === 'terminal')
  const isMarkdown = isMarkdownFile(currentFile) // 预览路由查格式注册表（TXT 退化为纯文本）
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

  // 7.2/7.3 关闭未保存标签：三选 保存/放弃/取消；「保存」遇外部改动（7.3）→ 覆盖确认后再关。
  // 9.2.2 批量关闭：closeQueue 为未保存标签队列，逐个弹三选（用户定案）；取消则中止批量。
  const [closeQueue, setCloseQueue] = useState([])
  const [closeExternalConfirm, setCloseExternalConfirm] = useState(null) // 覆盖确认（关闭流程）
  const closeTarget = closeQueue[0] ?? null

  // 9.2.6 快捷键动作注册（App 全局 keydown 分发；渲染期赋值保证闭包最新，同 onChangeRef 惯例）
  shortcutActionsRef.current.cycleMode = () =>
    setMode((m) => (m === 'split' ? 'edit' : m === 'edit' ? 'preview' : 'split'))
  shortcutActionsRef.current.closeTab = () => {
    if (!currentFile) return
    setCloseQueue([currentFile]) // 复用 7.2 关闭流程（含未保存三选）
  }

  /** 9.2.2 批量关闭入口：已保存直接关；未保存逐个入队三选（CC-3 按 key 寻址；terminal 无未保存直接关 D7） */
  function startBatchClose(keys) {
    const dirty = []
    for (const key of keys) {
      const { needsConfirm } = editor.closeTab(key)
      if (needsConfirm) dirty.push(key)
      else editor.confirmCloseTab(key)
    }
    if (dirty.length > 0) setCloseQueue((q) => [...q, ...dirty])
  }

  async function handleCloseSave() {
    const key = closeTarget
    editor.activateTab(key)
    const r = await save()
    if (r.ok) {
      editor.confirmCloseTab(key)
      setCloseQueue((q) => q.filter((x) => x !== key))
    } else if (r.externalChange) {
      setCloseExternalConfirm(key) // 覆盖确认期间队列保持，不弹下一个
    } else {
      setCloseQueue([]) // 保存失败：中止批量，保留现场
    }
  }
  function handleCloseDiscard() {
    const key = closeTarget
    editor.confirmCloseTab(key) // 放弃：丢弃未保存内容，无需写盘检测
    setCloseQueue((q) => q.filter((x) => x !== key))
  }
  async function handleCloseOverwrite() {
    const key = closeExternalConfirm
    setCloseExternalConfirm(null)
    editor.activateTab(key)
    const r = await save(true) // 用户确认覆盖外部改动（PRD §4.3.6）
    if (r.ok) {
      editor.confirmCloseTab(key)
      setCloseQueue((q) => q.filter((x) => x !== key))
    }
  }

  // 3.7 分屏同步滚动（PRD §4.2.6）双向联动编排。
  // 子组件经 forwardRef 暴露 scrollToLine；drivingRef 记录当前驱动方向，回波忽略；
  // 驱动后延时清除以恢复用户滚动；子组件内部另有 programmatic 抑制，双保险防回环。
  const editorScrollRef = useRef(null)
  const previewScrollRef = useRef(null)
  const drivingRef = useRef(null) // 'editor' | 'preview' | null
  const driveTimerRef = useRef(0)
  // 9.2.7：光标移动后短时忽略编辑器滚动上报——输入时光标变化会连带编辑器自动滚动
  // 到光标处（触发顶部行上报），若立即联动预览会以顶部行覆盖「光标行对齐」目标。
  // 窗口期内以光标行为准（预览跟随光标），窗口过后恢复顶部行联动。
  const cursorPriorityUntilRef = useRef(0)

  /** 驱动预览滚动到指定行。守卫语义（评审 S1）：对方（预览）驱动中忽略；
      自己驱动期间置 drivingRef 并在延时后清除，防 programmatic 回波成环。 */
  const drivePreview = useCallback((line) => {
    if (drivingRef.current === 'preview') return
    drivingRef.current = 'editor'
    clearTimeout(driveTimerRef.current)
    driveTimerRef.current = setTimeout(() => {
      drivingRef.current = null
    }, 80)
    previewScrollRef.current?.scrollToLine(line)
  }, [])

  // 编辑区滚动 → 驱动预览区（顶部行对齐）。
  const handleEditorTopLine = useCallback(
    (line) => {
      if (Date.now() < cursorPriorityUntilRef.current) return // 光标对齐优先
      drivePreview(line)
    },
    [drivePreview]
  )

  // 9.2.7 编辑区光标变化 → 驱动预览区（光标行对齐）。键入/点击/方向键导航时
  // 预览跟随光标所在行（修文件尾部编辑预览不同步）；光标优先级窗口抑制连带滚动。
  const handleEditorCursorLine = useCallback(
    (line) => {
      cursorPriorityUntilRef.current = Date.now() + 120
      drivePreview(line)
    },
    [drivePreview]
  )

  // 预览区滚动 → 驱动编辑区。守卫语义对称：编辑驱动中忽略预览区回波。
  const handlePreviewTopLine = useCallback(
    (line) => {
      if (drivingRef.current === 'editor') return
      drivingRef.current = 'preview'
      clearTimeout(driveTimerRef.current)
      driveTimerRef.current = setTimeout(() => {
        drivingRef.current = null
      }, 80)
      editorScrollRef.current?.scrollToLine(line)
    },
    []
  )

  // 卸载清理联动定时器
  useEffect(() => () => clearTimeout(driveTimerRef.current), [])

  // 9.2.7 三态切换保留光标位置：编辑器/预览区常驻挂载（display:none 隐藏），
  // 但浏览器会把隐藏元素的 scrollTop 归零；切换回来时显式把视图恢复到光标处——
  // 编辑器滚到光标所在行、预览对齐光标所在行（scrollToLine 走待定机制，隐藏后自愈）。
  useEffect(() => {
    if (!currentFile) return
    if (mode !== 'preview') {
      // 编辑器可见：滚动到光标（光标在 state 内未丢，视口被归零）
      editorScrollRef.current?.scrollToCursor()
    }
    if (mode !== 'edit') {
      // 预览可见：对齐到光标所在行
      previewScrollRef.current?.scrollToLine(editorScrollRef.current?.getCursorLine() ?? 1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

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
      {compare ? (
        // 5.4 对比模式：全屏只读分屏 diff，editor__bar（分屏/编辑/预览/保存等）全部隐藏（用户定案）
        <DiffView
          left={compare.left}
          right={compare.right}
          leftLabel={compare.leftLabel}
          rightLabel={compare.rightLabel}
        />
      ) : isTerminal || currentFile ? (
        <>
          {/* 7.2 标签栏（编辑器上方一行；对比模式不显示） */}
          <TabBar
            editor={editor}
            onCloseRequest={(key) => setCloseQueue([key])}
            onBatchClose={startBatchClose}
          />

          {/* 活动工具条：terminal 隐藏三态按钮 + 保存区（D4），保留标题 + 专注入口；file 保持现状 */}
          {isTerminal ? (
            <div className="editor__bar">
              <span className="editor__file" title={`${activeTab.title}（${activeTab.cwdRelPath}）`}>
                {activeTab.title} — 终端
              </span>
              <button
                type="button"
                className="editor__focus"
                onClick={onToggleFocus}
                title="专注模式 (F11)"
                aria-label="专注模式"
              >
                <ExpandIcon width={16} height={16} />
              </button>
            </div>
          ) : (
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
                <ExpandIcon width={16} height={16} />
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
          )}

          {/* 内容区 grid 层叠（CC-3 根治：终端 cell 尺寸恒常、xterm 渲染服务不失效，
              fit 不受切换时序影响——一并消除「切回灰屏 / 长文本左移 / 非专注不占满」；
              file 内容在 terminal 激活时卸载，terminal 面板常驻以 visibility 切换显隐（D12）） */}
          <div className="editor__content">
            {!isTerminal && currentFile && (
              <div className="editor__content-cell editor__content-cell--file">
                <div className="editor__body" ref={bodyRef}>
                  {/* 9.2.7 编辑区常驻挂载：三态切换不卸载，保留光标/滚动；preview 模式 CSS 隐藏 */}
                  <div
                    className={`editor__pane editor__pane--edit${mode === 'preview' ? ' editor__pane--hidden' : ''}`}
                    style={mode === 'split' ? { flex: `0 0 ${ratio}%` } : { flex: '1 1 100%' }}
                  >
                    <CodeMirrorEditor
                      ref={editorScrollRef}
                      value={content}
                      onChange={setContent}
                      theme={theme}
                      baseDir={baseDir}
                      onTopLineChange={mode === 'split' ? handleEditorTopLine : undefined}
                      onCursorLineChange={mode === 'split' ? handleEditorCursorLine : undefined}
                    />
                  </div>
                  {mode === 'split' && (
                    <div
                      className="editor__divider"
                      onMouseDown={onDividerDown}
                      role="separator"
                      aria-orientation="vertical"
                      title="拖拽调整分屏比例"
                    />
                  )}
                  {/* 9.2.7 预览区常驻挂载：保留滚动位置；edit 模式 CSS 隐藏 */}
                  <div
                    className={`editor__pane editor__pane--preview${mode === 'edit' ? ' editor__pane--hidden' : ''}`}
                    style={mode === 'preview' ? { flex: '1 1 100%' } : { flex: '1 1 0' }}
                  >
                    <PreviewPane
                      ref={previewScrollRef}
                      content={content}
                      isMarkdown={isMarkdown}
                      baseDir={baseDir}
                      onTopLineChange={mode === 'split' ? handlePreviewTopLine : undefined}
                    />
                  </div>
                </div>
              </div>
            )}
            {terminalTabs.map((tab) => (
              <div
                key={tab.key}
                className="editor__content-cell"
                style={{ visibility: tab.key === activeKey ? 'visible' : 'hidden' }}
              >
                <TerminalPane
                  termId={tab.termId}
                  title={tab.title}
                  cwdRelPath={tab.cwdRelPath}
                  active={tab.key === activeKey}
                  theme={theme}
                  fontSize={fontSize}
                  exited={tab.exited}
                  exitCode={tab.exitCode}
                  onExit={(code) => editor.markTerminalExited(tab.key, code)}
                  onReopen={() => editor.reopenTerminalTab(tab.key)}
                />
              </div>
            ))}
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

      {/* 7.3 关闭流程覆盖确认（磁盘被外部修改时，确认后强制保存并关闭） */}
      {closeExternalConfirm && (
        <ConfirmDialog
          title="保存覆盖提示"
          message="磁盘中的文件已被外部修改。"
          warning="保存将覆盖外部改动并关闭标签，是否继续？"
          confirmLabel="覆盖保存"
          confirmDanger={false}
          onConfirm={handleCloseOverwrite}
          onCancel={() => setCloseExternalConfirm(null)}
        />
      )}

      {/* 7.2 关闭未保存标签三选（7.3 细化外部改动检测；9.2.2 批量逐个弹） */}
      {closeTarget && (
        <ConfirmDialog
          title="关闭标签"
          message={`「${fileNameOf(closeTarget)}」有未保存的修改。`}
          warning="保存将保留修改并关闭标签；放弃将丢弃未保存内容。"
          confirmLabel="保存"
          confirmDanger={false}
          altLabel="放弃"
          altDanger
          onConfirm={handleCloseSave}
          onAlt={handleCloseDiscard}
          onCancel={() => setCloseQueue([])} // 取消：中止批量，保留未保存标签
        />
      )}

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
