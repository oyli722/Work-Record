// 侧边栏（布局定案 2026-08-09）
// 顶部：当前工作区（路径 + 切换菜单）；下方：目录树最小形态（3.1 交互定案——
// 极简文件夹图标置树区顶部、默认收起一键展开/收回；展示嵌套子文件夹，点击整行展开/关闭，
// 懒加载子级；文件节点点击打开）。阶段 4 在此演进为完整目录树 CRUD。
// 工作区路径在此显示，顶栏不再承载工作区信息。
import { useState } from 'react'
import FileTree, { FolderIcon } from './FileTree'

const DOC_EXT = /\.(md|txt)$/i

export default function Sidebar({ workspace, editor }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [listOpen, setListOpen] = useState(false) // 目录树展开/收回
  const [tree, setTree] = useState(null) // 顶层节点数组
  const [listError, setListError] = useState(null)
  const [listLoading, setListLoading] = useState(false)

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

  /**
   * 切换工作区。
   * 未保存内容先保存；保存失败则中止切换、保留现场（PRD §4.1.6，评审 P3）。
   * 成功激活后清空并收起目录树，重新展开时加载新工作区内容（不残留旧数据，评审 P2）。
   */
  async function switchWorkspace(absPath) {
    if (editor.dirty) {
      const r = await editor.save()
      if (!r.ok) return r // 中止切换，error 已由 store 置入，主区显示
    }
    await workspace.deactivate()
    const res = await workspace.activate(absPath)
    editor.close()
    if (res.ok) {
      setTree(null)
      setListError(null)
      setListOpen(false)
    }
    return res
  }

  /** 将目录项构造成树节点：文件夹全保留、文件只留 MD/TXT；目录在前、文件在后，各按名称排序 */
  async function buildNodes(entries, parentPath) {
    const nodes = []
    for (const name of entries) {
      const relPath = parentPath ? `${parentPath}/${name}` : name
      let info
      try {
        info = await window.mework.fs.stat(relPath)
      } catch {
        continue // 无法 stat（并发删除等）跳过
      }
      if (!info.isDirectory && !DOC_EXT.test(name)) continue
      nodes.push({
        name,
        relPath,
        isDir: info.isDirectory,
        expanded: false,
        loading: false,
        error: null,
        children: null
      })
    }
    return nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name, 'zh')
    })
  }

  /** 加载根层节点（首次展开时） */
  async function loadRoot() {
    setListLoading(true)
    setListError(null)
    try {
      const entries = await window.mework.fs.listDirectory('.')
      setTree(await buildNodes(entries, ''))
    } catch (err) {
      setListError(String(err?.message ?? err))
    } finally {
      setListLoading(false)
    }
  }

  /** 展开/关闭文件夹节点（懒加载子级；关闭时释放子数据保持新鲜） */
  async function toggleFolder(node) {
    if (node.expanded) {
      node.expanded = false
      node.children = null
    } else {
      node.expanded = true
      node.loading = true
      setTree([...tree]) // 先渲染加载态
      try {
        const entries = await window.mework.fs.listDirectory(node.relPath)
        node.children = await buildNodes(entries, node.relPath)
      } catch (err) {
        node.error = String(err?.message ?? err)
      } finally {
        node.loading = false
      }
    }
    setTree([...tree])
  }

  function toggleList() {
    const next = !listOpen
    if (next && !tree && !listLoading) loadRoot()
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

      {/* 目录树区（阶段 4：完整目录树 CRUD） */}
      <div className="sidebar__tree" aria-label="文件列表">
        <button
          type="button"
          className={`sidebar__tree-toggle${listOpen ? ' sidebar__tree-toggle--open' : ''}`}
          onClick={toggleList}
          aria-expanded={listOpen}
          disabled={workspace.state !== 'active'} // 无工作区时禁用（评审 S3）
          title={
            workspace.state !== 'active'
              ? '先选择工作区'
              : listOpen
                ? '收回文件列表'
                : '展开文件列表'
          }
        >
          {/* 极简文件夹图标：收起=闭合、展开=打开 */}
          <FolderIcon open={listOpen} />
        </button>

        {listOpen && (
          <div className="sidebar__tree-body">
            {listError && <p className="filetree__status filetree__status--error">{listError}</p>}
            {!listError && listLoading && <p className="filetree__status">加载中…</p>}
            {!listError && !listLoading && tree && tree.length === 0 && (
              <p className="filetree__status">工作区为空</p>
            )}
            {!listError && !listLoading && tree && tree.length > 0 && (
              <FileTree nodes={tree} editor={editor} onToggle={toggleFolder} />
            )}
          </div>
        )}
      </div>
    </aside>
  )
}
