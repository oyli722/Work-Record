import { useCallback, useEffect, useRef, useState } from 'react'
import useTheme from './hooks/useTheme'
import useWorkspace from './stores/workspaceStore'
import useEditor from './stores/editorStore'
import WorkspaceEmpty from './components/WorkspaceEmpty'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import EditorPane from './components/EditorPane'
import FocusOverlay from './components/FocusOverlay'

// MeWork 根组件（阶段 2 主壳 + 阶段 3 编辑器/专注模式）
// 始终渲染主壳（顶栏 + 侧边栏 + 主区），主内容区按工作区状态切换：
//   无激活 → 空状态（提示选择工作区）；有激活 → 编辑器（打开文件后显示内容）。
// 布局定案（2026-08-09）：顶栏（极简全局）+ 侧边栏（工作区 + 文件列表）+ 主区。
// 3.8 专注模式（PRD §4.2.7）：focus 时顶栏/侧边栏/编辑器工具条隐藏、主区占满全窗，
// 悬停边缘经 FocusOverlay 临时唤出；F11 切换（仅工作区激活可用）、Esc 退出。
export default function App() {
  const { theme, toggleTheme } = useTheme()
  const workspace = useWorkspace()
  const editor = useEditor()
  const [focus, setFocus] = useState(false)
  // 目录树状态提升到 App（3.8 评审 P1）：专注模式主/浮层 Sidebar 共享同一份状态，
  // 避免进出专注时组件实例卸载导致树数据/展开态丢失；阶段 4 目录树演进同样需要状态外移。
  const [tree, setTree] = useState(null)
  const [listOpen, setListOpen] = useState(false)
  const [listError, setListError] = useState(null)
  const [listLoading, setListLoading] = useState(false)

  useEffect(() => {
    // 启动恢复：有记忆路径则尝试激活；失败（路径失效）时停留在空状态
    workspace.restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isActive = workspace.state === 'active'
  // 激活中（启动恢复 / 切换）：显示恢复提示，避免首帧误显「选择工作区」（评审 S4）
  const isRestoring = workspace.state === 'activating'

  // ref 镜像最新值：供 capture 键监听（仅创建一次）在稳定闭包下读到当前状态
  const focusRef = useRef(focus)
  focusRef.current = focus
  const activeRef = useRef(isActive)
  activeRef.current = isActive

  // 专注模式快捷键（capture 确保先于 CodeMirror 消费 Esc；F11 preventDefault 防系统全屏）
  useEffect(() => {
    function onKeydown(e) {
      if (e.key === 'F11') {
        if (!activeRef.current) return // 未激活工作区：放行 F11，不吞掉系统行为（评审 S3）
        e.preventDefault()
        setFocus((f) => !f) // 仅工作区激活时可切换（用户定案）
      } else if (e.key === 'Escape' && focusRef.current) {
        setFocus(false)
      }
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  }, [])

  const toggleFocus = useCallback(() => {
    if (!isActive) return
    setFocus((f) => !f)
  }, [isActive])

  return (
    <div className={`app${focus ? ' app--focus' : ''}`}>
      {!focus && <TopBar theme={theme} onToggleTheme={toggleTheme} />}
      <div className="app__body">
        {!focus && (
          <Sidebar
            workspace={workspace}
            editor={editor}
            tree={tree}
            setTree={setTree}
            listOpen={listOpen}
            setListOpen={setListOpen}
            listError={listError}
            setListError={setListError}
            listLoading={listLoading}
            setListLoading={setListLoading}
          />
        )}
        <main className="app__main">
          {isActive ? (
            <EditorPane editor={editor} theme={theme} onToggleFocus={toggleFocus} />
          ) : isRestoring ? (
            <div className="app__status">
              <p className="app__hint">正在恢复工作区…</p>
            </div>
          ) : (
            <WorkspaceEmpty workspace={workspace} />
          )}
        </main>
      </div>
      {focus && (
        <FocusOverlay
          theme={theme}
          onToggleTheme={toggleTheme}
          workspace={workspace}
          editor={editor}
          onExitFocus={() => setFocus(false)}
          tree={tree}
          setTree={setTree}
          listOpen={listOpen}
          setListOpen={setListOpen}
          listError={listError}
          setListError={setListError}
          listLoading={listLoading}
          setListLoading={setListLoading}
        />
      )}
    </div>
  )
}
