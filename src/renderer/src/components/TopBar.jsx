// 顶栏（PRD §3.4.6 响应式：小窗口可收起）：
// 左侧标题 + 当前工作区名；右侧主题切换。
// 工作区切换菜单（最近列表 + 更换入口）折叠为下拉，避免顶栏拥挤。
import { useState } from 'react'

export default function TopBar({ workspace, theme, onToggleTheme }) {
  const [menuOpen, setMenuOpen] = useState(false)

  async function handleSwitch(absPath) {
    setMenuOpen(false)
    // 切换工作区：先取消激活当前（清空 fs 边界），再激活新路径
    await workspace.deactivate()
    const res = await workspace.activate(absPath)
    if (!res.ok) {
      // 激活失败：进入引导态由 App 状态机兜底（state 切回 idle）
      await workspace.deactivate()
    }
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
    <header className="topbar">
      <div className="topbar__left">
        <span className="topbar__title">MeWork</span>
        <span className="topbar__divider" aria-hidden="true" />
        <span className="topbar__workspace" title={workspace.activePath}>
          {workspace.activePath}
        </span>
      </div>

      <div className="topbar__right">
        <div className="topbar__menu">
          <button
            type="button"
            className="topbar__menu-btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-haspopup="menu"
          >
            工作区 ▾
          </button>
          {menuOpen && (
            <ul className="topbar__menu-pop" role="menu">
              <li role="none" className="topbar__menu-label">
                最近使用
              </li>
              {workspace.recent.length === 0 && (
                <li role="none" className="topbar__menu-empty">
                  暂无其他工作区
                </li>
              )}
              {workspace.recent
                .filter((p) => p !== workspace.activePath)
                .map((p) => (
                  <li role="none" key={p}>
                    <button
                      type="button"
                      role="menuitem"
                      className="topbar__menu-item"
                      onClick={() => handleSwitch(p)}
                      title={p}
                    >
                      {p}
                    </button>
                  </li>
                ))}
              <li role="none" className="topbar__menu-sep" />
              <li role="none">
                <button
                  type="button"
                  role="menuitem"
                  className="topbar__menu-item"
                  onClick={handleChooseNew}
                >
                  ＋ 更换工作区…
                </button>
              </li>
            </ul>
          )}
        </div>

        <button
          type="button"
          className="topbar__theme"
          onClick={onToggleTheme}
          aria-label="切换明暗主题"
          title="切换明暗主题"
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </div>
    </header>
  )
}
