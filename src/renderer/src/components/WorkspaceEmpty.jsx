// 主内容区空状态：无激活工作区时的提示（替代整页引导）
// 不占用顶栏/侧边栏；简洁居中，提供「选择工作区」主操作与最近列表（次级）。
import { useState } from 'react'

export default function WorkspaceEmpty({ workspace }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  /** 打开系统目录选择 → 激活选中目录为工作区 */
  async function handleChoose() {
    setBusy(true)
    setError(null)
    try {
      const absPath = await window.mework.fs.chooseDirectory()
      if (!absPath) return // 用户取消
      const res = await workspace.activate(absPath)
      if (!res.ok) setError(res.error)
    } catch (err) {
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="workspace-empty">
      <h2 className="workspace-empty__title">尚未选择工作区</h2>
      <p className="workspace-empty__desc">
        工作区是一个本地文件夹，你的笔记将以 Markdown 真实落盘并自动保留版本历史。
      </p>
      <button type="button" className="workspace-empty__cta" onClick={handleChoose} disabled={busy}>
        {busy ? '正在打开…' : '选择工作区文件夹'}
      </button>
      {error && <p className="workspace-empty__error">{error}</p>}

      {workspace.recent.length > 0 && (
        <div className="workspace-empty__recent">
          <p className="workspace-empty__recent-label">最近使用</p>
          <div className="workspace-empty__recent-list">
            {workspace.recent.map((p) => (
              <button
                key={p}
                type="button"
                className="workspace-empty__recent-item"
                onClick={() => workspace.activate(p)}
                title={p}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
