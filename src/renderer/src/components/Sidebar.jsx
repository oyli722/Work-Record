// 侧边栏（布局定案 2026-08-09）
// 顶部：当前工作区（路径 + 切换菜单）；下方：目录树最小形态（3.1 交互定案——
// 极简文件夹图标置树区顶部、默认收起一键展开/收回；展示嵌套子文件夹，点击整行展开/关闭，
// 懒加载子级；文件节点点击打开）。阶段 4 在此演进为完整目录树 CRUD。
// 工作区路径在此显示，顶栏不再承载工作区信息。
import { useEffect, useRef, useState } from 'react'
import FileTree, { FolderIcon, InlineInput } from './FileTree'
import ContextMenu from './ContextMenu'
import ConfirmDialog from './ConfirmDialog'
import VersionPanel from './VersionPanel'
import { CloseIcon } from './icons'

const DOC_EXT = /\.(md|txt)$/i

// 8.3 侧边栏拖拽调宽：宽度范围 + 默认（--sidebar-width 驱动 grid 列）
const SIDEBAR_MIN = 160
const SIDEBAR_MAX = 400
const SIDEBAR_DEFAULT = 240

/** 相对路径的目录部分（工作区内，'/' 分隔） */
function dirOf(relPath) {
  const i = relPath.lastIndexOf('/')
  return i === -1 ? '' : relPath.slice(0, i)
}

