// MeWork 根组件（阶段 1 scaffold 骨架）
// 本阶段仅渲染最小占位，验证三进程 + 安全基线跑通；
// 主题切换（1.4）、编辑器（3.x）、标签页（7.x）等后续阶段在此扩展。
export default function App() {
  return (
    <div className="app">
      <header className="app__topbar">MeWork</header>
      <main className="app__content">
        <p className="app__hint">阶段 1 · scaffold 骨架已就绪</p>
      </main>
    </div>
  )
}
