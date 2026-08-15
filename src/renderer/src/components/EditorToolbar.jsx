// 主区工具条小组件（OPT-3c：从 EditorPane 拆分——原文件/终端两套近重复 JSX）
// ModeSwitch：三态切换（分屏/编辑/预览）按钮组
// FileToolbar：文件工具条（文件名 + 三态 + 专注入口 + 保存状态 + 保存按钮）
// TerminalToolbar：终端工具条（标题 + 专注入口；D4 隐藏三态按钮与保存区）
import { ExpandIcon } from './icons'

/** 三态切换按钮组（分屏 / 编辑 / 预览） */
export function ModeSwitch({ mode, onModeChange }) {
  const btn = (m, label) => (
    <button
      type="button"
      className={`editor__mode${mode === m ? ' editor__mode--active' : ''}`}
      onClick={() => onModeChange(m)}
      title={`${label}模式`}
    >
      {label}
    </button>
  )
  return (
    <div className="editor__modes" role="group" aria-label="编辑器模式">
      {btn('split', '分屏')}
      {btn('edit', '编辑')}
      {btn('preview', '预览')}
    </div>
  )
}

/** 文件工具条（活动 file 标签） */
export function FileToolbar({
  currentFile,
  dirty,
  saveState,
  externalChange,
  onSave,
  onToggleFocus,
  mode,
  onModeChange
}) {
  return (
    <div className="editor__bar">
      <span className="editor__file" title={currentFile}>
        {currentFile}
      </span>
      <ModeSwitch mode={mode} onModeChange={onModeChange} />
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
        onClick={onSave}
        disabled={saveState === 'saving' || !dirty}
      >
        保存
      </button>
    </div>
  )
}

/** 终端工具条（活动 terminal 标签；D4 隐藏三态按钮与保存区，保留标题 + 专注入口） */
export function TerminalToolbar({ title, cwdRelPath, onToggleFocus }) {
  return (
    <div className="editor__bar">
      <span className="editor__file" title={`${title}（${cwdRelPath}）`}>
        {title} — 终端
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
  )
}
