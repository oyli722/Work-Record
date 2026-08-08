import { useEffect } from 'react'
import useTheme from './hooks/useTheme'
import useWorkspace from './stores/workspaceStore'
import Onboarding from './components/Onboarding'
import TopBar from './components/TopBar'

// MeWork 根组件（阶段 2：工作区引导与主壳路由）
// 状态机：无激活工作区 → Onboarding（首次引导）；有激活 → 主壳（顶栏 + 内容占位）。
// 启动时 restore() 尝试恢复上次工作区（PRD §4.1.2 / §4.1.4 有效性校验）。
export default function App() {
  const { theme, toggleTheme } = useTheme()
  const workspace = useWorkspace()

  useEffect(() => {
    // 启动恢复：有记忆路径则尝试激活；失败（路径失效）时停留在引导态
    workspace.restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 无激活工作区 → 首次引导
  if (workspace.state === 'idle') {
    return (
      <div className="app">
        <Onboarding workspace={workspace} />
      </div>
    )
  }

  // 有激活工作区 → 主壳（编辑器 / 目录树后续阶段填充）
  return (
    <div className="app">
      <TopBar workspace={workspace} theme={theme} onToggleTheme={toggleTheme} />
      <main className="app__content">
        <div className="app__status">
          <p className="app__hint">工作区已就绪</p>
          <p className="app__workspace-path">{workspace.activePath}</p>
        </div>
      </main>
    </div>
  )
}
