// 主内容区空状态（无工作区）——极简模式
// 一行可点击的提示文字，点击即打开目录选择；无实体按钮。
import { useState } from 'react'

export default function WorkspaceEmpty({ workspace }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  /** 点击提示文字 → 打开系统目录选择 → 激活为工作区 */
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
      <button
        type="button"
        className="workspace-empty__title"
        onClick={handleChoose}
        disabled={busy}
        title="选择工作区文件夹"
      >
        {busy ? '正在打开…' : '选择工作区'}
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
