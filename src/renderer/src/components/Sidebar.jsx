// 侧边栏（布局定案 2026-08-09）
// 顶部：当前工作区（路径 + 切换菜单）；下方：文件列表区（3.1：极简图标一键展开/收回，
// 顶层 MD/TXT 列表 + 点击打开；阶段 4 替换为完整目录树）。
// 工作区路径在此显示，顶栏不再承载工作区信息。
import { useState } from 'react'

const DOC_EXT = /\.(md|txt)$/i

export default function Sidebar({ workspace, editor }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false) // 文件列表展开/收回
  const [files, setFiles] = useState(null)
  const [listError, setListError] = useState(null)
  const [listLoading, setListLoading] = useState(false)

  /** 切换工作区：未保存内容先在旧边界下落盘，再取消激活、激活新路径，最后关闭编辑器（新工作区文件不同）。 */
  async function switchWorkspace(absPath) {
    if (editor.dirty) await editor.save() // 尽力落盘，防切换丢失
    await workspace.deactivate()
    const res = await workspace.activate(absPath)
    editor.close()
    return res
  }

  async function handleSwitch(absPath) {
    setMenuOpen(false)
    // 切换工作区：先取消激活当前（清空 fs 边界），再激活新路径。
    // activate 失败时 store 已自行回引导态并保留错误（评审 P1），无需额外兜底。
    await switchWorkspace(absPath)
  }

  async function handleChooseNew() {
    setMenuOpen(false)
    const absPath = await window.mework.fs.chooseDirectory()
    if (!absPath) return
    await switchWorkspace(absPath)
  }

  /** 展开时加载顶层 MD/TXT；收回状态不持有数据 */
  async function loadFiles() {
    setListLoading(true)
    setListError(null)
    try {
      const entries = await window.mework.fs.listDirectory('.')
      setFiles(entries.filter((n) => DOC_EXT.test(n)))
    } catch (err) {
      setListError(String(err?.message ?? err))
    } finally {
      setListLoading(false)
    }
  }

  function toggleList() {
    const next = !listOpen
    if (next) loadFiles()
    setListOpen(next)
  }

  return (
    <aside className="sidebar">
      {/* 工作区区（侧边栏顶部） */}
      <div className="sidebar__workspace">
        <button
          type="button"
          className="sidebar__ws-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          title={workspace.activePath ?? '未选择工作区'}
        >
          <span className="sidebar__ws-name" title={workspace.activePath ?? ''}>
            {workspace.activePath ?? '未选择工作区'}
          </span>
          <span className="sidebar__ws-caret" aria-hidden="true">
            ▾
          </span>
        </button>

        {menuOpen && (
          <div className="sidebar__menu">
            <p className="sidebar__menu-label">最近使用</p>
            {workspace.recent.length === 0 && <p className="sidebar__menu-empty">暂无工作区</p>}
            {workspace.recent.map((p) => {
              const isActive = p === workspace.activePath
              return (
                <div key={p} className="sidebar__menu-row">
                  <button
                    type="button"
                    className={`sidebar__menu-item${isActive ? ' sidebar__menu-item--active' : ''}`}
                    onClick={() => {
                      if (!isActive) handleSwitch(p)
                    }}
                    title={p}
                  >
                    {p}
                    {isActive && <span className="sidebar__menu-current">当前</span>}
                  </button>
                  <button
                    type="button"
                    className="sidebar__menu-remove"
                    onClick={() => workspace.removeFromRecent(p)}
                    title="从最近列表移除"
                    aria-label={`移除 ${p}`}
                  >
                    ✕
                  </button>
                </div>
              )
            })}
            <div className="sidebar__menu-sep" />
            <button type="button" className="sidebar__menu-item" onClick={handleChooseNew}>
              ＋ 更换工作区…
            </button>
          </div>
        )}
      </div>

      {/* 文件列表区（阶段 4：递归目录树） */}
      <div className="sidebar__tree" aria-label="文件列表">
        <button
          type="button"
          className={`sidebar__tree-toggle${listOpen ? ' sidebar__tree-toggle--open' : ''}`}
          onClick={toggleList}
          aria-expanded={listOpen}
          title={listOpen ? '收回文件列表' : '展开文件列表'}
        >
          {/* 极简线性列表图标（类 SF Symbols） */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="2" y1="3.5" x2="14" y2="3.5" />
            <line x1="2" y1="8" x2="14" y2="8" />
            <line x1="2" y1="12.5" x2="14" y2="12.5" />
          </svg>
        </button>

        {listOpen && (
          <div className="sidebar__filelist">
            {listError && <p className="sidebar__filelist-empty">{listError}</p>}
            {!listError && listLoading && <p className="sidebar__filelist-empty">加载中…</p>}
            {!listError && !listLoading && files && files.length === 0 && (
              <p className="sidebar__filelist-empty">无 MD / TXT 文件</p>
            )}
            {!listError && files && files.length > 0 && (
              <ul className="sidebar__filelist-ul">
                {files.map((f) => (
                  <li key={f}>
                    <button
                      type="button"
                      className={`sidebar__filelist-item${
                        editor.currentFile === f ? ' sidebar__filelist-item--active' : ''
                      }`}
                      onClick={() => editor.openFile(f)}
                      title={f}
                    >
                      {f}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
