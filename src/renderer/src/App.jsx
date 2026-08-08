import { useEffect, useState } from 'react'
import useTheme from './hooks/useTheme'

// MeWork 根组件（阶段 1 scaffold 骨架）
// 1.3：contextBridge 链路 fs:ping 连通自检。
// 1.4：主题 token 地基——浅/深两套 CSS 变量 + 手动切换按钮（阶段 6 扩展跟随系统）。
// 编辑器（3.x）、标签页（7.x）等后续阶段在此扩展。
export default function App() {
  const [ping, setPing] = useState(null)
  const { theme, toggleTheme } = useTheme()

  useEffect(() => {
    // 验证 contextBridge 链路：渲染进程 → preload → 主进程 → 返回
    window.mework
      .ping()
      .then((res) => {
        setPing({ ok: true, pong: res.pong })
        console.log('[ping] fs:ping 连通, pong =', res.pong)
      })
      .catch((err) => {
        setPing({ ok: false, error: String(err) })
        console.error('[ping] fs:ping 失败:', err)
      })
  }, [])

  return (
    <div className="app">
      <header className="app__topbar">
        <span className="app__title">MeWork</span>
        <button
          type="button"
          className="app__theme-toggle"
          onClick={toggleTheme}
          aria-label="切换明暗主题"
          title="切换明暗主题"
        >
          {theme === 'light' ? '🌙 深色' : '☀️ 浅色'}
        </button>
      </header>
      <main className="app__content">
        <div className="app__status">
          <p className="app__hint">阶段 1 · scaffold 骨架已就绪</p>
          {ping === null ? (
            <p className="app__ping app__ping--pending">fs:ping …</p>
          ) : ping.ok ? (
            <p className="app__ping app__ping--ok">fs:ping 连通 ✓（{ping.pong}）</p>
          ) : (
            <p className="app__ping app__ping--err">fs:ping 失败：{ping.error}</p>
          )}
        </div>
      </main>
    </div>
  )
}
