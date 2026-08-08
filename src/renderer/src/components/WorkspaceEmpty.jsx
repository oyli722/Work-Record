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
      await workspace.activate(absPath) // 激活失败已由 store 置 error，统一在下方展示
    } catch (err) {
      // 兜底：chooseDirectory 等意外错误（激活失败已在 store 层记录）
      setError(String(err?.message ?? err))
    } finally {
      setBusy(false)
    }
  }

  // 展示错误：优先本地（意外错误），否则用 store 级（restore/切换/激活失败，评审 P1）
  const shownError = error || workspace.error

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

      {shownError && <p className="workspace-empty__error">{shownError}</p>}

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
