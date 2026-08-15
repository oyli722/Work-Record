import { useCallback, useEffect, useRef, useState } from 'react'
import useTheme from './hooks/useTheme'
import useEditorSettings from './hooks/useEditorSettings'
import useFontSettings, { FONT_STACKS } from './hooks/useFontSettings'
import useFileTree from './hooks/useFileTree'
import useWorkspace from './stores/workspaceStore'
import useEditor from './stores/editorStore'
import { getAction } from './stores/actionRegistry'
import { readOpenTabs, removeOpenTabs } from './stores/openTabsStorage'
import WorkspaceEmpty from './components/WorkspaceEmpty'
import TopBar from './components/TopBar'
import Sidebar from './components/Sidebar'
import EditorPane from './components/EditorPane'
import FocusOverlay from './components/FocusOverlay'
import SettingsModal from './components/SettingsModal'

// MeWork 根组件（阶段 2 主壳 + 阶段 3 编辑器/专注模式）
// 始终渲染主壳（顶栏 + 侧边栏 + 主区），主内容区按工作区状态切换：
//   无激活 → 空状态（提示选择工作区）；有激活 → 编辑器（打开文件后显示内容）。
// 布局定案（2026-08-09）：顶栏（极简全局）+ 侧边栏（工作区 + 文件列表）+ 主区。
// 3.8 专注模式（PRD §4.2.7）：focus 时顶栏/侧边栏/编辑器工具条隐藏、主区占满全窗，
// 悬停边缘经 FocusOverlay 临时唤出；F11 切换（仅工作区激活可用）、Esc 退出。
export default function App() {
  const { theme, mode, cycleTheme, setThemeMode } = useTheme()
  const { font, setFontMode } = useFontSettings() // 6.2 字体切换（仅 UI 字体）
  const { settings, setAutosaveEnabled, setAutosaveDelayMs, setFontSize, setTerminalMenuEnabled } =
    useEditorSettings()
  const [settingsOpen, setSettingsOpen] = useState(false) // 8.1 设置弹窗
  const workspace = useWorkspace()
  // 3.9：编辑器设置驱动 editorStore 自动保存；只传必要参数减少耦合（评审 O1），字号经 CSS 变量单独应用
  const editor = useEditor({
    autosaveEnabled: settings.autosaveEnabled,
    autosaveDelayMs: settings.autosaveDelayMs
  })
  // 9.2.6 全局快捷键（PRD §8.2 开放项 5）：动作注册表由 Sidebar/EditorPane 经 actionRegistry
  // 注册（OPT-3b：每次渲染重注册持最新闭包、卸载自动注销），App 全局 keydown 只读分发
  const editorRef = useRef(editor)
  editorRef.current = editor
  const [focus, setFocus] = useState(false)
  // 目录树状态提升到 App（3.8 评审 P1）：专注模式主/浮层 Sidebar 共享同一份状态，
  // 避免进出专注时组件实例卸载导致树数据/展开态丢失；OPT-3a 起由 useFileTree 统一管理
  // （数据 + 操作，纯函数层在 utils/file-tree.js 可单测）
  const fileTree = useFileTree({ fs: window.mework.fs })
  // 5.4 版本对比：版本面板选中版本时主区进入对比模式（{ left, right, leftLabel, rightLabel } | null）
  const [compare, setCompare] = useState(null)

  useEffect(() => {
    // 启动恢复：有记忆路径则尝试激活；失败（路径失效）时停留在空状态
    workspace.restore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 8.2 渲染层错误上报：未捕获错误 / 未处理拒绝写主进程日志（PRD §5.4）
  useEffect(() => {
    function onError(e) {
      window.mework?.log?.('error', `renderer error: ${e?.message ?? e}`)
    }
    function onRejection(e) {
      window.mework?.log?.('error', `renderer unhandledrejection: ${e?.reason ?? e}`)
    }
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  // 3.9 编辑器字号：设 CSS 变量 --font-size-editor，CodeMirror 编辑区引用（仅编辑区，预览阅读面不动）
  useEffect(() => {
    document.documentElement.style.setProperty('--font-size-editor', `${settings.fontSize}px`)
  }, [settings.fontSize])

  // 6.2 字体切换：设 --font-ui（仅 UI 字体；编辑器保持等宽 --font-mono）
  useEffect(() => {
    document.documentElement.style.setProperty('--font-ui', FONT_STACKS[font])
  }, [font])

  const isActive = workspace.state === 'active'
  // 激活中（启动恢复 / 切换）：显示恢复提示，避免首帧误显「选择工作区」（评审 S4）
  const isRestoring = workspace.state === 'activating'

  // 7.4 启动恢复：工作区激活后重新打开上次的标签列表（PRD §4.7.3）。
  // CC-3 持久化迁移（设计 §3.1/§3.6）：file 条目 openFile；terminal 条目恢复为占位 Tab（进程已随退出关闭）。
  // 串行 await 避免并发竞态（评审 P1）；恢复失败（文件被删）剔除持久化路径（评审 S3）。
  const restoredRef = useRef(false)
  useEffect(() => {
    if (isActive && !restoredRef.current) {
      restoredRef.current = true
      ;(async () => {
        for (const item of readOpenTabs()) {
          if (item.type === 'terminal') {
            editor.restoreTerminalTab({ cwdRelPath: item.cwdRelPath, title: item.title })
            continue
          }
          const r = await editor.openFile(item.relPath)
          if (!r.ok) {
            // 恢复失败（文件被删）：剔除持久化路径（评审 S3），下次启动不再尝试
            removeOpenTabs((it) => it.type === 'file' && it.relPath === item.relPath)
          }
        }
      })()
    }
  }, [isActive, editor])

  // ref 镜像最新值：供 capture 键监听（仅创建一次）在稳定闭包下读到当前状态
  const focusRef = useRef(focus)
  focusRef.current = focus
  const activeRef = useRef(isActive)
  activeRef.current = isActive

  // 专注模式快捷键（capture 确保先于 CodeMirror 消费 Esc；F11 preventDefault 防系统全屏）
  // D10 快捷键让渡：终端 Tab 激活时 F11/Esc 也直达 pty，不触发专注（原「焦点在 .terminal 内」判断由 activeTab 判定取代）
  useEffect(() => {
    function onKeydown(e) {
      if (editorRef.current.activeTab?.type === 'terminal') return
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

  // 9.2.6 应用级快捷键（PRD §8.2 开放项 5）：Ctrl+S 保存（EditorPane）/ F11、Esc 专注（上方）已有。
  // 动作经 shortcutActionsRef 分发：Ctrl+W 关闭标签 · Ctrl+Tab/Shift 切换标签 · Ctrl+\ 循环分屏模式 ·
  // Ctrl+N 新建文件 · Ctrl+Shift+N 新建文件夹 · F2 重命名当前打开文件。
  // 弹窗打开（设置/确认/新建文件）时不响应应用级快捷键，交弹窗自身处理。
  useEffect(() => {
    function onKeydown(e) {
      if (document.querySelector('.settings__mask, .confirm-dialog__mask')) return
      const ed = editorRef.current
      // D10 快捷键让渡：终端 Tab 激活时全部键盘输入（含 Ctrl+S/W/N、Ctrl+Tab 等）直达 pty，
      // MeWork 全局快捷键不拦截（关闭靠 ✕ / 右键）
      if (ed.activeTab?.type === 'terminal') return
      const mod = e.ctrlKey && !e.altKey
      if (mod && e.key === 'Tab') {
        e.preventDefault()
        const tabs = ed.tabs
        const cur = ed.activeKey
        if (tabs.length < 2 || !cur) return
        const idx = tabs.findIndex((t) => t.key === cur)
        const next = e.shiftKey ? (idx - 1 + tabs.length) % tabs.length : (idx + 1) % tabs.length
        ed.activateTab(tabs[next].key)
        return
      }
      if (mod && !e.shiftKey && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault()
        getAction('closeTab')?.()
        return
      }
      if (mod && !e.shiftKey && e.key === '\\') {
        e.preventDefault()
        getAction('cycleMode')?.()
        return
      }
      if (mod && e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        getAction('newFolder')?.()
        return
      }
      if (mod && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault()
        getAction('newFile')?.()
        return
      }
      if (e.key === 'F2') {
        // 文本输入中（重命名框/设置输入等）不触发 F2 重命名
        const ae = document.activeElement
        if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return
        e.preventDefault()
        getAction('renameActive')?.()
        return
      }
    }
    window.addEventListener('keydown', onKeydown)
    return () => window.removeEventListener('keydown', onKeydown)
  }, [])

  const toggleFocus = useCallback(() => {
    if (!isActive) return
    setFocus((f) => !f)
  }, [isActive])

  return (
    <div className={`app${focus ? ' app--focus' : ''}`}>
      {!focus && (
        <TopBar
          mode={mode}
          onToggleTheme={cycleTheme}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      )}
      <div className="app__body">
        {!focus && (
          <Sidebar
            workspace={workspace}
            editor={editor}
            fileTree={fileTree}
            onCompareChange={setCompare}
            terminalMenuEnabled={settings.terminalMenuEnabled}
          />
        )}
        <main className="app__main">
          {isActive ? (
            <EditorPane
              editor={editor}
              theme={theme}
              onToggleFocus={toggleFocus}
              compare={compare}
              fontSize={settings.fontSize}
            />
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
          mode={mode}
          onToggleTheme={cycleTheme}
          workspace={workspace}
          editor={editor}
          onExitFocus={() => setFocus(false)}
          fileTree={fileTree}
          terminalMenuEnabled={settings.terminalMenuEnabled}
        />
      )}

      {/* 8.1 设置弹窗（左侧分组导航） */}
      {settingsOpen && (
        <SettingsModal
          themeMode={mode}
          setThemeMode={setThemeMode}
          font={font}
          setFontMode={setFontMode}
          editorSettings={settings}
          setAutosaveEnabled={setAutosaveEnabled}
          setAutosaveDelayMs={setAutosaveDelayMs}
          setFontSize={setFontSize}
          setTerminalMenuEnabled={setTerminalMenuEnabled}
          workspace={workspace}
          editor={editor}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}
