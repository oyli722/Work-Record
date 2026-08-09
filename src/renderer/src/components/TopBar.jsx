// 顶栏（布局定案 2026-08-09）：极简，仅承载全局操作（标题 / 主题切换）。
// 工作区路径与切换已归入侧边栏顶部（Sidebar），此处不再放置工作区信息。
// 3.8 专注模式：浮层顶栏额外传 onExitFocus 时显示「退出专注」按钮。
export default function TopBar({ theme, onToggleTheme, onExitFocus }) {
  return (
    <header className="topbar">
      <span className="topbar__title">MeWork</span>
      <div className="topbar__right">
        <button
          type="button"
          className="topbar__theme"
          onClick={onToggleTheme}
          aria-label="切换明暗主题"
          title="切换明暗主题"
        >
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
        {onExitFocus && (
          <button
            type="button"
            className="topbar__exit-focus"
            onClick={onExitFocus}
            title="退出专注模式 (Esc)"
            aria-label="退出专注模式"
          >
            ⤢
          </button>
        )}
        {/* 设置入口在阶段 8 落地 */}
      </div>
    </header>
  )
}
