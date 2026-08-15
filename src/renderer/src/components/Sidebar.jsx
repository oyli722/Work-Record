// 侧边栏（布局定案 2026-08-09）
// 顶部：当前工作区（路径 + 切换菜单）；下方：目录树（3.1 交互定案——
// 极简文件夹图标置树区顶部、默认收起一键展开/收回；展示嵌套子文件夹，点击整行展开/关闭，
// 懒加载子级；文件节点点击打开）。阶段 4 演进为完整目录树 CRUD。
// 工作区路径在此显示，顶栏不再承载工作区信息。
//
// OPT-3a：目录树数据与操作已拆分到 useFileTree hook（App 持有，专注模式主/浮层共享同一实例），
// 纯函数在 utils/file-tree.js（可单测）；本组件只做 UI 编排：
// 右键菜单 / 内联输入 / 弹窗 / 与 editor（打开文件、关闭受影响标签）联动 / 工作区切换。
import { useEffect, useRef, useState } from 'react'
import FileTree, { FolderIcon, InlineInput } from './FileTree'
import ContextMenu from './ContextMenu'
import ConfirmDialog from './ConfirmDialog'
import NewFileModal from './NewFileModal'
import VersionPanel from './VersionPanel'
import { CloseIcon } from './icons'
import { dirOf, fileNameOf } from '../utils/path'
import { registerAction, unregisterAction } from '../stores/actionRegistry'

// 8.3 侧边栏拖拽调宽：宽度范围 + 默认（--sidebar-width 驱动 grid 列）
const SIDEBAR_MIN = 160
const SIDEBAR_MAX = 400
const SIDEBAR_DEFAULT = 240

