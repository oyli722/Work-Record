// 专注模式悬停浮层（3.8，PRD §4.2.7）
// 专注模式下主区占满全窗，此处提供「临时唤出」：
//   - 悬停窗口顶部边缘 → 顶栏浮层（主题切换 + 退出专注）
//   - 悬停窗口左侧边缘 → 侧边栏浮层（工作区 + 文件树，可点开文件）
// 交互：enter 立即显示；leave 延迟 HIDE_DELAY_MS 后隐藏（期间重新 enter 取消），
// 避免「热区 ↔ 浮层」交界处来回触发导致闪烁。
import { useCallback, useEffect, useRef, useState } from 'react'
import TopBar from './TopBar'
import Sidebar from './Sidebar'

const HIDE_DELAY_MS = 200

/** 悬停状态：enter 立即显示，leave 延迟隐藏（重新 enter 取消隐藏定时） */
function useHover() {
  const [hover, setHover] = useState(false)
  const timerRef = useRef(0)
  const enter = useCallback(() => {
    clearTimeout(timerRef.current)
    setHover(true)
  }, [])
  const leave = useCallback(() => {
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setHover(false), HIDE_DELAY_MS)
  }, [])
  // 评审 S1：卸载（退出专注）时清理 pending 定时器，避免对已卸载组件 setState
  useEffect(() => () => clearTimeout(timerRef.current), [])
  return [hover, enter, leave]
}

export default function FocusOverlay({
  mode,
  onToggleTheme,
  workspace,
  editor,
  onExitFocus,
  fileTree,
  shortcutActionsRef,
  terminalMenuEnabled
}) {
  const [showTop, topEnter, topLeave] = useHover()
  const [showLeft, leftEnter, leftLeave] = useHover()

  return (
    <div className="focus">
      {/* 顶部热区：悬停唤出顶栏 */}
      <div
        className="focus__hotzone focus__hotzone--top"
        onMouseEnter={topEnter}
        onMouseLeave={topLeave}
      />
      {/* 左侧热区：悬停唤出侧边栏 */}
      <div
        className="focus__hotzone focus__hotzone--left"
        onMouseEnter={leftEnter}
        onMouseLeave={leftLeave}
      />

      {/* 顶栏浮层（覆盖主区顶部，不挤压布局） */}
      <div
        className={`focus__panel focus__panel--top${showTop ? ' focus__panel--show' : ''}`}
        onMouseEnter={topEnter}
        onMouseLeave={topLeave}
      >
        <TopBar mode={mode} onToggleTheme={onToggleTheme} onExitFocus={onExitFocus} />
      </div>

      {/* 侧边栏浮层（覆盖主区左侧，可操作工作区/文件树） */}
      <div
        className={`focus__panel focus__panel--left${showLeft ? ' focus__panel--show' : ''}`}
        onMouseEnter={leftEnter}
        onMouseLeave={leftLeave}
      >
        <Sidebar
          workspace={workspace}
          editor={editor}
          fileTree={fileTree}
          shortcutActionsRef={shortcutActionsRef}
          terminalMenuEnabled={terminalMenuEnabled}
        />
      </div>
    </div>
  )
}
