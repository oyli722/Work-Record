import { useEffect } from 'react'
import useTheme from './hooks/useTheme'
import useWorkspace from './stores/workspaceStore'
import WorkspaceEmpty from './components/WorkspaceEmpty'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'

// MeWork 根组件（阶段 2：主壳 + 工作区状态路由）
// 始终渲染主壳（顶栏 + 侧边栏 + 主区），主内容区按工作区状态切换：
//   无激活 → 空状态（提示选择工作区）；有激活 → 工作区内容（后续阶段填充）。
// 布局定案（2026-08-09）：顶栏（极简全局）+ 侧边栏（工作区 + 目录树）+ 主区。
export default function App() {
  const { theme, toggleTheme } = useTheme()
  const workspace = useWorkspace()

  useEffect(() => {
    // 启动恢复：有记忆路径则尝试激活；失败（路径失效）时停留在空状态
    workspace.restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const hasWorkspace = workspace.state === 'active'

  return (
    <div className="app">
      <TopBar theme={theme} onToggleTheme={toggleTheme} />
      <div className="app__body">
        <Sidebar workspace={workspace} />
        <main className="app__main">
          {hasWorkspace ? (
            <div className="app__status">
              <p className="app__hint">工作区已就绪</p>
            </div>
          ) : (
            <WorkspaceEmpty workspace={workspace} />
          )}
        </main>
      </div>
    </div>
  )
}
