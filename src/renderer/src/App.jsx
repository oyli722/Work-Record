import { useEffect } from 'react'
import useTheme from './hooks/useTheme'
import useWorkspace from './stores/workspaceStore'
import useEditor from './stores/editorStore'
import WorkspaceEmpty from './components/WorkspaceEmpty'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import EditorPane from './components/EditorPane'

// MeWork 根组件（阶段 2 主壳 + 阶段 3 编辑器）
// 始终渲染主壳（顶栏 + 侧边栏 + 主区），主内容区按工作区状态切换：
//   无激活 → 空状态（提示选择工作区）；有激活 → 编辑器（打开文件后显示内容）。
// 布局定案（2026-08-09）：顶栏（极简全局）+ 侧边栏（工作区 + 文件列表）+ 主区。
export default function App() {
  const { theme, toggleTheme } = useTheme()
  const workspace = useWorkspace()
  const editor = useEditor()

  useEffect(() => {
    // 启动恢复：有记忆路径则尝试激活；失败（路径失效）时停留在空状态
    workspace.restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isActive = workspace.state === 'active'
  // 激活中（启动恢复 / 切换）：显示恢复提示，避免首帧误显「选择工作区」（评审 S4）
  const isRestoring = workspace.state === 'activating'

  return (
    <div className="app">
      <TopBar theme={theme} onToggleTheme={toggleTheme} />
      <div className="app__body">
        <Sidebar workspace={workspace} editor={editor} />
        <main className="app__main">
          {isActive ? (
            <EditorPane editor={editor} />
          ) : isRestoring ? (
            <div className="app__status">
              <p className="app__hint">正在恢复工作区…</p>
            </div>
          ) : (
            <WorkspaceEmpty workspace={workspace} />
          )}
        </main>
      </div>
    </div>
  )
}
