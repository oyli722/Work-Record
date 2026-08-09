// 顶栏（布局定案 2026-08-09）：极简，仅承载全局操作（标题 / 主题切换）。
// 工作区路径与切换已归入侧边栏顶部（Sidebar），此处不再放置工作区信息。
// 6.1 主题按钮：眼睛图标三态循环（用户定案）——浅色睁眼 / 深色闭眼 / 跟随系统（半睁+指示点）。
// 3.8 专注模式：浮层顶栏额外传 onExitFocus 时显示「退出专注」按钮。
export default function TopBar({ mode, onToggleTheme, onExitFocus }) {
  return (
    <header className="topbar">
      <span className="topbar__title">MeWork</span>
      <div className="topbar__right">
        <button
          type="button"
          className="topbar__theme"
          onClick={onToggleTheme}
          aria-label="切换主题模式"
          title={`主题模式：${
            mode === 'light' ? '浅色（眼睛睁开）' : mode === 'dark' ? '深色（眼睛闭上）' : '跟随系统'
          }`}
        >
          <EyeIcon state={mode} />
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

/** 眼睛图标三态（6.1 用户定案）：light 睁眼 / dark 闭眼 / auto 半睁 + 右上指示点 */
function EyeIcon({ state }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      {state === 'light' && <circle cx="12" cy="12" r="3" />}
      {state === 'dark' && <line x1="6" y1="12" x2="18" y2="12" />}
      {state === 'auto' && (
        <>
          <path d="M9.5 12a2.5 2.5 0 0 1 5 0" />
          <circle cx="21" cy="5" r="1.6" />
        </>
      )}
    </svg>
  )
}
