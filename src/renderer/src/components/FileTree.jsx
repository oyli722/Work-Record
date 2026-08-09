// 目录树（阶段 3.1 最小形态 + 阶段 4 演进：右键菜单入口 + 内联新建/重命名）
// 文件夹节点：点击整行展开/关闭子内容（懒加载，展开时才读子级）；
// 文件节点：点击打开到编辑器。图标为 Lucide 风格线性描边（PRD §3.4.4）。
// 4.2 新建 / 4.3 重命名：右键菜单触发，目标位置渲染 InlineInput（内联输入，用户定案）。

import { useEffect, useRef, useState } from 'react'

export function FolderIcon({ open = false }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="filetree__icon"
    >
      {open ? (
        <path d="m6 14 1.45-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.55 6a2 2 0 0 1-1.94 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2" />
      ) : (
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      )}
    </svg>
  )
}

export function FileIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="filetree__icon"
    >
      <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
      <path d="M14 2v4a2 2 0 0 0 2 2h4" />
      <path d="M10 9H8" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
    </svg>
  )
}

// 内联输入行：新建（4.2）/ 重命名（4.3）共用。回车提交、Esc 取消、失焦提交（空值取消）。
export function InlineInput({ defaultValue, onSubmit, onCancel }) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  const commit = () => {
    const v = value.trim()
    if (v) onSubmit(v)
    else onCancel()
  }
  return (
    <input
      ref={inputRef}
      className="filetree__input"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') commit()
        else if (e.key === 'Escape') onCancel()
      }}
      onBlur={commit}
    />
  )
}

/**
 * 递归渲染目录树。
 * @param {Array<object>} nodes 节点数组（{ name, relPath, isDir, expanded, loading, error, children }）
 * @param {object} editor editorStore（用于文件高亮与打开）
 * @param {(node: object) => void} onToggle 文件夹展开/关闭回调
 * @param {(e: MouseEvent, node: object) => void} [onContextMenu] 节点右键菜单回调
 * @param {{parentRelPath: string, type: 'file'|'folder'}|null} creating 新建中的目标位置（渲染输入行）
 * @param {object|null} renaming 重命名中的节点（渲染输入行替代节点行）
 */
export default function FileTree({
  nodes,
  editor,
  onToggle,
  depth = 0,
  onContextMenu,
  creating,
  onSubmitCreate,
  onCancelCreate,
  renaming,
  onSubmitRename,
  onCancelRename
}) {
  // 重命名输入行（替换节点行，保持缩进）
  const renameRow = (node) => (
    <div className="filetree__create-row" style={{ paddingLeft: 8 + depth * 14 }}>
      <InlineInput
        defaultValue={node.name}
        onSubmit={onSubmitRename}
        onCancel={onCancelRename}
      />
    </div>
  )

  return (
    <ul className="filetree" role="tree">
      {nodes.map((node) => (
        <li
          key={node.relPath}
          role="treeitem"
          aria-expanded={node.isDir ? node.expanded : undefined}
        >
          {node.isDir ? (
            <>
              {renaming?.relPath === node.relPath ? (
                renameRow(node)
              ) : (
                <button
                  type="button"
                  className={`filetree__row${node.expanded ? ' filetree__row--open' : ''}`}
                  style={{ paddingLeft: 8 + depth * 14 }}
                  onClick={() => onToggle(node)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    onContextMenu?.(e, node)
                  }}
                  title={node.relPath}
                >
                  <span className="filetree__arrow" aria-hidden="true">
                    {node.expanded ? '▾' : '▸'}
                  </span>
                  <FolderIcon open={node.expanded} />
                  <span className="filetree__name">{node.name}</span>
                </button>
              )}
              {node.expanded &&
                (node.loading ? (
                  <p className="filetree__status">加载中…</p>
                ) : node.error ? (
                  <p className="filetree__status filetree__status--error">{node.error}</p>
                ) : (
                  node.children && (
                    <>
                      <FileTree
                        nodes={node.children}
                        editor={editor}
                        onToggle={onToggle}
                        depth={depth + 1}
                        onContextMenu={onContextMenu}
                        creating={creating}
                        onSubmitCreate={onSubmitCreate}
                        onCancelCreate={onCancelCreate}
                        renaming={renaming}
                        onSubmitRename={onSubmitRename}
                        onCancelRename={onCancelRename}
                      />
                      {creating?.parentRelPath === node.relPath && (
                        <li className="filetree__create-row">
                          <InlineInput
                            defaultValue={creating.type === 'folder' ? '新建文件夹' : '未命名.md'}
                            onSubmit={onSubmitCreate}
                            onCancel={onCancelCreate}
                          />
                        </li>
                      )}
                    </>
                  )
                ))}
            </>
          ) : renaming?.relPath === node.relPath ? (
            renameRow(node)
          ) : (
            <button
              type="button"
              className={`filetree__row${editor.currentFile === node.relPath ? ' filetree__row--active' : ''}`}
              style={{ paddingLeft: 8 + depth * 14 }}
              onClick={() => editor.openFile(node.relPath)}
              onContextMenu={
                onContextMenu
                  ? (e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      onContextMenu(e, node)
                    }
                  : undefined
              }
              title={node.relPath}
            >
              <span className="filetree__arrow filetree__arrow--spacer" aria-hidden="true">
                ▸
              </span>
              <FileIcon />
              <span className="filetree__name">{node.name}</span>
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