export default function Sidebar({
  workspace,
  editor,
  tree,
  setTree,
  listOpen,
  setListOpen,
  listError,
  setListError,
  listLoading,
  setListLoading,
  onCompareChange
}) {
  // 目录树状态（tree/listOpen/listError/listLoading）由 App 持有（3.8 评审 P1 状态提升），
  // 专注模式主/浮层 Sidebar 共享，进出专注不丢失；menuOpen 为临时下拉，保留组件内部。
  const [menuOpen, setMenuOpen] = useState(false)

  // 8.3 侧边栏拖拽调宽：宽度经 --sidebar-width 变量驱动 grid 列，持久化 localStorage
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const w = Number(localStorage.getItem('mework.sidebarWidth'))
      return w >= SIDEBAR_MIN && w <= SIDEBAR_MAX ? w : SIDEBAR_DEFAULT
    } catch {
      return SIDEBAR_DEFAULT
    }
  })
  const resizeRef = useRef(null) // { startX, startWidth }

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${sidebarWidth}px`)
    try {
      localStorage.setItem('mework.sidebarWidth', String(sidebarWidth))
    } catch {
      /* 静默 */
    }
  }, [sidebarWidth])

  function onResizeDown(e) {
    e.preventDefault()
    resizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }
    window.addEventListener('mousemove', onResizeMove)
    window.addEventListener('mouseup', onResizeUp)
  }
  function onResizeMove(e) {
    const drag = resizeRef.current
    if (!drag) return
    const next = Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, drag.startWidth + (e.clientX - drag.startX)))
    setSidebarWidth(next)
  }
  function onResizeUp() {
    resizeRef.current = null
    window.removeEventListener('mousemove', onResizeMove)
    window.removeEventListener('mouseup', onResizeUp)
  }
  // 4.2 目录树右键菜单（阶段 4 CRUD 唯一入口，用户定案）+ 新建中的内联输入
  const [contextMenu, setContextMenu] = useState(null) // { x, y, items }
  const [creating, setCreating] = useState(null) // { parentRelPath, type: 'file' | 'folder' }
  const [renaming, setRenaming] = useState(null) // 重命名中的节点（4.3）
  const [deleteTarget, setDeleteTarget] = useState(null) // 待删除二次确认的节点（4.4）
  const [deleteEmpty, setDeleteEmpty] = useState(true) // 删除目标是否为空文件夹（评审 S1）
  const [versionPanelFor, setVersionPanelFor] = useState(null) // 打开版本历史面板的文件（5.3）

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

  /** 将目录项构造成树节点：文件夹全保留、文件只留 MD/TXT；目录在前、文件在后，各按名称排序。
      items 来自 fs:list_detail（[{ name, isDirectory }]，4.1），已含类型，无需再逐项 stat。 */
  function buildNodes(items, parentPath) {
    const nodes = []
    for (const item of items) {
      if (!item.isDirectory && !DOC_EXT.test(item.name)) continue
      nodes.push({
        name: item.name,
        relPath: parentPath ? `${parentPath}/${item.name}` : item.name,
        isDir: item.isDirectory,
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

  /** 不可变更新目录树中指定节点（4.1，评审 S2：不再直接 mutate 节点对象） */
  function updateNode(nodes, relPath, updater) {
    return nodes.map((n) => {
      if (n.relPath === relPath) return updater(n)
      if (n.children) return { ...n, children: updateNode(n.children, relPath, updater) }
      return n
    })
  }

  /** 加载根层节点（首次展开时） */
  async function loadRoot() {
    setListLoading(true)
    setListError(null)
    try {
      const items = await window.mework.fs.listDetail('.')
      setTree(buildNodes(items, ''))
    } catch (err) {
      setListError(String(err?.message ?? err))
    } finally {
      setListLoading(false)
    }
  }

  /** 展开/关闭文件夹节点（懒加载子级；关闭时释放子数据保持新鲜；不可变更新） */
  async function toggleFolder(node) {
    if (node.expanded) {
      setTree((t) => updateNode(t, node.relPath, (n) => ({ ...n, expanded: false, children: null })))
      return
    }
    setTree((t) => updateNode(t, node.relPath, (n) => ({ ...n, loading: true })))
    try {
      const items = await window.mework.fs.listDetail(node.relPath)
      const children = buildNodes(items, node.relPath)
      setTree((t) =>
        updateNode(t, node.relPath, (n) => ({ ...n, expanded: true, loading: false, children, error: null }))
      )
    } catch (err) {
      setTree((t) =>
        updateNode(t, node.relPath, (n) => ({ ...n, loading: false, error: String(err?.message ?? err) }))
      )
    }
  }

  function toggleList() {
    const next = !listOpen
    if (next && !tree && !listLoading) loadRoot()
    setListOpen(next)
  }

  /** 右键打开菜单（阶段 4 入口）：工作区未激活 / 空菜单（如 4.2 文件节点暂无操作）不弹 */
  function openMenu(e, items) {
    e.preventDefault()
    e.stopPropagation()
    if (workspace.state !== 'active' || !items?.length) return
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  /** 生成不冲突的最终名（同目录重名自动加序号，如「未命名 2.md」） */
  async function uniqueName(parentRelPath, name) {
    const items = await window.mework.fs.listDetail(parentRelPath || '.') // 根目录用 '.'（空路径被 pathGuard 拒绝）
    const existing = new Set(items.map((i) => i.name))
    if (!existing.has(name)) return name
    const dot = name.lastIndexOf('.')
    const stem = dot > 0 ? name.slice(0, dot) : name
    const ext = dot > 0 ? name.slice(dot) : ''
    let i = 2
    while (existing.has(`${stem} ${i}${ext}`)) i += 1
    return `${stem} ${i}${ext}`
  }

  /** 开始新建：目标文件夹未展开则先展开加载，再进入内联输入 */
  async function startCreate(parentRelPath, type) {
    setContextMenu(null)
    setCreating(null)
    if (parentRelPath !== '') {
      setTree((t) => updateNode(t, parentRelPath, (n) => ({ ...n, expanded: true, loading: true })))
      try {
        const items = await window.mework.fs.listDetail(parentRelPath)
        const children = buildNodes(items, parentRelPath)
        setTree((t) => updateNode(t, parentRelPath, (n) => ({ ...n, loading: false, children, error: null })))
      } catch (err) {
        setTree((t) =>
          updateNode(t, parentRelPath, (n) => ({ ...n, loading: false, error: String(err?.message ?? err) }))
        )
      }
    }
    setCreating({ parentRelPath, type })
  }

  /** 提交新建：MD 空文件（自动打开编辑）/ 文件夹；冲突自动序号；刷新父目录（PRD §4.3.3） */
  async function submitCreate(rawName) {
    const { parentRelPath, type } = creating
    setCreating(null)
    const name = rawName.trim().replace(/[/\\]/g, '-') // 去除路径分隔符，防嵌套
    if (!name) return
    try {
      const finalName = await uniqueName(parentRelPath, name)
      const relPath = parentRelPath ? `${parentRelPath}/${finalName}` : finalName
      if (type === 'folder') {
        await window.mework.fs.mkdir(relPath)
      } else {
        await window.mework.fs.writeFile(relPath, '') // 空文件（用户定案）
        await editor.openFile(relPath) // 新建 MD 自动打开（用户定案）
      }
      await refreshParent(parentRelPath)
    } catch (err) {
      setListError(String(err?.message ?? err))
    }
  }

  function cancelCreate() {
    setCreating(null)
  }

  /** 开始重命名（4.3）：节点行转内联输入 */
  function startRename(node) {
    setContextMenu(null)
    setRenaming(node)
  }

  /** 提交重命名：文件/文件夹 + 版本库前缀迁移（PRD §4.3.4）；打开中文件同步新路径 */
  async function submitRename(rawName) {
    const node = renaming
    setRenaming(null)
    const newName = rawName.trim().replace(/[/\\]/g, '-')
    if (!newName || newName === node.name) return
    const parentRelPath = dirOf(node.relPath)
    const newRelPath = parentRelPath ? `${parentRelPath}/${newName}` : newName
    // 评审 P3：目标已存在则拒绝（POSIX/macOS 下 rename 会静默覆盖已存在文件，数据安全）
    let targetExists = false
    try {
      targetExists = (await window.mework.fs.stat(newRelPath)).exists
    } catch {
      targetExists = false // 目标不存在（ENOENT），允许重命名
    }
    if (targetExists) {
      setListError(`已存在同名目标「${newName}」，重命名已取消。`)
      return
    }
    try {
      await window.mework.fs.renameWithVersions(node.relPath, newRelPath)
      editor.renameCurrentFile(node.relPath, newRelPath) // 打开中的文件同步新路径，避免保存到旧路径
      await refreshParent(parentRelPath)
    } catch (err) {
      setListError(String(err?.message ?? err))
    }
  }

  function cancelRename() {
    setRenaming(null)
  }

  /** 开始删除（4.4）：弹出二次确认；区分空/非空文件夹警告（评审 S1） */
  async function startDelete(node) {
    setContextMenu(null)
    setDeleteTarget(node)
    if (node.isDir) {
      try {
        const items = await window.mework.fs.listDetail(node.relPath)
        setDeleteEmpty(items.length === 0)
      } catch {
        setDeleteEmpty(false)
      }
    } else {
      setDeleteEmpty(true) // 文件无递归警告
    }
  }

  /** 确认删除：文件/文件夹 + 版本库清空（PRD §4.3.5）；打开中文件被删则关闭 */
  async function confirmDelete() {
    const node = deleteTarget
    setDeleteTarget(null)
    const parentRelPath = dirOf(node.relPath)
    try {
      await window.mework.fs.deleteWithVersions(node.relPath)
      editor.closeIfPathDeleted(node.relPath)
      await refreshParent(parentRelPath)
    } catch (err) {
      setListError(String(err?.message ?? err))
    }
  }

  function cancelDelete() {
    setDeleteTarget(null)
  }

  /** 打开版本历史面板（5.3，PRD §4.5.4） */
  function openVersionPanel(node) {
    setContextMenu(null)
    setVersionPanelFor(node.relPath)
  }

  /** 刷新目标目录的子树（新建/后续 CRUD 后调用） */
  async function refreshParent(parentRelPath) {
    if (parentRelPath === '') {
      await loadRoot()
      return
    }
    try {
      const items = await window.mework.fs.listDetail(parentRelPath)
      const children = buildNodes(items, parentRelPath)
      setTree((t) =>
        updateNode(t, parentRelPath, (n) => ({ ...n, children, expanded: true, loading: false, error: null }))
      )
    } catch (err) {
      setListError(String(err?.message ?? err))
    }
  }

  /** 递归刷新目录树（保留展开状态，感知外部改动；4.5，PRD §4.3.6）。
      磁盘中已删除的节点移除、新增的项追加；已展开的文件夹递归刷新子级。 */
  async function refreshTreeNodes(nodes, parentRelPath) {
    const items = await window.mework.fs.listDetail(parentRelPath || '.') // 根目录用 '.'
    const diskByName = new Map(items.map((i) => [i.name, i]))
    const existing = new Set(nodes.map((n) => n.name))
    const next = []
    for (const node of nodes) {
      const disk = diskByName.get(node.name)
      if (!disk) continue // 磁盘已删除该节点
      if (node.isDir && node.expanded) {
        const children = node.children ? await refreshTreeNodes(node.children, node.relPath) : null
        next.push({ ...node, children, error: null }) // 保留展开
      } else {
        next.push({ ...node, isDir: disk.isDirectory })
      }
    }
    for (const item of items) {
      if (existing.has(item.name)) continue
      if (!item.isDirectory && !DOC_EXT.test(item.name)) continue
      next.push({
        name: item.name,
        relPath: parentRelPath ? `${parentRelPath}/${item.name}` : item.name,
        isDir: item.isDirectory,
        expanded: false,
        loading: false,
        error: null,
        children: null
      })
    }
    return next.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name, 'zh')
    })
  }

  /** 刷新整个目录树（保留展开状态） */
  async function refreshTree() {
    if (!tree) {
      await loadRoot()
      return
    }
    try {
      setTree(await refreshTreeNodes(tree, ''))
    } catch (err) {
      setListError(String(err?.message ?? err))
    }
  }

  /** 刷新指定文件夹子树 */
  async function refreshBranch(node) {
    try {
      const children = await refreshTreeNodes(node.children ?? [], node.relPath)
      setTree((t) =>
        updateNode(t, node.relPath, (n) => ({ ...n, children, expanded: true, loading: false, error: null }))
      )
    } catch (err) {
      setListError(String(err?.message ?? err))
    }
  }

  return (
    <aside className="sidebar">
      {/* 8.3 右缘拖拽调宽 */}
      <div className="sidebar__resizer" onMouseDown={onResizeDown} title="拖拽调整侧边栏宽度" />
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
                    <CloseIcon width={12} height={12} />
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
          onContextMenu={(e) =>
            openMenu(e, [
              { label: '新建 MD 文件', onClick: () => startCreate('', 'file') },
              { label: '新建文件夹', onClick: () => startCreate('', 'folder') },
              { label: '刷新', onClick: () => refreshTree() } // 4.5：感知外部改动
            ])
          }
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
          {/* 极简文件夹图标：收起=闭合、展开=打开；右键=新建菜单（4.2） */}
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
              <>
                {/* 根级新建输入行（右键顶部文件夹图标触发） */}
                {creating?.parentRelPath === '' && (
                  <div className="filetree__create-row filetree__create-row--root">
                    <InlineInput
                      defaultValue={creating.type === 'folder' ? '新建文件夹' : '未命名.md'}
                      onSubmit={submitCreate}
                      onCancel={cancelCreate}
                    />
                  </div>
                )}
                <FileTree
                  nodes={tree}
                  editor={editor}
                  onToggle={toggleFolder}
                  onContextMenu={(e, node) =>
                    openMenu(
                      e,
                      node.isDir
                        ? [
                            { label: '新建 MD 文件', onClick: () => startCreate(node.relPath, 'file') },
                            { label: '新建文件夹', onClick: () => startCreate(node.relPath, 'folder') },
                            { label: '重命名', onClick: () => startRename(node) },
                            { label: '删除', danger: true, onClick: () => startDelete(node) },
                            { label: '刷新', onClick: () => refreshBranch(node) } // 4.5
                          ]
                        : [
                            { label: '版本历史', onClick: () => openVersionPanel(node) },
                            { label: '重命名', onClick: () => startRename(node) },
                            { label: '删除', danger: true, onClick: () => startDelete(node) }
                          ]
                    )
                  }
                  creating={creating}
                  onSubmitCreate={submitCreate}
                  onCancelCreate={cancelCreate}
                  renaming={renaming}
                  onSubmitRename={submitRename}
                  onCancelRename={cancelRename}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* 右键菜单（阶段 4 CRUD 唯一入口） */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* 版本历史面板（5.3/5.4：选中版本触发主区对比） */}
      {versionPanelFor && (
        <VersionPanel
          relPath={versionPanelFor}
          editor={editor}
          onCompareChange={onCompareChange}
          onClose={() => setVersionPanelFor(null)}
        />
      )}

      {/* 删除二次确认（4.4，PRD §4.3.5） */}
      {deleteTarget && (
        <ConfirmDialog
          title={deleteTarget.isDir ? '删除文件夹' : '删除文件'}
          message={`确定删除「${deleteTarget.name}」？此操作不可恢复。`}
          warning={
            deleteTarget.isDir
              ? deleteEmpty
                ? '该文件夹的版本历史将一并清空。'
                : '该文件夹包含内容，将递归删除其中所有文件，版本历史一并清空。'
              : '该文件的版本历史将一并清空。'
          }
          confirmLabel="删除"
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </aside>
  )
}
