import { useEffect, useState } from 'react'

// MeWork 根组件（阶段 1 scaffold 骨架）
// 1.3：调用 contextBridge 暴露的 window.mework.ping() 验证三进程链路连通。
// 主题切换（1.4）、编辑器（3.x）、标签页（7.x）等后续阶段在此扩展。
export default function App() {
  const [ping, setPing] = useState(null)

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
      <header className="app__topbar">MeWork</header>
      <main className="app__content">
        <div className="app__status">
          <p className="app__hint">阶段 1 · scaffold 骨架已就绪</p>
          {ping === null ? (
            <p className="app__ping app__ping--pending">fs:ping …</p>
          ) : ping.ok ? (
            <p className="app__ping app__ping--ok">
              fs:ping 连通 ✓（{ping.pong}）
            </p>
          ) : (
            <p className="app__ping app__ping--err">
              fs:ping 失败：{ping.error}
            </p>
          )}
        </div>
      </main>
    </div>
  )
}
