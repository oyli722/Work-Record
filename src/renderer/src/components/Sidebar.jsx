// 侧边栏（布局定案 2026-08-09）
// 顶部：当前工作区（路径 + 切换菜单）；下方：目录树区（阶段 4 落地）。
// 工作区路径在此显示，顶栏不再承载工作区信息。
import { useState } from 'react'

export default function Sidebar({ workspace }) {
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSwitch(absPath) {
    setMenuOpen(false)
    // 切换工作区：先取消激活当前（清空 fs 边界），再激活新路径
    await workspace.deactivate()
    const res = await workspace.activate(absPath)
    if (!res.ok) await workspace.deactivate() // 失败兜底回引导态
  }

  async function handleChooseNew() {
    setMenuOpen(false)
    const absPath = await window.mework.fs.chooseDirectory()
    if (!absPath) return
    await workspace.deactivate()
    const res = await workspace.activate(absPath)
    if (!res.ok) await workspace.deactivate()
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
          title={workspace.activePath}
        >
          <span className="sidebar__ws-name" title={workspace.activePath}>
            {workspace.activePath}
          </span>
          <span className="sidebar__ws-caret" aria-hidden="true">
            ▾
          </span>
        </button>

        {menuOpen && (
          <div className="sidebar__menu">
            <p className="sidebar__menu-label">最近使用</p>
            {workspace.recent.length === 0 && <p className="sidebar__menu-empty">暂无其他工作区</p>}
            {workspace.recent
              .filter((p) => p !== workspace.activePath)
              .map((p) => (
                <div key={p} className="sidebar__menu-row">
                  <button
                    type="button"
                    className="sidebar__menu-item"
                    onClick={() => handleSwitch(p)}
                    title={p}
                  >
                    {p}
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
              ))}
            <div className="sidebar__menu-sep" />
            <button type="button" className="sidebar__menu-item" onClick={handleChooseNew}>
              ＋ 更换工作区…
            </button>
          </div>
        )}
      </div>

      {/* 目录树区（阶段 4：递归展示 + 文件管理） */}
      <div className="sidebar__tree" aria-label="目录树">
        {/* 阶段 4 在此渲染目录树 */}
      </div>
    </aside>
  )
}
