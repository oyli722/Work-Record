// 主区编辑器（阶段 3.1 占位：数据层闭环验证用）
// 极简工具条（文件名 + 保存状态 + 保存按钮）+ 受控 textarea（可编辑）。
// CodeMirror 编辑区与三态布局随 3.2 落地；自动保存 / Ctrl+S 体系随 3.3。
export default function EditorPane({ editor }) {
  const { currentFile, content, saveState, dirty, error, loading, setContent, save } = editor

  return (
    <div className="editor">
      {currentFile ? (
        <>
          <div className="editor__bar">
            <span className="editor__file" title={currentFile}>
              {currentFile}
            </span>
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
          <textarea
            className="editor__area"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
            placeholder="开始记录…"
            autoFocus // 打开文件后自动聚焦（评审 S4；3.2 CodeMirror 接管）
          />
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