export default function Sidebar({ workspace, editor, fileTree, onCompareChange, terminalMenuEnabled }) {
  // fileTree（useFileTree，App 持有）：树数据与操作。3.8 评审 P1 状态提升——
  // 专注模式主/浮层 Sidebar 共享同一实例，进出专注不丢失。
  const {
    tree,
    listOpen,
    listError,
    listLoading,
    setListOpen,
    setListError,
    toggleList,
    toggleFolder,
    toggleFolderRecursive,
    refreshTree,
    refreshBranch,
    ensureFolderLoaded,
    createNode,
    renameNode,
    deleteNode,
    createFileDefault,
    reset
  } = fileTree

  // menuOpen 为临时下拉（工作区切换菜单），保留组件内部
  const [menuOpen, setMenuOpen] = useState(false)

  // CC-5 CLI 检测（设计 §3.5）：挂载探测一次并缓存；未安装 → 终端右键项置灰 + tooltip
  const [cliInfo, setCliInfo] = useState(null) // { installed, path, version? } | null（探测中/未探测）
  useEffect(() => {
    let cancelled = false
    window.mework.term
      .checkCli()
      .then((info) => {
        if (!cancelled) setCliInfo(info)
      })
      .catch(() => {
        if (!cancelled) setCliInfo({ installed: false })
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 9.2.1：菜单打开时点击外部 / Esc 关闭（右键弹菜单后需点击外部收起）
  useEffect(() => {
    if (!menuOpen) return
    function onDocMouseDown(e) {
      const el = e.target
      if (el?.closest?.('.sidebar__menu') || el?.closest?.('.sidebar__ws-btn')) return
      setMenuOpen(false)
    }
    function onKey(e) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocMouseDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocMouseDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

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
    const next = Math.min(
      SIDEBAR_MAX,
      Math.max(SIDEBAR_MIN, drag.startWidth + (e.clientX - drag.startX))
    )
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
  const [newFileModal, setNewFileModal] = useState(null) // 新建文件弹窗（9.2.8：{ relPath, name }）
  const [switchConfirm, setSwitchConfirm] = useState(null) // 切换工作区外部改动覆盖确认（P1）

  // 9.2.6 快捷键动作注册（OPT-3b：actionRegistry；useEffect 无依赖数组 → 每次渲染
  // 重新注册持最新闭包，卸载自动注销；目标为工作区根 / 当前打开文件，新建/重命名需工作区激活）
  useEffect(() => {
    registerAction('newFile', () => {
      if (workspace.state !== 'active') return
      startCreateFile('')
    })
    registerAction('newFolder', () => {
      if (workspace.state !== 'active') return
      startCreate('', 'folder')
    })
    registerAction('renameActive', () => {
      const relPath = editor.currentFile
      if (!relPath || workspace.state !== 'active') return
      const name = fileNameOf(relPath)
      setListOpen(true) // 树收起时先展开列表，保证重命名输入可见
      startRename({ relPath, name, isDir: false })
    })
    return () => {
      unregisterAction('newFile')
      unregisterAction('newFolder')
      unregisterAction('renameActive')
    }
  })

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
   * 未保存内容先保存（**全部标签**，非仅活动——修复 P1：原实现只保存活动标签，
   * 非活动脏标签会被 editor.close() 静默丢弃）；遇外部改动需用户确认覆盖（同设置页语义）。
   * 保存失败则中止切换、保留现场（PRD §4.1.6，评审 P3）。
   * 成功激活后清空并收起目录树，重新展开时加载新工作区内容（不残留旧数据，评审 P2）。
   */
  async function switchWorkspace(absPath) {
    const r = await editor.saveAll()
    if (r.externalChange) {
      setSwitchConfirm(absPath) // 有标签磁盘被外部修改：需确认覆盖后再切换
      return r
    }
    if (!r.ok) return r // 保存失败：中止切换，error 已由 store 置入，主区显示
    return doSwitch(absPath)
  }

  /** 确认覆盖外部改动后切换（P1：saveAll(true) 失败同样中止） */
  async function handleSwitchOverwrite() {
    const absPath = switchConfirm
    setSwitchConfirm(null)
    const r = await editor.saveAll(true) // 用户已确认：强制覆盖（跳过检测）
    if (!r.ok) return r // 覆盖保存失败：中止切换
    return doSwitch(absPath)
  }

  /** 实际切换：取消激活当前（清空 fs 边界）→ 激活新路径 → 关闭全部标签 → 重置目录树 */
  async function doSwitch(absPath) {
    await workspace.deactivate()
    const res = await workspace.activate(absPath)
    editor.close()
    if (res.ok) {
      reset() // 清空并收起目录树（评审 P2：不残留旧工作区数据）
    }
    return res
  }

  /** 右键打开菜单（阶段 4 入口）：工作区未激活 / 空菜单不弹 */
  function openMenu(e, items) {
    e.preventDefault()
    e.stopPropagation()
    if (workspace.state !== 'active' || !items?.length) return
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  /** 开始新建：目标文件夹未展开则先展开加载，再进入内联输入 */
  async function startCreate(parentRelPath, type) {
    setContextMenu(null)
    setCreating(null)
    if (parentRelPath === '') {
      // 根级新建：确保列表展开，输入行可见（列表收起或工作区为空时同样可新建）
      setListOpen(true)
    } else {
      await ensureFolderLoaded(parentRelPath)
    }
    setCreating({ parentRelPath, type })
  }

  /** 提交新建：空文件（自动打开编辑）/ 文件夹；冲突自动序号；刷新父目录（PRD §4.3.3） */
  async function submitCreate(rawName) {
    const { parentRelPath, type } = creating
    setCreating(null)
    const r = await createNode({ parentRelPath, type, rawName })
    if (!r.ok) return
    if (type !== 'folder') await editor.openFile(r.relPath) // 新建 MD 自动打开（用户定案）
  }

  function cancelCreate() {
    setCreating(null)
  }

  /** 9.2.8 新建文件（先建默认名再改，用户定案）：默认名建空文件 → 打开 → 弹窗改名 */
  async function startCreateFile(parentRelPath) {
    setContextMenu(null)
    const r = await createFileDefault(parentRelPath)
    if (!r.ok) return
    await editor.openFile(r.relPath) // 打开
    setNewFileModal({ relPath: r.relPath, name: r.name })
  }

  /** 9.2.8 提交新建文件改名（弹窗确定）：重命名 + 同步打开标签与树。重名预检拒绝（评审 P3 同款）。 */
  async function submitNewFileRename(rawName) {
    const { relPath } = newFileModal
    setNewFileModal(null)
    const newName = rawName.trim().replace(/[/\\]/g, '-')
    if (!newName) return // 空名：保留默认名
    const parentRelPath = dirOf(relPath)
    const oldName = fileNameOf(relPath)
    if (newName === oldName) return // 未改名
    const newRelPath = parentRelPath ? `${parentRelPath}/${newName}` : newName
    let targetExists = false
    try {
      targetExists = (await window.mework.fs.stat(newRelPath)).exists
    } catch {
      targetExists = false // 目标不存在（ENOENT）
    }
    if (targetExists) {
      setListError(`已存在同名「${newName}」，保留默认名「${oldName}」，可在右键菜单重命名。`)
      return
    }
    try {
      await window.mework.fs.renameWithVersions(relPath, newRelPath)
      editor.renameCurrentFile(relPath, newRelPath)
      await fileTree.refreshParent(parentRelPath)
    } catch (err) {
      setListError(String(err?.message ?? err))
    }
  }

  /** 9.2.8 在资源管理器中定位/打开：文件定位（showItemInFolder）、文件夹/工作区根打开（openPath）。 */
  async function revealInExplorer(node) {
    setContextMenu(null)
    const relPath = node ? node.relPath : '.'
    const isDir = node ? node.isDir : true
    try {
      const r = await window.mework.win.reveal(relPath, isDir)
      if (!r.ok) setListError(String(r.reason ?? '无法打开资源管理器'))
    } catch (err) {
      setListError(String(err?.message ?? err))
    }
  }

  /** CC-3 最小入口：在此打开 Claude Code 终端（设计 D2 顶层与任意分层文件夹右键）。失败经 setListError 提示。 */
  async function openTerminal(node) {
    setContextMenu(null)
    const cwdRelPath = node ? node.relPath : '.'
    const title = node ? node.name : '根目录'
    const r = await editor.openTerminalTab({ cwdRelPath, title })
    if (!r.ok) {
      setListError(
        r.reason === 'cli-missing' ? '未检测到 Claude Code CLI，无法打开终端' : String(r.reason ?? '终端打开失败')
      )
    }
  }

  /** CC-5 终端右键菜单项（D2）：设置开关开启才显示；CLI 未安装置灰 + tooltip（§3.5）。
      未探测完成（cliInfo 为 null）时保守置灰（探测为轻量 where，瞬时完成）。 */
  function terminalMenuItem(node) {
    if (!terminalMenuEnabled) return null
    const installed = cliInfo?.installed
    return {
      label: '在此打开 Claude Code 终端',
      onClick: () => openTerminal(node),
      disabled: !installed,
      title:
        cliInfo === null
          ? '正在检测 Claude Code CLI…'
          : installed
            ? undefined
            : '未检测到 Claude Code CLI'
    }
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
    const r = await renameNode(node, rawName)
    if (!r.ok) return
    if (r.relPath !== node.relPath) {
      editor.renameCurrentFile(node.relPath, r.relPath) // 打开中的文件同步新路径，避免保存到旧路径
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
    const r = await deleteNode(node)
    if (!r.ok) return
    editor.closeIfPathDeleted(node.relPath)
  }

  function cancelDelete() {
    setDeleteTarget(null)
  }

  /** 打开版本历史面板（5.3，PRD §4.5.4） */
  function openVersionPanel(node) {
    setContextMenu(null)
    setVersionPanelFor(node.relPath)
  }

  return (
    <aside className="sidebar">
      {/* 8.3 右缘拖拽调宽 */}
      <div className="sidebar__resizer" onMouseDown={onResizeDown} title="拖拽调整侧边栏宽度" />
      {/* 工作区区（侧边栏顶部） */}
      {/* 9.2.1：右键工作区区域弹切换菜单（与按钮点击同菜单） */}
      <div
        className="sidebar__workspace"
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuOpen(true)
        }}
      >
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
          onContextMenu={(e) => {
            const termItem = terminalMenuItem(null) // CC-5：开关 + CLI 置灰（仅计算一次）
            openMenu(e, [
              { label: '新建文件', onClick: () => startCreateFile('') },
              { label: '新建文件夹', onClick: () => startCreate('', 'folder') },
              ...(termItem ? [termItem] : []),
              { label: '在资源管理器中打开', onClick: () => revealInExplorer(null) },
              { label: '刷新', onClick: () => refreshTree() } // 4.5：感知外部改动
            ])
          }}
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
            {!listError && !listLoading && tree && tree.length === 0 && !creating && (
              <p className="filetree__status">工作区为空</p>
            )}
            {/* 根级新建输入行（右键顶部文件夹图标触发）；列表收起或工作区为空时同样可见 */}
            {creating?.parentRelPath === '' && (
              <div className="filetree__create-row filetree__create-row--root">
                <InlineInput
                  defaultValue={creating.type === 'folder' ? '新建文件夹' : '未命名.md'}
                  onSubmit={submitCreate}
                  onCancel={cancelCreate}
                />
              </div>
            )}
            {!listError && !listLoading && tree && tree.length > 0 && (
              <FileTree
                nodes={tree}
                editor={editor}
                onToggle={toggleFolder}
                onArrowToggle={toggleFolderRecursive}
                onContextMenu={(e, node) => {
                  const termItem = terminalMenuItem(node) // CC-5：开关 + CLI 置灰（仅计算一次）
                  openMenu(
                    e,
                    node.isDir
                      ? [
                          {
                            label: '新建文件',
                            onClick: () => startCreateFile(node.relPath)
                          },
                          {
                            label: '新建文件夹',
                            onClick: () => startCreate(node.relPath, 'folder')
                          },
                          ...(termItem ? [termItem] : []),
                          { label: '在资源管理器中打开', onClick: () => revealInExplorer(node) },
                          { label: '重命名', onClick: () => startRename(node) },
                          { label: '删除', danger: true, onClick: () => startDelete(node) },
                          { label: '刷新', onClick: () => refreshBranch(node) } // 4.5
                        ]
                      : [
                          { label: '版本历史', onClick: () => openVersionPanel(node) },
                          { label: '在资源管理器中打开', onClick: () => revealInExplorer(node) },
                          { label: '重命名', onClick: () => startRename(node) },
                          { label: '删除', danger: true, onClick: () => startDelete(node) }
                        ]
                  )
                }}
                creating={creating}
                onSubmitCreate={submitCreate}
                onCancelCreate={cancelCreate}
                renaming={renaming}
                onSubmitRename={submitRename}
                onCancelRename={cancelRename}
              />
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

      {/* 9.2.8 新建文件弹窗（先建默认名再改）：文件已创建并打开，此处改名/后缀 */}
      {newFileModal && (
        <NewFileModal
          defaultName={newFileModal.name}
          onConfirm={submitNewFileRename}
          onCancel={() => setNewFileModal(null)}
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

      {/* 切换工作区外部改动覆盖确认（P1：与设置页语义一致，防止静默丢弃未保存内容） */}
      {switchConfirm && (
        <ConfirmDialog
          title="切换工作区"
          message="有文件已被外部修改，保存被阻止。"
          warning="强制覆盖将保存当前编辑内容并切换工作区；取消则中止切换。"
          confirmLabel="强制覆盖并切换"
          confirmDanger={false}
          onConfirm={handleSwitchOverwrite}
          onCancel={() => setSwitchConfirm(null)}
        />
      )}
    </aside>
  )
}
